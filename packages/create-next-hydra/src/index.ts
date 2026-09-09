import { Command, Option } from "commander";

import { composeWorkspace } from "./compose.js";
import type { ComposeOptions } from "./compose.js";
import { addRegistryItem } from "./composition/add.js";
import type { ProviderSlot } from "./composition/types.js";
import { CLI_NAME, DEFAULT_REPO_URL } from "./constants.js";
import { composeDevelopmentWorkspaces } from "./development-workspaces.js";
import type { DevelopmentWorkspaceOptions } from "./development-workspaces.js";
import { promptForTargetDirectory } from "./prompts.js";
import { scaffoldProject } from "./scaffold.js";
import type { CreateOptions } from "./types.js";
import { CLI_VERSION } from "./version.js";

type CliActionOptions = {
  yes?: boolean;
  skipGit?: boolean;
  commit?: boolean;
  maintainerWorkspace?: boolean;
  ref?: string;
  repoUrl?: string;
  verbose?: boolean;
  auth?: string;
  cms?: string;
  commerce?: string;
  addOn?: string[];
  without?: ProviderSlot[];
  preset?: string;
};

type CliDependencies = {
  composeDevelopmentWorkspaces?: typeof composeDevelopmentWorkspaces;
};

function rejectRetiredCommand(target: string | undefined): void {
  if (target === "use") {
    throw new Error(
      "The use command has been removed. Define workspaces/<name>/next-hydra.json and run create-next-hydra compose <name> (or compose --all --check). The source checkout is no longer recomposed in place."
    );
  }
}

function buildCreateOptions(
  targetDir: string,
  rawOptions: CliActionOptions
): CreateOptions {
  return {
    addOns: rawOptions.addOn,
    auth: rawOptions.auth,
    cms: rawOptions.cms,
    commerce: rawOptions.commerce,
    commit: rawOptions.commit ?? true,
    maintainerWorkspace: rawOptions.maintainerWorkspace ?? false,
    preset: rawOptions.preset,
    ref: rawOptions.ref,
    repoUrl: rawOptions.repoUrl ?? DEFAULT_REPO_URL,
    skipGit:
      (rawOptions.maintainerWorkspace ?? false) ||
      (rawOptions.skipGit ?? false),
    targetDir,
    verbose: rawOptions.verbose ?? false,
    without: rawOptions.without,
    yes: rawOptions.yes ?? false,
  };
}

export async function runCli(
  argv = process.argv,
  dependencies: CliDependencies = {}
): Promise<void> {
  // Reserve the retired name so old scripts cannot accidentally scaffold a project named "use".
  rejectRetiredCommand(argv[2]);
  const program = new Command().enablePositionalOptions();

  program
    .command("compose")
    .description(
      "Initialize or update named development workspaces from local sources"
    )
    .argument(
      "[name-or-directory]",
      "Named workspace, or a new output directory when using --cms"
    )
    .option(
      "--all",
      "Initialize or update every workspaces/*/next-hydra.json definition"
    )
    .option(
      "--check",
      "Report pending changes, local edits and unregistered files without applying"
    )
    .option(
      "--explain <file>",
      "Show the selected owner and canonical edit location for a workspace-relative file without updating"
    )
    .addOption(
      new Option(
        "--run <task>",
        "Refresh, then run a task inside the named workspace"
      ).choices(["dev", "build", "test", "typecheck"])
    )
    .option(
      "--watch",
      "Refresh named workspaces when templates or definitions change"
    )
    .option(
      "--cms <provider>",
      "Create an ad-hoc output: contentstack or drupal"
    )
    .option(
      "--commerce <provider>",
      "Include the complete Commerce package, API and admin (requires --auth)"
    )
    .option(
      "--auth <provider>",
      "WorkOS or Clerk authentication (required with Commerce)"
    )
    .option("--linked", "Link ordinary source files to the maintainer checkout")
    .option("--search", "Include CMS navigation search in both headers")
    .option(
      "--copy-env",
      "Copy ignored local environment files into matching paths"
    )
    .option("--no-install", "Compose files without installing dependencies")
    .option("--offline", "Install only from the local pnpm store")
    .action(
      async (
        directory: string | undefined,
        options: ComposeOptions & DevelopmentWorkspaceOptions
      ) => {
        if (options.cms) {
          if (
            !directory ||
            options.all ||
            options.check ||
            options.watch ||
            options.explain ||
            options.run
          ) {
            throw new Error(
              "Ad-hoc --cms output requires a new directory and cannot use --all, --check, --watch, --explain or --run. Use a named definition for refreshable workspaces."
            );
          }
          await composeWorkspace(directory, options);
        } else {
          if (
            options.auth ||
            options.commerce ||
            options.search ||
            options.linked
          ) {
            throw new Error(
              "Select providers and add-ons in the named workspace's next-hydra.json. Named workspaces are linked automatically."
            );
          }
          await (
            dependencies.composeDevelopmentWorkspaces ??
            composeDevelopmentWorkspaces
          )(directory, options);
        }
      }
    );

  program
    .name(CLI_NAME)
    .description(
      "Compose a customer-owned application from the Next Hydra registry"
    )
    .argument("[project-directory]", "Target directory")
    .option("-y, --yes", "Skip prompts (requires [project-directory])")
    .option("--skip-git", "Skip git initialization")
    .option(
      "--maintainer-workspace",
      "Compose from and link sources to the current maintainer checkout"
    )
    .option("--no-commit", "Initialize git but skip initial commit")
    .option("--ref <git-ref>", "Clone and checkout a specific git ref")
    .option("--repo-url <url>", "Override the starter repo URL")
    .option("--auth <provider>", "Select the Auth provider")
    .option("--cms <provider>", "Select the CMS provider")
    .option("--commerce <provider>", "Select the Commerce provider")
    .option(
      "--without <slot>",
      "Leave a provider slot empty (auth, cms, or commerce; repeatable)",
      (value: string, previous: ProviderSlot[] | undefined): ProviderSlot[] => {
        if (value !== "auth" && value !== "cms" && value !== "commerce") {
          throw new Error("Choose --without auth, cms or commerce.");
        }
        return [...(previous ?? []), value];
      }
    )
    .option(
      "--add-on <selection>",
      "Select an Add-on (repeatable)",
      (value: string, previous: string[] | undefined) => [
        ...(previous ?? []),
        value,
      ]
    )
    .option("--preset <selection>", "Use a portable next-hydra preset")
    .option("--verbose", "Print git command output")
    .version(CLI_VERSION)
    .action(
      async (
        projectDirectory: string | undefined,
        rawOptions: CliActionOptions
      ) => {
        let targetDir = projectDirectory?.trim();
        rejectRetiredCommand(targetDir);

        if (!targetDir) {
          if (rawOptions.yes) {
            throw new Error(
              "`--yes` requires a target directory, e.g. `create-next-hydra my-app --yes`."
            );
          }

          targetDir = await promptForTargetDirectory();
        }

        await scaffoldProject(buildCreateOptions(targetDir, rawOptions));
      }
    );

  program
    .command("add")
    .description("Add a registry item to a customer-owned workspace")
    .argument("<item-or-url>", "Registry item, URL, or local item JSON")
    .option("-y, --yes", "Skip confirmation prompts")
    .option("-o, --overwrite", "Overwrite changed files and package entries")
    .action(
      async (
        reference: string,
        rawOptions: { overwrite?: boolean; yes?: boolean }
      ) => {
        await addRegistryItem(reference, {
          overwrite: rawOptions.overwrite,
          yes: rawOptions.yes,
        });
      }
    );

  await program.parseAsync(argv);
}
export type {
  CreateOptions,
  ResolvedCreateOptions,
  ScaffoldResult,
  StarterDefinition,
} from "./types.js";
