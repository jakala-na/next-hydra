import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { intro } from "@clack/prompts";

import { cloneStarter } from "./clone.js";
import {
  addCatalogReferences,
  loadGitHubSourceRegistryCatalog,
  loadSourceRegistryCatalog,
} from "./composition/catalog.js";
import { formatCompositionPlan } from "./composition/format.js";
import {
  installPreparedComposition,
  prepareComposition,
  validatePackageRequirementTargets,
} from "./composition/install.js";
import { planComposition, selectionFromPreset } from "./composition/planner.js";
import type {
  ProviderSlot,
  SourceRegistryCatalog,
  WorkspaceSelection,
} from "./composition/types.js";
import { PROVIDER_SLOTS } from "./composition/types.js";
import { applyTypeScriptPathAliases } from "./composition/typescript-paths.js";
import {
  applyPackageRequirements,
  applyPnpmPatches,
  removeWorkspaceTargets,
  writeWorkspaceSelection,
} from "./composition/workspace.js";
import { DEFAULT_PACKAGE_MANAGER } from "./constants.js";
import {
  ensureParentDirectory,
  isDirectoryEmpty,
  pathExists,
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
import {
  assertMaintainerDependencyCompatibility,
  assertMaintainerWorkspaceTarget,
  copyMaintainerEnvironmentFiles,
  copyMaintainerWorkspace,
  findMaintainerWorkspaceRoot,
  linkMaintainerWorkspaceSources,
  pruneMaintainerWorkspaceForProfiles,
} from "./maintainer-workspace.prototype.js";
import { promptForProvider } from "./prompts.js";
import { sanitizeStarter } from "./sanitize.js";
import type {
  CreateOptions,
  ResolvedCreateOptions,
  ScaffoldResult,
} from "./types.js";

type ScaffoldDependencies = {
  install?: (cwd: string, verbose: boolean) => Promise<void>;
};

const SHELL_NEEDS_QUOTING_REGEX = /[\s"'\\]/;
const GITHUB_SCP_REPOSITORY =
  /^(?:git@|ssh:\/\/git@)github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/;
const LEADING_SLASH = /^\//;
const GIT_SUFFIX = /\.git$/;

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

  if (await pathExists(targetPath)) {
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

async function localRepositoryPath(repoUrl: string): Promise<string | null> {
  let candidate: string;
  if (repoUrl.startsWith("file:")) {
    candidate = fileURLToPath(repoUrl);
  } else if (
    path.isAbsolute(repoUrl) ||
    repoUrl.startsWith(".") ||
    !repoUrl.includes(":")
  ) {
    candidate = path.resolve(repoUrl);
  } else {
    return null;
  }

  try {
    return (await stat(candidate)).isDirectory() ? candidate : null;
  } catch {
    return null;
  }
}

function githubRepository(repoUrl: string): string | null {
  const scpMatch = GITHUB_SCP_REPOSITORY.exec(repoUrl);
  if (scpMatch?.[1] && scpMatch[2]) {
    return `${scpMatch[1]}/${scpMatch[2]}`;
  }

  try {
    const url = new URL(repoUrl);
    if (url.hostname !== "github.com") {
      return null;
    }
    const parts = url.pathname
      .replace(LEADING_SLASH, "")
      .replace(GIT_SUFFIX, "")
      .split("/");
    return parts.length === 2 && parts[0] && parts[1]
      ? `${parts[0]}/${parts[1]}`
      : null;
  } catch {
    return null;
  }
}

async function requestedSelection(
  options: CreateOptions,
  catalog: SourceRegistryCatalog
): Promise<WorkspaceSelection> {
  const webProfile = options.webProfile
    ? options.webProfile.includes("/")
      ? options.webProfile
      : `app-web-${options.webProfile}`
    : undefined;
  const without = new Set<ProviderSlot>();
  for (const slot of options.without ?? []) {
    if (!(PROVIDER_SLOTS as readonly string[]).includes(slot)) {
      throw new Error(
        `Unknown provider slot \`${slot}\`. Expected auth, cms, or commerce.`
      );
    }
    without.add(slot as ProviderSlot);
  }
  const providerOptions = {
    auth: options.auth,
    cms: options.cms,
    commerce: options.commerce,
  } satisfies Partial<Record<ProviderSlot, string>>;
  const conflicts = PROVIDER_SLOTS.filter(
    (slot) => without.has(slot) && providerOptions[slot]
  );
  if (conflicts.length > 0) {
    throw new Error(
      `Provider slots cannot be both selected and empty: ${conflicts.join(", ")}.`
    );
  }

  if (
    options.preset &&
    (options.auth ||
      options.cms ||
      options.commerce ||
      options.webProfile ||
      without.size > 0)
  ) {
    throw new Error(
      "`--preset` cannot be combined with app profile, provider, or `--without` flags."
    );
  }

  if (options.preset) {
    const preset = selectionFromPreset(catalog, options.preset);
    return {
      ...preset,
      addOns: [...new Set([...preset.addOns, ...(options.addOns ?? [])])],
    };
  }

  if (options.yes && webProfile && !options.cms) {
    throw new Error("`--yes --web-profile` requires `--cms`.");
  }

  if (
    options.yes &&
    !webProfile &&
    PROVIDER_SLOTS.some(
      (slot) => !(providerOptions[slot] || without.has(slot))
    )
  ) {
    throw new Error(
      "`--yes` requires every provider slot to be selected or explicitly left empty with `--without`, or one `--preset`."
    );
  }

  const providers: Partial<Record<ProviderSlot, string>> = {};
  for (const slot of PROVIDER_SLOTS) {
    if (webProfile && slot !== "cms" && !providerOptions[slot]) {
      continue;
    }
    if (without.has(slot)) {
      continue;
    }
    const fallback =
      slot === "auth" ? "workos" : slot === "cms" ? "drupal" : "commercetools";
    providers[slot] =
      providerOptions[slot] ?? (await promptForProvider(slot, fallback));
  }

  return {
    addOns: options.addOns ?? [],
    apps: webProfile ? { web: webProfile } : {},
    providers,
  };
}

function explicitSelectionReferences(options: CreateOptions): string[] {
  return [
    options.auth,
    options.cms,
    options.commerce,
    options.webProfile
      ? options.webProfile.includes("/")
        ? options.webProfile
        : `app-web-${options.webProfile}`
      : undefined,
    options.preset,
    ...(options.addOns ?? []),
  ].filter((value): value is string => Boolean(value));
}

function scaffoldFailure(
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

  const spin = createSpinner();
  const { repoUrl, ref, commit, verbose } = options;
  const skipGit = options.maintainerWorkspace || options.skipGit;
  if (!options.targetDir) {
    throw new Error("Missing target directory.");
  }

  spin.start("Checking git availability");
  try {
    await ensureGitInstalled(verbose);
    spin.stop("Git detected");
  } catch (error) {
    spin.stop("Git not available");
    throw new Error(
      "Git is required to scaffold a project. Please install git and try again.",
      { cause: error }
    );
  }

  const maintainerSourcePath = options.maintainerWorkspace
    ? await findMaintainerWorkspaceRoot(process.cwd())
    : undefined;
  const effectiveRepoUrl = maintainerSourcePath ?? repoUrl;
  const sourcePath = await localRepositoryPath(effectiveRepoUrl);
  const remoteRepository = sourcePath ? null : githubRepository(repoUrl);
  let sourceCatalog: SourceRegistryCatalog;
  if (sourcePath) {
    sourceCatalog = await loadSourceRegistryCatalog(sourcePath);
  } else if (remoteRepository) {
    sourceCatalog = await loadGitHubSourceRegistryCatalog(
      remoteRepository,
      ref
    );
  } else {
    throw new Error(
      "Composition preflight supports a local starter path or a public GitHub repository. Use one of those forms with `--repo-url`."
    );
  }
  sourceCatalog = await addCatalogReferences(
    sourceCatalog,
    explicitSelectionReferences(options),
    process.cwd()
  );
  const selection = await requestedSelection(options, sourceCatalog);
  sourceCatalog = await addCatalogReferences(
    sourceCatalog,
    [...Object.values(selection.providers), ...selection.addOns],
    process.cwd()
  );
  planComposition(sourceCatalog, selection);

  const { targetPath, targetName } = await resolveAndValidateTarget(
    options.targetDir
  );
  if (maintainerSourcePath) {
    assertMaintainerWorkspaceTarget(maintainerSourcePath, targetPath);
  }
  const prepareSourceLabel = maintainerSourcePath
    ? "copy the maintainer workspace"
    : "clone the starter";
  const completed: string[] = [];
  const pending = [
    prepareSourceLabel,
    "resolve the composition",
    "remove variable provider source",
    "install selected source",
    "update package aliases",
    "update TypeScript paths",
    "update pnpm patches",
    ...(maintainerSourcePath && Object.keys(selection.apps ?? {}).length > 0
      ? ["prune unselected applications and packages"]
      : []),
    "remove maintainer-only files",
    ...(maintainerSourcePath ? ["copy local environment files"] : []),
    "install dependencies",
    ...(maintainerSourcePath ? ["link maintainer source"] : []),
    "initialize Git",
  ];
  let currentStep = prepareSourceLabel;

  const runStep = async <T>(label: string, operation: () => Promise<T>) => {
    currentStep = label;
    pending.shift();
    const result = await operation();
    completed.push(label);
    return result;
  };

  try {
    spin.start(
      maintainerSourcePath
        ? "Copying the maintainer workspace"
        : "Cloning next-hydra starter"
    );
    await runStep(prepareSourceLabel, async () => {
      if (maintainerSourcePath) {
        await copyMaintainerWorkspace(maintainerSourcePath, targetPath);
        return;
      }
      await cloneStarter({
        ref,
        repoUrl: effectiveRepoUrl,
        targetPath,
        verbose,
      });
    });
    spin.stop(
      maintainerSourcePath ? "Maintainer workspace copied" : "Starter cloned"
    );

    spin.start("Resolving workspace composition");
    const { catalog, plan, prepared } = await runStep(
      "resolve the composition",
      async () => {
        let targetCatalog = await loadSourceRegistryCatalog(targetPath);
        targetCatalog = await addCatalogReferences(
          targetCatalog,
          [
            ...explicitSelectionReferences(options),
            ...Object.values(selection.providers),
            ...selection.addOns,
          ],
          process.cwd()
        );
        const targetPlan = planComposition(targetCatalog, selection);
        const targetPrepared = await prepareComposition(
          targetCatalog,
          targetPlan
        );
        await validatePackageRequirementTargets(
          targetPath,
          targetPlan,
          targetPrepared,
          targetPlan.variableTargets
        );
        return {
          catalog: targetCatalog,
          plan: targetPlan,
          prepared: targetPrepared,
        };
      }
    );
    spin.stop("Composition resolved");
    info(formatCompositionPlan(plan));

    spin.start("Removing unselected provider source");
    await runStep("remove variable provider source", async () => {
      await removeWorkspaceTargets(targetPath, plan.variableTargets);
    });
    spin.stop("Variable provider source removed");

    spin.start("Installing selected provider source");
    await runStep("install selected source", async () => {
      await installPreparedComposition(targetPath, prepared);
    });
    spin.stop("Selected provider source installed");

    await runStep("update package aliases", async () => {
      await applyPackageRequirements(targetPath, plan);
    });
    await runStep("update TypeScript paths", async () => {
      await applyTypeScriptPathAliases(targetPath, plan);
    });
    await runStep("update pnpm patches", async () => {
      await applyPnpmPatches(targetPath, plan);
      if (maintainerSourcePath) {
        await assertMaintainerDependencyCompatibility(
          maintainerSourcePath,
          targetPath
        );
      }
    });
    const removedPaths =
      maintainerSourcePath && Object.keys(selection.apps ?? {}).length > 0
        ? await runStep(
            "prune unselected applications and packages",
            async () =>
              pruneMaintainerWorkspaceForProfiles({
                selectedItems: plan.registryItems,
                selection,
                sourceRoot: maintainerSourcePath,
                targetRoot: targetPath,
              })
          )
        : [];
    if (removedPaths.length > 0) {
      info(
        `Pruned ${removedPaths.length} unselected application and package roots.`
      );
    }
    spin.start("Removing maintainer-only files");
    const { packageName } = await runStep(
      "remove maintainer-only files",
      async () => {
        const result = await sanitizeStarter({
          registryAuthoringPaths: catalog.authoringPaths,
          targetName,
          targetPath,
        });
        await removeWorkspaceTargets(targetPath, catalog.authoringPaths);
        return result;
      }
    );
    spin.stop("Maintainer-only files removed");

    const environmentFiles = maintainerSourcePath
      ? await runStep("copy local environment files", async () =>
          copyMaintainerEnvironmentFiles(maintainerSourcePath, targetPath)
        )
      : [];
    if (environmentFiles.length > 0) {
      info(
        `Copied ${environmentFiles.length} ignored local environment file${environmentFiles.length === 1 ? "" : "s"}.`
      );
    }

    if (maintainerSourcePath) {
      await writeWorkspaceSelection(targetPath, selection);
    }

    spin.start("Installing dependencies");
    await runStep("install dependencies", async () => {
      if (dependencies.install) {
        await dependencies.install(targetPath, verbose);
        return;
      }
      await runCommand(DEFAULT_PACKAGE_MANAGER, ["install"], {
        cwd: targetPath,
        verbose,
      });
    });
    spin.stop("Dependencies installed");

    if (maintainerSourcePath) {
      const linkCount = await runStep("link maintainer source", async () =>
        linkMaintainerWorkspaceSources({
          environmentFiles,
          removedPaths,
          selectedItems: plan.registryItems,
          selection,
          sourceRoot: maintainerSourcePath,
          targetRoot: targetPath,
        })
      );
      info(`Linked ${linkCount} paths to the maintainer source workspace.`);
    }

    let gitInitialized = false;
    let committed = false;
    if (skipGit) {
      pending.shift();
      completed.push("skip Git initialization");
      info("Skipped git initialization (--skip-git).");
    } else {
      spin.start(
        commit
          ? "Initializing git repo and creating initial commit"
          : "Initializing git repo"
      );
      const gitResult = await runStep(
        "initialize Git",
        async () =>
          await initializeGitRepository(targetPath, { commit, verbose })
      );
      ({ committed, gitInitialized } = gitResult);
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
    printInstructions([
      ...(plan.instructions.length > 0
        ? [
            {
              entries: plan.instructions.map((text) => ({
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
          {
            command: `${DEFAULT_PACKAGE_MANAGER} dev`,
            kind: "command",
          },
        ],
        title: "Next steps",
      },
    ]);
    success(`Created project in ${displayTarget}`);
    finish("Scaffold complete.");

    return {
      committed,
      gitInitialized,
      packageName,
      projectPath: targetPath,
    };
  } catch (error) {
    throw scaffoldFailure(error, targetPath, currentStep, completed, pending);
  }
}
