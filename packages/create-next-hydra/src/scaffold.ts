import path from "node:path";
import { intro } from "@clack/prompts";

import { cloneStarter } from "./clone.js";
import { DEFAULT_PACKAGE_MANAGER } from "./constants.js";
import {
  ensureParentDirectory,
  isDirectoryEmpty,
  pathExists,
  removePath,
  toDisplayPath,
} from "./fs-utils.js";
import {
  CommandExecutionError,
  ensureGitInstalled,
  initializeGitRepository,
} from "./git.js";
import {
  createSpinner,
  finish,
  info,
  printNextSteps,
  success,
  warn,
} from "./logger.js";
import { sanitizeStarter } from "./sanitize.js";
import type {
  CreateOptions,
  ResolvedCreateOptions,
  ScaffoldResult,
} from "./types.js";

const SHELL_NEEDS_QUOTING_REGEX = /[\s"'\\]/;

function quotePathForShell(value: string): string {
  if (!SHELL_NEEDS_QUOTING_REGEX.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

async function resolveAndValidateTarget(inputTargetDir: string): Promise<
  Pick<ResolvedCreateOptions, "targetDir" | "targetName" | "targetPath"> & {
    existedBefore: boolean;
  }
> {
  const targetDir = inputTargetDir.trim();
  const targetPath = path.resolve(process.cwd(), targetDir);
  const targetName = path.basename(targetPath);

  if (!targetName) {
    throw new Error("Please provide a valid target folder.");
  }

  const existedBefore = await pathExists(targetPath);

  if (existedBefore) {
    const isEmpty = await isDirectoryEmpty(targetPath);
    if (!isEmpty) {
      throw new Error(
        `Target directory is not empty: ${toDisplayPath(targetPath)}`
      );
    }
  } else {
    await ensureParentDirectory(targetPath);
  }

  return { targetDir, targetName, targetPath, existedBefore };
}

function formatGitError(error: CommandExecutionError): string {
  const isCloneCommand = error.command.startsWith("git clone ");
  const stderr = error.stderr.trim();
  if (stderr) {
    if (!isCloneCommand) {
      return `${error.command}\n\n${stderr}`;
    }

    return [
      error.command,
      "",
      stderr,
      "",
      "Hint: If the starter repo is private or you are testing locally, use `--repo-url`.",
      "Example: create-next-hydra my-app --repo-url /path/to/next-hydra",
    ].join("\n");
  }

  const stdout = error.stdout.trim();
  if (stdout) {
    if (!isCloneCommand) {
      return `${error.command}\n\n${stdout}`;
    }

    return [
      error.command,
      "",
      stdout,
      "",
      "Hint: If the starter repo is private or you are testing locally, use `--repo-url`.",
      "Example: create-next-hydra my-app --repo-url /path/to/next-hydra",
    ].join("\n");
  }

  return `${error.command}\n\n${error.message}`;
}

export async function scaffoldProject(
  options: CreateOptions
): Promise<ScaffoldResult> {
  intro("create-next-hydra");

  const spin = createSpinner();
  const { repoUrl, ref, skipGit, commit, verbose } = options;
  const targetDir = options.targetDir;

  if (!targetDir) {
    throw new Error("Missing target directory.");
  }

  spin.start("Checking git availability");
  try {
    await ensureGitInstalled(verbose);
    spin.stop("Git detected");
  } catch {
    spin.stop("Git not available");
    throw new Error(
      "Git is required to scaffold a project. Please install git and try again."
    );
  }

  const { targetPath, targetName, existedBefore } =
    await resolveAndValidateTarget(targetDir);
  let cloneCompleted = false;

  try {
    spin.start("Cloning next-hydra starter");
    await cloneStarter({
      repoUrl,
      targetPath,
      ref,
      verbose,
    });
    cloneCompleted = true;
    spin.stop("Starter cloned");

    spin.start("Sanitizing starter");
    const { packageName } = await sanitizeStarter({ targetPath, targetName });
    spin.stop("Starter sanitized");

    let gitInitialized = false;
    let committed = false;

    if (skipGit) {
      info("Skipped git initialization (--skip-git).");
    } else {
      spin.start(
        commit
          ? "Initializing git repo and creating initial commit"
          : "Initializing git repo"
      );
      const gitResult = await initializeGitRepository(targetPath, {
        commit,
        verbose,
      });
      gitInitialized = gitResult.gitInitialized;
      committed = gitResult.committed;
      spin.stop(
        committed
          ? "Git repo initialized with initial commit"
          : "Git repo initialized"
      );

      if (gitResult.commitError) {
        warn(
          `Project was scaffolded, but the initial commit failed. You can commit manually.\n${gitResult.commitError}`
        );
      }
    }

    const displayTarget = toDisplayPath(targetPath);
    const cdTarget = quotePathForShell(displayTarget);

    printNextSteps(
      [
        `cd ${cdTarget}`,
        `${DEFAULT_PACKAGE_MANAGER} install`,
        `${DEFAULT_PACKAGE_MANAGER} dev`,
      ].join("\n")
    );
    success(`Created project in ${displayTarget}`);
    finish("Scaffold complete.");

    return {
      projectPath: targetPath,
      packageName,
      gitInitialized,
      committed,
    };
  } catch (error) {
    if (cloneCompleted === false && existedBefore === false) {
      await removePath(targetPath);
    }

    if (error instanceof CommandExecutionError) {
      throw new Error(formatGitError(error));
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Failed to scaffold project.");
  }
}
