import { runGit } from "./git.js";

type CloneStarterOptions = {
  repoUrl: string;
  targetPath: string;
  ref?: string;
  verbose?: boolean;
};

export async function cloneStarter(
  options: CloneStarterOptions
): Promise<void> {
  const verbose = options.verbose ?? false;
  const cloneArgs = ["clone"];

  if (verbose) {
    cloneArgs.push("--progress");
  }

  if (options.ref) {
    cloneArgs.push(options.repoUrl, options.targetPath);
    await runGit(cloneArgs, { verbose });
    await runGit(["checkout", options.ref], {
      cwd: options.targetPath,
      verbose,
    });
    return;
  }

  cloneArgs.push("--depth", "1", options.repoUrl, options.targetPath);
  await runGit(cloneArgs, { verbose });
}
