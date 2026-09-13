/* oxlint-disable unicorn/no-array-sort -- Only a newly filtered array is sorted; the CLI targets ES2022. */
import { lstat, mkdir, readdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

import { resolveWorkspacePath } from "./composition/paths.js";
import { runGit } from "./git.js";

export function isEnvironmentFile(name: string): boolean {
  return (
    /^\.env(?:\.|$)/u.test(name) &&
    !/\.(?:example|sample|template)$/u.test(name)
  );
}

/** Catch file/directory collisions before any output exists, not halfway through copying. */
export function assertDistinctFileTargets(targets: readonly string[]): void {
  const files = new Set(
    targets.map((target) =>
      resolveWorkspacePath(target, "composition file target")
    )
  );
  if (files.size !== targets.length) {
    throw new Error("Duplicate composition file targets.");
  }
  for (const target of files) {
    let parent = path.posix.dirname(target);
    while (parent !== ".") {
      if (files.has(parent)) {
        throw new Error(
          `Composition file target ${parent} also owns a directory containing ${target}.`
        );
      }
      parent = path.posix.dirname(parent);
    }
  }
}

async function inspectPath(target: string) {
  try {
    return await lstat(target);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

/** Check before creating parents: a symlink must never redirect workspace writes. */
export async function assertDirectoryPath(directory: string): Promise<boolean> {
  const absolute = path.resolve(directory);
  const parent = path.dirname(absolute);
  if (parent !== absolute) {
    await assertDirectoryPath(parent);
  }
  const info = await inspectPath(absolute);
  if (!info) {
    return false;
  }
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(
      `Expected a physical directory, not a symlink or file: ${absolute}`
    );
  }
  return true;
}

export async function assertNewWorkspaceDirectory(
  target: string
): Promise<void> {
  await assertDirectoryPath(path.dirname(target));
  // lstat also detects dangling symlinks, which stat/access would overlook.
  if (await inspectPath(target)) {
    throw new Error(`Refusing to replace an existing workspace: ${target}`);
  }
}

export async function createWorkspaceDirectory(target: string): Promise<void> {
  await assertNewWorkspaceDirectory(target);
  await mkdir(path.dirname(target), { recursive: true });
  // Exclusive claim: concurrent invocations cannot both own the output.
  await mkdir(target);
}

/** Claim a new output or an explicitly allowed empty directory without replacing user files. */
export async function claimWorkspaceDirectory(
  target: string,
  allowEmpty = false
): Promise<() => Promise<void>> {
  if (!allowEmpty || !(await assertDirectoryPath(target))) {
    await createWorkspaceDirectory(target);
  }
  const lock = path.join(target, ".workspace-create.lock");
  await writeFile(lock, "Workspace creation in progress\n", { flag: "wx" });
  const release = async () => {
    await unlink(lock);
  };
  try {
    const files = await readdir(target);
    if (files.some((file) => file !== ".workspace-create.lock")) {
      throw new Error(`Refusing to replace a nonempty workspace: ${target}`);
    }
    return release;
  } catch (error) {
    await release();
    throw error;
  }
}

/** The working tree is authoritative, including new files and unstaged deletions. */
export async function workspaceSourceFiles(
  sourceRoot: string
): Promise<string[]> {
  const [inventory, deleted] = await Promise.all([
    runGit(["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      cwd: sourceRoot,
    }),
    runGit(["ls-files", "--deleted", "-z"], { cwd: sourceRoot }),
  ]);
  const deletedFiles = new Set(deleted.stdout.split("\0"));
  return [...new Set(inventory.stdout.split("\0"))]
    .filter((file) => file.length > 0 && !deletedFiles.has(file))
    .sort((left, right) => left.localeCompare(right));
}
