import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { pathExists } from "../../src/fs-utils.js";
import { runGit } from "../../src/git.js";

/** Snapshot current authoring inputs, not the last commit or ignored credentials. */
export async function createSourceRepository(
  sourceRoot: string,
  targetRoot: string
) {
  const { stdout } = await runGit(
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: sourceRoot }
  );
  await mkdir(targetRoot, { recursive: true });
  await Promise.all(
    [...new Set(stdout.split("\0").filter(Boolean))].map(async (relative) => {
      const source = path.join(sourceRoot, relative);
      if (!(await pathExists(source))) {
        return;
      }
      const target = path.join(targetRoot, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target);
    })
  );
  await runGit(["init"], { cwd: targetRoot });
  await runGit(["add", "-A"], { cwd: targetRoot });
  await runGit(
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "-m",
      "Snapshot source fixture",
    ],
    { cwd: targetRoot }
  );
}
