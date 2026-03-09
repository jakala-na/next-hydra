import { Command } from "commander";

import { CLI_NAME, DEFAULT_REPO_URL } from "./constants.js";
import { promptForTargetDirectory } from "./prompts.js";
import { scaffoldProject } from "./scaffold.js";
import type { CreateOptions } from "./types.js";

type CliActionOptions = {
  yes?: boolean;
  skipGit?: boolean;
  commit?: boolean;
  ref?: string;
  repoUrl?: string;
  verbose?: boolean;
};

function buildCreateOptions(
  targetDir: string,
  rawOptions: CliActionOptions
): CreateOptions {
  return {
    targetDir,
    yes: rawOptions.yes ?? false,
    skipGit: rawOptions.skipGit ?? false,
    commit: rawOptions.commit ?? true,
    ref: rawOptions.ref,
    repoUrl: rawOptions.repoUrl ?? DEFAULT_REPO_URL,
    verbose: rawOptions.verbose ?? false,
  };
}

export async function runCli(argv = process.argv): Promise<void> {
  const program = new Command();

  program
    .name(CLI_NAME)
    .description("Scaffold a new next-hydra project")
    .argument("[project-directory]", "Target directory")
    .option("-y, --yes", "Skip prompts (requires [project-directory])")
    .option("--skip-git", "Skip git initialization")
    .option("--no-commit", "Initialize git but skip initial commit")
    .option("--ref <git-ref>", "Clone and checkout a specific git ref")
    .option("--repo-url <url>", "Override the starter repo URL")
    .option("--verbose", "Print git command output")
    .version("0.1.0")
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

  await program.parseAsync(argv);
}
export type {
  CreateOptions,
  ResolvedCreateOptions,
  ScaffoldResult,
  StarterDefinition,
} from "./types.js";
