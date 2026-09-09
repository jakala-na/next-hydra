/* oxlint-disable no-await-in-loop -- Inventory discovery, bounded copying, and source replacement have ordered filesystem dependencies. */
/* oxlint-disable unicorn/no-array-sort -- Only local/new arrays are sorted; the CLI targets ES2022. */
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { resolveRegistryTarget } from "./composition/paths.js";
import type { WorkspaceSelection } from "./composition/types.js";
import { pathExists, removePath, writeJsonFile } from "./fs-utils.js";
import { runGit } from "./git.js";
import {
  assertDirectoryPath,
  createWorkspaceDirectory,
  workspaceSourceFiles,
} from "./workspace-files.js";

const RECEIPT_FILE = ".next-hydra-maintainer-workspace.json";
const sourceRegistrySchema = z.object({
  include: z.array(z.string()).optional(),
  items: z
    .array(
      z.object({
        files: z
          .array(z.object({ path: z.string(), target: z.string().optional() }))
          .optional(),
        name: z.string(),
      })
    )
    .optional(),
});

type SourceLink = {
  source: string;
  target: string;
};

const workspaceConfigurationSchema = z.object({
  patchedDependencies: z.record(z.string()).optional(),
});
const packageManifestSchema = z.object({
  dependencies: z.record(z.string()).optional(),
  devDependencies: z.record(z.string()).optional(),
  name: z.string().optional(),
  optionalDependencies: z.record(z.string()).optional(),
  peerDependencies: z.record(z.string()).optional(),
});
type PackageManifest = z.infer<typeof packageManifestSchema>;

const isAtOrBelowTarget = (
  target: string,
  roots: ReadonlySet<string>
): boolean =>
  [...roots].some(
    (root) => target === root || target.startsWith(`${root}${path.sep}`)
  );

const PHYSICAL_APP_TARGETS = new Set([
  "apps/web/package.json",
  "apps/web/tsconfig.json",
]);

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

const copyWorkspaceFile = async (
  sourceRoot: string,
  targetRoot: string,
  relativePath: string
): Promise<void> => {
  const source = path.join(sourceRoot, relativePath);
  const target = path.join(targetRoot, relativePath);
  const sourceStat = await lstat(source);
  await mkdir(path.dirname(target), { recursive: true });

  if (sourceStat.isSymbolicLink()) {
    await symlink(await readlink(source), target);
    return;
  }
  if (!sourceStat.isFile()) {
    return;
  }

  await copyFile(source, target);
  await chmod(target, sourceStat.mode);
};

export async function copyMaintainerWorkspace(
  sourceRoot: string,
  targetRoot: string
): Promise<void> {
  const sourceFiles = await workspaceSourceFiles(sourceRoot);
  await createWorkspaceDirectory(targetRoot);
  // Bound open descriptors when the reference workspace grows.
  for (let offset = 0; offset < sourceFiles.length; offset += 32) {
    await Promise.all(
      sourceFiles.slice(offset, offset + 32).map(async (relativePath) => {
        await copyWorkspaceFile(sourceRoot, targetRoot, relativePath);
      })
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

const sourceRegistryFiles = async (sourceRoot: string): Promise<string[]> => {
  const rootRegistry = sourceRegistrySchema.parse(
    JSON.parse(await readFile(path.join(sourceRoot, "registry.json"), "utf-8"))
  );

  return ["registry.json", ...(rootRegistry.include ?? [])];
};

const selectedRegistrySourceLinks = async (
  sourceRoot: string,
  selectedItems: ReadonlySet<string>,
  physicalTargets: ReadonlySet<string>
): Promise<SourceLink[]> => {
  const links: SourceLink[] = [];

  for (const registryFile of await sourceRegistryFiles(sourceRoot)) {
    const registryPath = path.join(sourceRoot, registryFile);
    const registry = sourceRegistrySchema.parse(
      JSON.parse(await readFile(registryPath, "utf-8"))
    );
    const registryRoot = path.dirname(registryPath);

    for (const item of registry.items ?? []) {
      if (!selectedItems.has(item.name)) {
        continue;
      }
      for (const file of item.files ?? []) {
        if (!file.target) {
          continue;
        }
        const target = resolveRegistryTarget(file.target);
        if (
          !(
            target.startsWith(`apps${path.sep}`) ||
            target.startsWith(`packages${path.sep}`)
          )
        ) {
          continue;
        }
        if (
          PHYSICAL_APP_TARGETS.has(target) ||
          isAtOrBelowTarget(target, physicalTargets) ||
          ["package.json", "tsconfig.json"].includes(path.basename(target))
        ) {
          continue;
        }
        links.push({
          source: path.join(registryRoot, file.path),
          target,
        });
      }
    }
  }

  return links;
};

async function selectedApplicationNames(
  sourceRoot: string,
  selectedItems: ReadonlySet<string>
): Promise<Set<string>> {
  const selected = new Set<string>();

  for (const registryFile of await sourceRegistryFiles(sourceRoot)) {
    const registryPath = path.join(sourceRoot, registryFile);
    const registry = sourceRegistrySchema.parse(
      JSON.parse(await readFile(registryPath, "utf-8"))
    );
    for (const item of registry.items ?? []) {
      if (!selectedItems.has(item.name)) {
        continue;
      }
      for (const file of item.files ?? []) {
        if (!file.target) {
          continue;
        }
        const [root, app] = resolveRegistryTarget(file.target).split(path.sep);
        if (root === "apps" && app) {
          selected.add(app);
        }
      }
    }
  }

  return selected;
}

const workspaceAliasPackage = (specifier: string): string | undefined => {
  if (!specifier.startsWith("workspace:")) {
    return;
  }
  const candidate = specifier.slice("workspace:".length);
  if (!candidate.startsWith("@")) {
    return candidate.split("@", 1)[0];
  }
  const separator = candidate.indexOf("@", 1);
  return separator === -1 ? candidate : candidate.slice(0, separator);
};

const internalDependencyNames = (manifest: PackageManifest): string[] =>
  [
    ...Object.entries(manifest.dependencies ?? {}),
    ...Object.entries(manifest.devDependencies ?? {}),
    ...Object.entries(manifest.optionalDependencies ?? {}),
    ...Object.entries(manifest.peerDependencies ?? {}),
  ].flatMap(([name, specifier]) => {
    const alias = workspaceAliasPackage(specifier);
    return alias ? [name, alias] : [name];
  });

export async function pruneUnselectedWorkspacePackages(options: {
  selectedItems: readonly string[];
  sourceRoot: string;
  targetRoot: string;
}): Promise<string[]> {
  const removed: string[] = [];
  const retainedApps = await selectedApplicationNames(
    options.sourceRoot,
    new Set(options.selectedItems)
  );
  const appsRoot = path.join(options.targetRoot, "apps");
  if (await pathExists(appsRoot)) {
    for (const entry of await readdir(appsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || retainedApps.has(entry.name)) {
        continue;
      }
      const relative = path.join("apps", entry.name);
      await removePath(path.join(options.targetRoot, relative));
      removed.push(relative);
    }
  }

  const testsRoot = path.join(options.targetRoot, "tests");
  if (await pathExists(testsRoot)) {
    for (const entry of await readdir(testsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const relative = path.join("tests", entry.name);
      await removePath(path.join(options.targetRoot, relative));
      removed.push(relative);
    }
  }

  const packagesRoot = path.join(options.targetRoot, "packages");
  if (!(await pathExists(packagesRoot))) {
    return removed.sort((left, right) => left.localeCompare(right));
  }

  const packagesByName = new Map<
    string,
    { directory: string; manifest: PackageManifest }
  >();
  for (const entry of await readdir(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const manifestPath = path.join(packagesRoot, entry.name, "package.json");
    if (!(await pathExists(manifestPath))) {
      continue;
    }
    const manifest = packageManifestSchema.parse(
      JSON.parse(await readFile(manifestPath, "utf-8"))
    );
    if (manifest.name) {
      if (packagesByName.has(manifest.name)) {
        throw new Error(
          `Duplicate workspace package ${manifest.name}. Cannot determine package ownership.`
        );
      }
      packagesByName.set(manifest.name, { directory: entry.name, manifest });
    }
  }

  const pending: string[] = [];
  const rootManifest = packageManifestSchema.parse(
    JSON.parse(
      await readFile(path.join(options.targetRoot, "package.json"), "utf-8")
    )
  );
  pending.push(...internalDependencyNames(rootManifest));
  for (const app of retainedApps) {
    const manifestPath = path.join(appsRoot, app, "package.json");
    if (!(await pathExists(manifestPath))) {
      continue;
    }
    const manifest = packageManifestSchema.parse(
      JSON.parse(await readFile(manifestPath, "utf-8"))
    );
    pending.push(...internalDependencyNames(manifest));
  }

  const retainedPackages = new Set<string>();
  while (pending.length > 0) {
    const dependency = pending.pop();
    if (!dependency || retainedPackages.has(dependency)) {
      continue;
    }
    const workspacePackage = packagesByName.get(dependency);
    if (!workspacePackage) {
      continue;
    }
    retainedPackages.add(dependency);
    pending.push(...internalDependencyNames(workspacePackage.manifest));
  }

  for (const [name, workspacePackage] of packagesByName) {
    if (retainedPackages.has(name)) {
      continue;
    }
    const relative = path.join("packages", workspacePackage.directory);
    await removePath(path.join(options.targetRoot, relative));
    removed.push(relative);
  }

  return removed.sort((left, right) => left.localeCompare(right));
}

const selectedPackageLinks = async (
  sourceRoot: string,
  targetRoot: string,
  physicalTargets: ReadonlySet<string>
): Promise<SourceLink[]> => {
  const targetPackages = path.join(targetRoot, "packages");
  if (!(await pathExists(targetPackages))) {
    return [];
  }
  const entries = await readdir(targetPackages, { withFileTypes: true });
  const links: SourceLink[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const workspacePath = path.join("packages", entry.name);
    const source = path.join(sourceRoot, workspacePath);
    if (!(await pathExists(source))) {
      continue;
    }
    if (
      [...physicalTargets].some(
        (target) =>
          target === workspacePath ||
          target.startsWith(`${workspacePath}${path.sep}`)
      )
    ) {
      continue;
    }
    const sourceManifest = path.join(source, "package.json");
    const targetManifest = path.join(targetRoot, workspacePath, "package.json");
    if (
      (await pathExists(sourceManifest)) &&
      (await pathExists(targetManifest)) &&
      (await readFile(sourceManifest, "utf-8")) !==
        (await readFile(targetManifest, "utf-8"))
    ) {
      continue;
    }
    links.push({ source, target: workspacePath });
  }

  return links;
};

const installSourceLink = async (
  sourceRoot: string,
  targetRoot: string,
  link: SourceLink
): Promise<void> => {
  const source = path.resolve(sourceRoot, link.source);
  const target = path.join(targetRoot, link.target);
  const sourceInfo = await lstat(source);
  await removePath(target);
  await mkdir(path.dirname(target), { recursive: true });
  await symlink(
    path.relative(path.dirname(target), source),
    target,
    sourceInfo.isDirectory() ? "dir" : "file"
  );
};

export async function linkMaintainerWorkspaceSources(options: {
  copyTargets?: readonly string[];
  environmentFiles?: readonly string[];
  composedTargets?: readonly string[];
  removedPaths?: readonly string[];
  selectedItems: readonly string[];
  selection: WorkspaceSelection;
  sourceRoot: string;
  targetRoot: string;
}): Promise<number> {
  const selectedItems = new Set(options.selectedItems);
  const composedTargets = new Set(options.composedTargets);
  const copyTargets = new Set(options.copyTargets);
  const physicalTargets = new Set([
    ...composedTargets,
    ...copyTargets,
    ...(options.environmentFiles ?? []),
  ]);
  const links = [
    ...(await selectedPackageLinks(
      options.sourceRoot,
      options.targetRoot,
      physicalTargets
    )),
    ...(await selectedRegistrySourceLinks(
      options.sourceRoot,
      selectedItems,
      physicalTargets
    )),
  ];
  const directoryTargets = links
    .filter(
      (link) =>
        link.target.startsWith(`packages${path.sep}`) &&
        !path.extname(link.target)
    )
    .map((link) => link.target);
  const uniqueLinks = new Map(
    links
      .filter(
        (link) =>
          directoryTargets.includes(link.target) ||
          !directoryTargets.some((directory) =>
            link.target.startsWith(`${directory}${path.sep}`)
          )
      )
      .map((link) => [link.target, link])
  );

  await Promise.all(
    [...uniqueLinks.values()].map(async (link) => {
      await installSourceLink(options.sourceRoot, options.targetRoot, link);
    })
  );
  const sortedCopyTargets = [...copyTargets];
  const sortedComposedTargets = [...PHYSICAL_APP_TARGETS, ...composedTargets];
  // eslint-disable-next-line unicorn/no-array-sort -- Both arrays were created immediately above.
  sortedCopyTargets.sort((left, right) => left.localeCompare(right));
  // eslint-disable-next-line unicorn/no-array-sort -- Both arrays were created immediately above.
  sortedComposedTargets.sort((left, right) => left.localeCompare(right));
  await writeJsonFile(path.join(options.targetRoot, RECEIPT_FILE), {
    composedTargets: sortedComposedTargets,
    copyTargets: sortedCopyTargets,
    environmentFiles: options.environmentFiles ?? [],
    links: [...uniqueLinks.values()].map((link) => ({
      source: path.relative(options.sourceRoot, link.source),
      target: link.target,
    })),
    removedPaths: options.removedPaths ?? [],
    selection: options.selection,
    sourceWorkspace: options.sourceRoot,
    version: 1,
  });

  return uniqueLinks.size;
}
