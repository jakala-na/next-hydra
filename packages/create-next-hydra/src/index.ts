import { Command } from "commander";

import { addRegistryItem } from "./composition/add.js";
import { useComposition } from "./composition/use.js";
import type { UseCompositionOptions } from "./composition/use.js";
import { CLI_NAME, DEFAULT_REPO_URL } from "./constants.js";
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
  preset?: string;
};

type CliDependencies = {
  useComposition?: typeof useComposition;
};

type UseCliActionOptions = Omit<UseCompositionOptions, "addOns" | "cwd"> & {
  addOn?: string[];
};

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
    yes: rawOptions.yes ?? false,
  };
}

export async function runCli(
  argv = process.argv,
  dependencies: CliDependencies = {}
): Promise<void> {
  const program = new Command().enablePositionalOptions();

  program
    .name(CLI_NAME)
    .description("Scaffold a new next-hydra project")
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
    .command("use")
    .description("Change or check the maintainer workspace composition")
    .option("--auth <provider>", "Select the Auth provider")
    .option("--cms <provider>", "Select the CMS provider")
    .option("--commerce <provider>", "Select the Commerce provider")
    .option(
      "--add-on <selection>",
      "Select an Add-on (repeatable)",
      (value: string, previous: string[] | undefined) => [
        ...(previous ?? []),
        value,
      ]
    )
    .option("--preset <selection>", "Use a portable next-hydra preset")
    .option("--check", "Check for composition drift without writing")
    .option("--dry-run", "Preview and validate changes without writing")
    .option("-y, --yes", "Apply changes without confirmation")
    .option("--verbose", "Print package-manager output")
    .action(async (rawOptions: UseCliActionOptions) => {
      await (dependencies.useComposition ?? useComposition)({
        ...rawOptions,
        addOns: rawOptions.addOn,
      });
    });

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
