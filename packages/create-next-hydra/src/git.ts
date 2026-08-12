import { spawn } from "node:child_process";
import { DEFAULT_COMMIT_MESSAGE } from "./constants.js";
import { formatCommand } from "./logger.js";
import type { GitInitResult, RunCommandResult } from "./types.js";

type RunCommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  verbose?: boolean;
};

export class CommandExecutionError extends Error {
  readonly command: string;
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;

  constructor(params: {
    command: string;
    code: number | null;
    stdout: string;
    stderr: string;
    message?: string;
  }) {
    super(params.message ?? `Command failed: ${params.command}`);
    this.name = "CommandExecutionError";
    this.command = params.command;
    this.code = params.code;
    this.stdout = params.stdout;
    this.stderr = params.stderr;
  }
}

export async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {}
): Promise<RunCommandResult> {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    stdout += text;
    if (options.verbose) {
      process.stdout.write(text);
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    stderr += text;
    if (options.verbose) {
      process.stderr.write(text);
    }
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  }).catch((error: unknown) => {
    throw new CommandExecutionError({
      code: null,
      command: formatCommand(command, args),
      message:
        error instanceof Error ? error.message : "Failed to start command",
      stderr,
      stdout,
    });
  });

  if (exitCode !== 0) {
    throw new CommandExecutionError({
      code: exitCode,
      command: formatCommand(command, args),
      stderr,
      stdout,
    });
  }

  return { stderr, stdout };
}

export function runGit(
  args: string[],
  options: RunCommandOptions = {}
): Promise<RunCommandResult> {
  return runCommand("git", args, {
    ...options,
    env: {
      GIT_TERMINAL_PROMPT: "0",
      ...options.env,
    },
  });
}

export async function ensureGitInstalled(verbose = false): Promise<void> {
  await runGit(["--version"], { verbose });
}

export async function initializeGitRepository(
  targetPath: string,
  options: { commit: boolean; verbose?: boolean }
): Promise<GitInitResult> {
  const verbose = options.verbose ?? false;

  await runGit(["init"], { cwd: targetPath, verbose });

  if (!options.commit) {
    return {
      committed: false,
      gitInitialized: true,
    };
  }

  await runGit(["add", "-A"], { cwd: targetPath, verbose });

  try {
    await runGit(["commit", "-m", DEFAULT_COMMIT_MESSAGE], {
      cwd: targetPath,
      verbose,
    });

    return {
      committed: true,
      gitInitialized: true,
    };
  } catch (error) {
    if (error instanceof CommandExecutionError) {
      return {
        commitError:
          error.stderr.trim() || error.stdout.trim() || error.message,
        committed: false,
        gitInitialized: true,
      };
    }

    throw error;
  }
}
