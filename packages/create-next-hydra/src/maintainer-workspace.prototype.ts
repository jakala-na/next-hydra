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

import {
  isManagedApplicationSource,
  resolveRegistryTarget,
} from "./composition/paths.js";
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
    { cwd: sourceRoot }
  );
  const copied: string[] = [];

  for (const relativePath of stdout.split("\0").filter(Boolean)) {
    const target = path.join(targetRoot, relativePath);
    if (!(await pathExists(path.dirname(target)))) {
      continue;
    }
    const source = path.join(sourceRoot, relativePath);
    const sourceStat = await lstat(source);
    if (!(sourceStat.isFile() || sourceStat.isSymbolicLink())) {
      continue;
    }
    await removePath(target);
    await copyFile(source, target);
    if (sourceStat.isFile()) {
      await chmod(target, sourceStat.mode);
    }
    copied.push(relativePath);
  }

  return copied.sort((left, right) => left.localeCompare(right));
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
        if (
          !file.target ||
          !isManagedApplicationSource(file.path, file.target)
        ) {
          continue;
        }
        links.push({
          source: path.join(registryRoot, file.path),
          target: resolveRegistryTarget(file.target),
        });
      }
    }
  }

  return links;
};

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
    links: [...uniqueLinks.values()].map((link) => ({
      source: path.relative(options.sourceRoot, link.source),
      target: link.target,
    })),
    selection: options.selection,
    sourceWorkspace: options.sourceRoot,
  });

  return uniqueLinks.size;
}
