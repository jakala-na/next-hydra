/* oxlint-disable no-await-in-loop -- Environment overlay validation precedes ordered, exclusive copying. */
/* oxlint-disable unicorn/no-array-sort -- Only local/new arrays are sorted; the CLI targets ES2022. */
import { lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { resolveWorkspacePath } from "./composition/paths.js";
import { pathExists } from "./fs-utils.js";
import { runGit } from "./git.js";
import { assertDirectoryPath, isEnvironmentFile } from "./workspace-files.js";

/** Registry defaults seed missing files only; local credentials never become refresh-owned. */
export async function seedWorkspaceEnvironmentFile(
  targetRoot: string,
  file: { target: string; content: Uint8Array }
): Promise<void> {
  const target = resolveWorkspacePath(file.target, "environment default");
  if (!isEnvironmentFile(path.posix.basename(target))) {
    throw new Error(`Not an environment file: ${target}`);
  }
  const destination = path.join(targetRoot, target);
  await assertDirectoryPath(path.dirname(destination));
  try {
    await writeFile(destination, file.content, { flag: "wx", mode: 0o600 });
  } catch (error) {
    // Exclusive creation also preserves symlinks without following them.
    if (
      !(error instanceof Error && "code" in error && error.code === "EEXIST")
    ) {
      throw error;
    }
  }
}

const workspaceConfigurationSchema = z.object({
  patchedDependencies: z.record(z.string()).optional(),
});

const hasMaintainerMarkers = async (directory: string): Promise<boolean> =>
  (await pathExists(path.join(directory, "pnpm-workspace.yaml"))) &&
  (await pathExists(path.join(directory, "registry.json"))) &&
  (await pathExists(
    path.join(directory, "packages/create-next-hydra/package.json")
  ));

export async function findMaintainerWorkspaceRoot(
  startDirectory: string
): Promise<string> {
  let candidate = path.resolve(startDirectory);

  while (true) {
    if (await hasMaintainerMarkers(candidate)) {
      return candidate;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) {
      throw new Error(
        "Local composition must be run inside a Next Hydra maintainer checkout."
      );
    }
    candidate = parent;
  }
}

export function assertMaintainerWorkspaceTarget(
  sourceRoot: string,
  targetRoot: string
): void {
  const workspacesRoot = path.join(sourceRoot, "workspaces");
  const relativeTarget = path.relative(workspacesRoot, targetRoot);

  if (
    relativeTarget === "" ||
    relativeTarget === ".." ||
    relativeTarget.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeTarget)
  ) {
    throw new Error(
      "Maintainer workspaces must be created below the checkout's ignored `workspaces/` directory."
    );
  }
}

export async function copyMaintainerEnvironmentFiles(
  sourceRoot: string,
  targetRoot: string,
  options: { preserveExisting?: boolean } = {}
): Promise<string[]> {
  const { stdout: worktreeOutput } = await runGit(
    ["worktree", "list", "--porcelain", "-z"],
    { cwd: sourceRoot }
  );
  const primaryWorktree = worktreeOutput
    .split("\0")
    .find((line) => line.startsWith("worktree "))
    ?.slice("worktree ".length);
  const sourceRoots = [primaryWorktree, sourceRoot].filter(
    (root, index, roots): root is string =>
      Boolean(root) && roots.indexOf(root) === index
  );
  const candidates = new Map<string, string>();

  for (const environmentRoot of sourceRoots) {
    const { stdout } = await runGit(
      [
        "ls-files",
        "--others",
        "--ignored",
        "--exclude-standard",
        "-z",
        "--",
        ":(glob).env",
        ":(glob).env.*",
        ":(glob)apps/**/.env",
        ":(glob)apps/**/.env.*",
        ":(glob)packages/**/.env",
        ":(glob)packages/**/.env.*",
        ":(glob)tests/**/.env",
        ":(glob)tests/**/.env.*",
      ],
      { cwd: environmentRoot }
    );

    for (const relativePath of stdout.split("\0").filter(Boolean)) {
      if (
        relativePath
          .split("/")
          .some((part) =>
            ["node_modules", ".next", ".turbo", ".git"].includes(part)
          ) ||
        /\.(?:example|sample|template)$/u.test(relativePath)
      ) {
        continue;
      }
      // The current checkout wins over the primary worktree before any copying.
      candidates.set(relativePath, path.join(environmentRoot, relativePath));
    }
  }

  const files: { source: string; target: string; relativePath: string }[] = [];
  for (const [relativePath, source] of candidates) {
    const target = path.join(targetRoot, relativePath);
    if (!(await assertDirectoryPath(path.dirname(target)))) {
      continue;
    }
    await assertDirectoryPath(path.dirname(source));
    const sourceStat = await lstat(source);
    if (!sourceStat.isFile()) {
      throw new Error(
        `Environment overlays require regular source files, not links: ${relativePath}`
      );
    }
    try {
      const existing = await lstat(target);
      if (options.preserveExisting && existing.isFile()) {
        continue;
      }
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        files.push({ relativePath, source, target });
        continue;
      }
      throw error;
    }
    throw new Error(
      `Refusing to replace an existing environment path: ${relativePath}`
    );
  }

  for (const { source, target } of files) {
    // Exclusive creation and private permissions from the first write. Never unlink a destination.
    await writeFile(target, await readFile(source), {
      flag: "wx",
      mode: 0o600,
    });
  }

  return files
    .map((file) => file.relativePath)
    .sort((left, right) => left.localeCompare(right));
}

const readWorkspaceConfiguration = async (
  workspaceRoot: string
): Promise<z.infer<typeof workspaceConfigurationSchema>> =>
  workspaceConfigurationSchema.parse(
    parseYaml(
      await readFile(path.join(workspaceRoot, "pnpm-workspace.yaml"), "utf-8")
    )
  );

export async function assertMaintainerDependencyCompatibility(
  sourceRoot: string,
  targetRoot: string
): Promise<void> {
  const sourceConfiguration = await readWorkspaceConfiguration(sourceRoot);
  const targetConfiguration = await readWorkspaceConfiguration(targetRoot);
  const sourcePatches = sourceConfiguration.patchedDependencies ?? {};

  for (const [dependency, patchPath] of Object.entries(
    targetConfiguration.patchedDependencies ?? {}
  )) {
    if (sourcePatches[dependency] !== patchPath) {
      throw new Error(
        [
          `Cannot link the composed workspace because ${dependency} requires ${patchPath}.`,
          "The maintainer checkout resolves dependencies for linked source packages, so its `pnpm-workspace.yaml` must contain every Provider patch used by the composition.",
          "Add the patch to the maintainer dependency superset and run `pnpm install` there before trying again.",
        ].join(" ")
      );
    }
  }
}
