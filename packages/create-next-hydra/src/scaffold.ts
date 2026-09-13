import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { intro } from "@clack/prompts";

import { cloneStarter } from "./clone.js";
import {
  addCatalogReferences,
  loadSourceRegistryCatalog,
} from "./composition/catalog.js";
import { planComposition, selectionFromPreset } from "./composition/planner.js";
import type {
  ProviderSlot,
  SourceRegistryCatalog,
  WorkspaceSelection,
} from "./composition/types.js";
import { PROVIDER_SLOTS } from "./composition/types.js";
import { DEFAULT_PACKAGE_MANAGER } from "./constants.js";
import {
  ensureParentDirectory,
  isDirectoryEmpty,
  toDisplayPath,
} from "./fs-utils.js";
import {
  CommandExecutionError,
  ensureGitInstalled,
  initializeGitRepository,
  runCommand,
} from "./git.js";
import {
  createSpinner,
  finish,
  info,
  printInstructions,
  success,
  warn,
} from "./logger.js";
import { promptForProvider } from "./prompts.js";
import type {
  CreateOptions,
  ResolvedCreateOptions,
  ScaffoldResult,
} from "./types.js";
import { constructWorkspace } from "./workspace-construction.js";
import { assertDirectoryPath } from "./workspace-files.js";

type ScaffoldDependencies = {
  install?: (cwd: string, verbose: boolean) => Promise<void>;
};
const SHELL_NEEDS_QUOTING_REGEX = /[\s"'\\]/u;
function quotePathForShell(value: string): string {
  if (!SHELL_NEEDS_QUOTING_REGEX.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

async function resolveAndValidateTarget(
  inputTargetDir: string
): Promise<
  Pick<ResolvedCreateOptions, "targetDir" | "targetName" | "targetPath">
> {
  const targetDir = inputTargetDir.trim();
  const targetPath = path.resolve(process.cwd(), targetDir);
  const targetName = path.basename(targetPath);

  if (!targetName) {
    throw new Error("Please provide a valid target folder.");
  }

  if (await assertDirectoryPath(targetPath)) {
    const isEmpty = await isDirectoryEmpty(targetPath);
    if (!isEmpty) {
      throw new Error(
        `Target directory is not empty: ${toDisplayPath(targetPath)}`
      );
    }
  } else {
    await ensureParentDirectory(targetPath);
  }

  return { targetDir, targetName, targetPath };
}

function formatGitError(error: CommandExecutionError): string {
  const stderr = error.stderr.trim();
  const stdout = error.stdout.trim();
  const detail = stderr || stdout || error.message;
  const hint = error.command.startsWith("git clone ")
    ? [
        "",
        "Hint: If the starter repo is private or you are testing locally, use `--repo-url`.",
        "Example: create-next-hydra my-app --repo-url /path/to/next-hydra",
      ]
    : [];

  return [error.command, "", detail, ...hint].join("\n");
}

async function requestedSelection(
  options: CreateOptions,
  catalog: SourceRegistryCatalog
): Promise<WorkspaceSelection> {
  const without = new Set<ProviderSlot>();
  for (const slot of options.without ?? []) {
    const providerSlot = PROVIDER_SLOTS.find((candidate) => candidate === slot);
    if (!providerSlot) {
      throw new Error(
        `Unknown provider slot \`${slot}\`. Expected auth, cms, or commerce.`
      );
    }
    without.add(providerSlot);
  }
  const providerOptions = {
    auth: options.auth,
    cms: options.cms,
    commerce: options.commerce,
  } satisfies Partial<Record<ProviderSlot, string>>;
  const conflicts = PROVIDER_SLOTS.filter(
    (slot) => without.has(slot) && Boolean(providerOptions[slot])
  );
  if (conflicts.length > 0) {
    throw new Error(
      `Provider slots cannot be both selected and empty: ${conflicts.join(", ")}.`
    );
  }

  if (
    options.preset &&
    (options.auth || options.cms || options.commerce || without.size > 0)
  ) {
    throw new Error(
      "`--preset` cannot be combined with provider, or `--without` flags."
    );
  }

  if (options.preset) {
    const preset = selectionFromPreset(catalog, options.preset);
    return {
      ...preset,
      addOns: [...new Set([...preset.addOns, ...(options.addOns ?? [])])],
    };
  }

  if (
    options.yes &&
    PROVIDER_SLOTS.some((slot) => !providerOptions[slot] && !without.has(slot))
  ) {
    throw new Error(
      "`--yes` requires every provider slot to be selected or explicitly left empty with `--without`, or one `--preset`."
    );
  }

  const providers: Partial<Record<ProviderSlot, string>> = {};
  for (const slot of PROVIDER_SLOTS) {
    if (without.has(slot)) {
      continue;
    }
    const fallback = {
      auth: "workos",
      cms: "drupal",
      commerce: "commercetools",
    }[slot];
    providers[slot] =
      // oxlint-disable-next-line no-await-in-loop -- Interactive provider prompts must be presented one at a time.
      providerOptions[slot] ?? (await promptForProvider(slot, fallback));
  }

  return {
    addOns: options.addOns ?? [],
    providers,
  };
}

function explicitSelectionReferences(options: CreateOptions): string[] {
  return [
    options.auth,
    options.cms,
    options.commerce,
    options.preset,
    ...(options.addOns ?? []),
  ].filter((value): value is string => Boolean(value));
}

function scaffoldFailure(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Caught exceptions are untrusted; this boundary narrows Error and CommandExecutionError before reading their fields.
  error: unknown,
  targetPath: string,
  failedStep: string,
  completed: string[],
  pending: string[]
): Error {
  let cause = String(error);
  if (error instanceof Error) {
    cause = error.message;
  }
  if (error instanceof CommandExecutionError) {
    cause = formatGitError(error);
  }

  return new Error(
    [
      `Scaffolding stopped while ${failedStep}.`,
      `Target: ${targetPath}`,
      `Completed: ${completed.length > 0 ? completed.join(", ") : "none"}.`,
      `Not attempted: ${pending.length > 0 ? pending.join(", ") : "none"}.`,
      "The partial project has been left exactly as it stands for inspection or repair.",
      "",
      cause,
    ].join("\n"),
    { cause: error }
  );
}

export async function scaffoldProject(
  options: CreateOptions,
  dependencies: ScaffoldDependencies = {}
): Promise<ScaffoldResult> {
  intro("create-next-hydra");
  if (!options.targetDir) {
    throw new Error("Missing target directory.");
  }
  const { targetPath, targetName } = await resolveAndValidateTarget(
    options.targetDir
  );
  await ensureGitInstalled(options.verbose);
  const spin = createSpinner();
  const temporary = await mkdtemp(path.join(tmpdir(), "workspace-source-"));
  const sourceRoot = path.join(temporary, "source");
  const completed: string[] = [];
  const pending = [
    "acquire source",
    "resolve the composition",
    "construct workspace",
    "install dependencies",
    "initialize Git",
  ];
  let currentStep = "acquire source";
  const runStep = async <T>(label: string, operation: () => Promise<T>) => {
    currentStep = label;
    pending.shift();
    const result = await operation();
    completed.push(label);
    return result;
  };
  try {
    spin.start("Acquiring workspace source");
    await runStep("acquire source", async () => {
      await cloneStarter({
        ref: options.ref,
        repoUrl: options.repoUrl,
        targetPath: sourceRoot,
        verbose: options.verbose,
      });
    });
    spin.stop("Source acquired");
    const { catalog, selection } = await runStep(
      "resolve the composition",
      async () => {
        let sourceCatalog = await addCatalogReferences(
          await loadSourceRegistryCatalog(sourceRoot),
          explicitSelectionReferences(options),
          process.cwd()
        );
        const requested = await requestedSelection(options, sourceCatalog);
        sourceCatalog = await addCatalogReferences(
          sourceCatalog,
          [...Object.values(requested.providers), ...requested.addOns],
          process.cwd()
        );
        return {
          catalog: sourceCatalog,
          selection: planComposition(sourceCatalog, requested).selection,
        };
      }
    );
    const constructed = await runStep(
      "construct workspace",
      async () =>
        await constructWorkspace(targetPath, {
          allowEmpty: true,
          catalog,
          install: false,
          name: targetName,
          report: info,
          selection,
        })
    );
    spin.start("Installing dependencies");
    await runStep("install dependencies", async () => {
      await (dependencies.install
        ? dependencies.install(targetPath, options.verbose)
        : runCommand(
            DEFAULT_PACKAGE_MANAGER,
            ["install", "--no-frozen-lockfile"],
            { cwd: targetPath, verbose: options.verbose }
          ));
    });
    spin.stop("Dependencies installed");
    let gitInitialized = false;
    let committed = false;
    if (options.skipGit) {
      pending.shift();
      completed.push("skip Git initialization");
    } else {
      const result = await runStep(
        "initialize Git",
        async () =>
          await initializeGitRepository(targetPath, {
            commit: options.commit,
            verbose: options.verbose,
          })
      );
      ({ gitInitialized, committed } = result);
      if (result.commitError) {
        warn(
          `Project was scaffolded, but the initial commit failed. You can commit manually.\n${result.commitError}`
        );
      }
    }
    const displayTarget = toDisplayPath(targetPath);
    printInstructions([
      ...(constructed.instructions.length
        ? [
            {
              entries: constructed.instructions.map((text) => ({
                kind: "text" as const,
                text,
              })),
              title: "Provider setup",
            },
          ]
        : []),
      {
        entries: [
          {
            command: `cd ${quotePathForShell(displayTarget)}`,
            kind: "command",
          },
          { command: `${DEFAULT_PACKAGE_MANAGER} dev`, kind: "command" },
        ],
        title: "Next steps",
      },
    ]);
    success(`Created project in ${displayTarget}`);
    finish("Scaffold complete.");
    return {
      committed,
      gitInitialized,
      packageName: constructed.packageName,
      projectPath: targetPath,
    };
  } catch (error) {
    spin.stop("Scaffolding stopped");
    throw scaffoldFailure(error, targetPath, currentStep, completed, pending);
  } finally {
    // Only the exclusively created source cache is removed; never partial customer output.
    await rm(temporary, { force: true, recursive: true });
  }
}
