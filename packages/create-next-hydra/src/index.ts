import { Command, Option } from "commander";

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

function rejectReservedCommand(target: string | undefined): void {
  if (target === "use") {
    throw new Error(
      "Choose create-next-hydra <directory> for a new application, or define workspaces/<name>/next-hydra.json and run create-next-hydra compose <name> for a named workspace."
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
    preset: rawOptions.preset,
    ref: rawOptions.ref,
    repoUrl: rawOptions.repoUrl ?? DEFAULT_REPO_URL,
    skipGit: rawOptions.skipGit ?? false,
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
  // Reserved command names must not be interpreted as scaffold destinations.
  rejectReservedCommand(argv[2]);
  const program = new Command().enablePositionalOptions();

  program
    .command("compose")
    .description(
      "Initialize or refresh named workspaces in place from local sources"
    )
    .argument(
      "[name]",
      "Workspace defined by workspaces/<name>/next-hydra.json"
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
      "--explain [file]",
      "Locate the source of one workspace-relative file; omit the file for a full selected-file inventory. Read-only"
    )
    .option(
      "--diff",
      "Show local file changes and patches against the last composition snapshot without updating"
    )
    .addOption(
      new Option(
        "--run <task>",
        "Refresh, then run a task inside the named workspace"
      ).choices(["dev", "build", "test", "typecheck"])
    )
    .option(
      "--watch",
      "Refresh named workspaces when source files, templates or definitions change"
    )
    .option(
      "--copy-env",
      "Copy ignored local environment files into matching paths"
    )
    .option("--no-install", "Compose files without installing dependencies")
    .option("--offline", "Install only from the local pnpm store")
    .action(
      async (
        name: string | undefined,
        options: DevelopmentWorkspaceOptions
      ) => {
        await (
          dependencies.composeDevelopmentWorkspaces ??
          composeDevelopmentWorkspaces
        )(name, options);
      }
    );

  program
    .name(CLI_NAME)
    .description("Compose an application from the Next Hydra registry")
    .argument("[project-directory]", "Target directory")
    .option("-y, --yes", "Skip prompts (requires [project-directory])")
    .option("--skip-git", "Skip git initialization")
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
        rejectReservedCommand(targetDir);

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
    .description("Add a registry item to your project")
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
