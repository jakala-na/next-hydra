import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  symlink,
} from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import { resolveRegistryTarget } from "./composition/paths.js";
import type { WorkspaceSelection } from "./composition/types.js";
import { pathExists, removePath, writeJsonFile } from "./fs-utils.js";
import { runGit } from "./git.js";

const RECEIPT_FILE = ".next-hydra-maintainer-workspace.json";
type RegistryFile = {
  path: string;
  target?: string;
};

type RegistryItem = {
  files?: RegistryFile[];
  name: string;
};

type SourceRegistry = {
  include?: string[];
  items?: RegistryItem[];
};

type SourceLink = {
  source: string;
  target: string;
};

type WorkspaceConfiguration = {
  patchedDependencies?: Record<string, string>;
};

type PackageManifest = {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

const GENERATED_APP_TARGETS = new Set([
  "apps/web/package.json",
  "apps/web/tsconfig.json",
]);

const hasMaintainerMarkers = async (directory: string): Promise<boolean> =>
  (await pathExists(path.join(directory, "next-hydra.json"))) &&
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
        "`--maintainer-workspace` must be run inside a Next Hydra maintainer checkout."
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
  const { stdout } = await runGit(
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: sourceRoot }
  );
  const sourceFiles = stdout.split("\0").filter(Boolean);

  await mkdir(targetRoot, { recursive: true });
  await Promise.all(
    sourceFiles.map(async (relativePath) => {
      await copyWorkspaceFile(sourceRoot, targetRoot, relativePath);
    })
  );
}

export async function copyMaintainerEnvironmentFiles(
  sourceRoot: string,
  targetRoot: string
): Promise<string[]> {
  const { stdout: worktreeOutput } = await runGit(
    ["worktree", "list", "--porcelain"],
    { cwd: sourceRoot }
  );
  const primaryWorktree = worktreeOutput
    .split("\n")
    .find((line) => line.startsWith("worktree "))
    ?.slice("worktree ".length);
  const sourceRoots = [primaryWorktree, sourceRoot].filter(
    (root, index, roots): root is string =>
      Boolean(root) && roots.indexOf(root) === index
  );
  const copied = new Set<string>();

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
      const target = path.join(targetRoot, relativePath);
      if (!(await pathExists(path.dirname(target)))) {
        continue;
      }
      const source = path.join(environmentRoot, relativePath);
      const sourceStat = await lstat(source);
      if (!(sourceStat.isFile() || sourceStat.isSymbolicLink())) {
        continue;
      }
      await removePath(target);
      await copyFile(source, target);
      if (sourceStat.isFile()) {
        await chmod(target, sourceStat.mode);
      }
      copied.add(relativePath);
    }
  }

  return [...copied].sort((left, right) => left.localeCompare(right));
}

const readWorkspaceConfiguration = async (
  workspaceRoot: string
): Promise<WorkspaceConfiguration> =>
  parseYaml(
    await readFile(path.join(workspaceRoot, "pnpm-workspace.yaml"), "utf-8")
  ) as WorkspaceConfiguration;

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
  const rootRegistry = JSON.parse(
    await readFile(path.join(sourceRoot, "registry.json"), "utf-8")
  ) as SourceRegistry;

  return ["registry.json", ...(rootRegistry.include ?? [])];
};

const selectedApplicationLinks = async (
  sourceRoot: string,
  selectedItems: ReadonlySet<string>
): Promise<SourceLink[]> => {
  const links: SourceLink[] = [];

  for (const registryFile of await sourceRegistryFiles(sourceRoot)) {
    const registryPath = path.join(sourceRoot, registryFile);
    const registry = JSON.parse(
      await readFile(registryPath, "utf-8")
    ) as SourceRegistry;
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
        if (!target.startsWith(`apps${path.sep}`)) {
          continue;
        }
        if (GENERATED_APP_TARGETS.has(target)) {
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
  selectedItems: ReadonlySet<string>,
  selection: WorkspaceSelection
): Promise<Set<string>> {
  const selected = new Set(
    Object.entries(selection.apps ?? {}).flatMap(([app, profile]) =>
      profile ? [app] : []
    )
  );

  for (const registryFile of await sourceRegistryFiles(sourceRoot)) {
    const registryPath = path.join(sourceRoot, registryFile);
    const registry = JSON.parse(
      await readFile(registryPath, "utf-8")
    ) as SourceRegistry;
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
  ].flatMap(([name, specifier]) => [
    name,
    ...(workspaceAliasPackage(specifier)
      ? [workspaceAliasPackage(specifier) as string]
      : []),
  ]);

export async function pruneMaintainerWorkspaceForProfiles(options: {
  selectedItems: readonly string[];
  selection: WorkspaceSelection;
  sourceRoot: string;
  targetRoot: string;
}): Promise<string[]> {
  if (Object.keys(options.selection.apps ?? {}).length === 0) {
    return [];
  }

  const removed: string[] = [];
  const retainedApps = await selectedApplicationNames(
    options.sourceRoot,
    new Set(options.selectedItems),
    options.selection
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
    const manifest = JSON.parse(
      await readFile(manifestPath, "utf-8")
    ) as PackageManifest;
    if (manifest.name) {
      packagesByName.set(manifest.name, { directory: entry.name, manifest });
    }
  }

  const pending: string[] = [];
  const rootManifest = JSON.parse(
    await readFile(path.join(options.targetRoot, "package.json"), "utf-8")
  ) as PackageManifest;
  pending.push(...internalDependencyNames(rootManifest));
  for (const app of retainedApps) {
    const manifestPath = path.join(appsRoot, app, "package.json");
    if (!(await pathExists(manifestPath))) {
      continue;
    }
    const manifest = JSON.parse(
      await readFile(manifestPath, "utf-8")
    ) as PackageManifest;
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
  targetRoot: string
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
    links.push({ source, target: workspacePath });
  }

  return links;
};

const assertMatchingPackageManifest = async (
  sourceRoot: string,
  targetRoot: string,
  link: SourceLink
): Promise<void> => {
  const sourceManifest = path.join(sourceRoot, link.source, "package.json");
  const targetManifest = path.join(targetRoot, link.target, "package.json");
  if (
    !(await pathExists(sourceManifest)) ||
    !(await pathExists(targetManifest))
  ) {
    return;
  }

  const [sourcePackage, targetPackage] = await Promise.all([
    readFile(sourceManifest, "utf-8").then(JSON.parse),
    readFile(targetManifest, "utf-8").then(JSON.parse),
  ]);
  if (JSON.stringify(sourcePackage) !== JSON.stringify(targetPackage)) {
    throw new Error(
      `Cannot link ${link.target}: its composed package.json differs from the maintainer source package. This prototype only links packages whose manifests are composition-invariant.`
    );
  }
};

const installSourceLink = async (
  sourceRoot: string,
  targetRoot: string,
  link: SourceLink
): Promise<void> => {
  const source = path.resolve(sourceRoot, link.source);
  const target = path.join(targetRoot, link.target);
  await removePath(target);
  await mkdir(path.dirname(target), { recursive: true });
  await symlink(
    path.relative(path.dirname(target), source),
    target,
    (await lstat(source)).isDirectory() ? "dir" : "file"
  );
};

export async function linkMaintainerWorkspaceSources(options: {
  environmentFiles?: readonly string[];
  removedPaths?: readonly string[];
  selectedItems: readonly string[];
  selection: WorkspaceSelection;
  sourceRoot: string;
  targetRoot: string;
}): Promise<number> {
  const selectedItems = new Set(options.selectedItems);
  const links = [
    ...(await selectedPackageLinks(options.sourceRoot, options.targetRoot)),
    ...(await selectedApplicationLinks(options.sourceRoot, selectedItems)),
  ];
  const uniqueLinks = new Map(links.map((link) => [link.target, link]));

  await Promise.all(
    [...uniqueLinks.values()]
      .filter((link) => link.target.startsWith(`packages${path.sep}`))
      .map(async (link) => {
        await assertMatchingPackageManifest(
          options.sourceRoot,
          options.targetRoot,
          link
        );
      })
  );

  await Promise.all(
    [...uniqueLinks.values()].map(async (link) => {
      await installSourceLink(options.sourceRoot, options.targetRoot, link);
    })
  );
  await writeJsonFile(path.join(options.targetRoot, RECEIPT_FILE), {
    environmentFiles: options.environmentFiles ?? [],
    generatedTargets: [...GENERATED_APP_TARGETS],
    links: [...uniqueLinks.values()].map((link) => ({
      source: path.relative(options.sourceRoot, link.source),
      target: link.target,
    })),
    selection: options.selection,
    removedPaths: options.removedPaths ?? [],
    sourceWorkspace: options.sourceRoot,
  });

  return uniqueLinks.size;
}
