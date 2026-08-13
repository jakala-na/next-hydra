import { readdir, readFile, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "yaml";

import {
  pathExists,
  readJsonFile,
  removePath,
  writeJsonFile,
} from "../fs-utils.js";
import { CompositionValidationError } from "./errors.js";
import { readPackageJson } from "./packages.js";
import { formatZodError, workspaceSelectionSchema } from "./schema.js";
import type {
  CompositionPlan,
  PreparedComposition,
  WorkspaceSelection,
} from "./types.js";

export const WORKSPACE_SELECTION_FILE = "next-hydra.json";

export async function readWorkspaceSelection(
  workspaceRoot: string
): Promise<WorkspaceSelection> {
  const filePath = path.join(workspaceRoot, WORKSPACE_SELECTION_FILE);
  if (!(await pathExists(filePath))) {
    throw new Error(
      `${WORKSPACE_SELECTION_FILE} was not found. The \`use\` command only operates on a Next Hydra maintainer workspace.`
    );
  }

  const value = await readJsonFile<unknown>(filePath);
  const result = workspaceSelectionSchema.safeParse(value);
  if (!result.success) {
    throw new CompositionValidationError(
      `${WORKSPACE_SELECTION_FILE} is invalid.`,
      formatZodError(result.error)
    );
  }
  // Preserve existing top-level and nested key positions, appending only
  // schema-defaulted keys that were absent from the file.
  const selection = value as Record<string, unknown>;
  for (const [key, defaultedValue] of Object.entries(result.data)) {
    if (!Object.hasOwn(selection, key)) {
      selection[key] = defaultedValue;
    }
  }
  return value as WorkspaceSelection;
}

export function writeWorkspaceSelection(
  workspaceRoot: string,
  selection: WorkspaceSelection
): Promise<void> {
  return writeJsonFile(
    path.join(workspaceRoot, WORKSPACE_SELECTION_FILE),
    selection
  );
}

export async function applyPackageRequirements(
  workspaceRoot: string,
  plan: CompositionPlan
): Promise<void> {
  const selected = new Set(
    plan.packageRequirements.map(
      (requirement) =>
        `${requirement.cwd}\0${requirement.section}\0${requirement.name}`
    )
  );
  const removals = plan.catalogPackageRequirements.filter(
    (requirement) =>
      !selected.has(
        `${requirement.cwd}\0${requirement.section}\0${requirement.name}`
      )
  );
  const byManifest = new Map<string, typeof removals>();

  for (const requirement of removals) {
    const manifest = path.posix.join(requirement.cwd, "package.json");
    const entries = byManifest.get(manifest) ?? [];
    entries.push(requirement);
    byManifest.set(manifest, entries);
  }

  await Promise.all(
    [...byManifest].map(async ([manifest, entries]) => {
      const manifestPath = path.join(workspaceRoot, manifest);
      if (!(await pathExists(manifestPath))) {
        return;
      }
      const packageJson = await readPackageJson(manifestPath, manifest);
      let changed = false;
      for (const requirement of entries) {
        const section = packageJson[requirement.section];
        if (!(section && Object.hasOwn(section, requirement.name))) {
          continue;
        }
        delete section[requirement.name];
        changed = true;
      }
      if (changed) {
        await writeJsonFile(manifestPath, packageJson);
      }
    })
  );

  await applyPackageEntries(workspaceRoot, plan.packageRequirements);
}

export async function applyPackageEntries(
  workspaceRoot: string,
  requirements: CompositionPlan["packageRequirements"]
): Promise<void> {
  const byManifest = new Map<string, typeof requirements>();

  for (const requirement of requirements) {
    const manifest = path.posix.join(requirement.cwd, "package.json");
    const existing = byManifest.get(manifest) ?? [];
    existing.push(requirement);
    byManifest.set(manifest, existing);
  }

  await Promise.all(
    [...byManifest].map(async ([manifest, manifestRequirements]) => {
      const manifestPath = path.join(workspaceRoot, manifest);
      const packageJson = await readPackageJson(manifestPath, manifest);
      let changed = false;
      for (const requirement of manifestRequirements) {
        const section = packageJson[requirement.section] ?? {};
        if (
          Object.hasOwn(section, requirement.name) &&
          section[requirement.name] === requirement.specifier
        ) {
          continue;
        }
        section[requirement.name] = requirement.specifier;
        packageJson[requirement.section] = section;
        changed = true;
      }
      if (changed) {
        await writeJsonFile(manifestPath, packageJson);
      }
    })
  );
}

type PnpmWorkspaceConfig = {
  patchedDependencies?: Record<string, string>;
};

function readPnpmWorkspaceConfig(source: string): {
  document: ReturnType<typeof parseDocument>;
  config: PnpmWorkspaceConfig;
} {
  const document = parseDocument(source);
  if (document.errors.length > 0) {
    throw new CompositionValidationError("pnpm-workspace.yaml is invalid.", [
      ...document.errors.map((error) => error.message),
    ]);
  }
  return {
    config: document.toJS() as PnpmWorkspaceConfig,
    document,
  };
}

export async function applyPnpmPatches(
  workspaceRoot: string,
  plan: CompositionPlan
): Promise<void> {
  if (plan.catalogPnpmPatches.length === 0) {
    return;
  }

  const workspaceFile = path.join(workspaceRoot, "pnpm-workspace.yaml");
  const { config, document } = readPnpmWorkspaceConfig(
    await readFile(workspaceFile, "utf8")
  );
  const governedDependencies = new Set(
    plan.catalogPnpmPatches.map((patch) => patch.dependency)
  );
  const patches = Object.fromEntries(
    Object.entries(config.patchedDependencies ?? {}).filter(
      ([dependency]) => !governedDependencies.has(dependency)
    )
  );

  for (const patch of plan.pnpmPatches) {
    patches[patch.dependency] = patch.path;
  }

  const sortedPatches = Object.fromEntries(
    Object.entries(patches).sort(([left], [right]) => left.localeCompare(right))
  );
  if (Object.keys(sortedPatches).length === 0) {
    document.delete("patchedDependencies");
  } else {
    document.set("patchedDependencies", sortedPatches);
  }
  await writeFile(workspaceFile, document.toString(), "utf8");
}

async function pruneEmptyParents(
  workspaceRoot: string,
  relativeTarget: string
): Promise<void> {
  let current = path.dirname(path.join(workspaceRoot, relativeTarget));
  const root = path.resolve(workspaceRoot);

  while (current.startsWith(`${root}${path.sep}`)) {
    try {
      // Parent directories must be checked from the leaf toward the root.
      // biome-ignore lint/performance/noAwaitInLoops: each iteration depends on the previous parent
      const entries = await readdir(current);
      if (entries.length > 0) {
        return;
      }
      await rmdir(current);
      current = path.dirname(current);
    } catch {
      return;
    }
  }
}

export async function removeWorkspaceTargets(
  workspaceRoot: string,
  targets: string[]
): Promise<void> {
  const deepestFirst = [...targets].sort(
    (left, right) => right.split("/").length - left.split("/").length
  );

  for (const target of deepestFirst) {
    // Targets are deepest-first so pruning one target cannot race another.
    // biome-ignore lint/performance/noAwaitInLoops: ordered removal keeps parent pruning deterministic
    await removePath(path.join(workspaceRoot, target));
    await pruneEmptyParents(workspaceRoot, target);
  }
}

export async function checkWorkspaceComposition(
  workspaceRoot: string,
  plan: CompositionPlan,
  managedFiles: PreparedComposition["managedFiles"]
): Promise<string[]> {
  const drift: string[] = [];

  const selected = new Set(
    plan.packageRequirements.map(
      (requirement) =>
        `${requirement.cwd}\0${requirement.section}\0${requirement.name}`
    )
  );

  const unselectedPackageDrift = await Promise.all(
    plan.catalogPackageRequirements.map(async (requirement) => {
      const key = `${requirement.cwd}\0${requirement.section}\0${requirement.name}`;
      if (selected.has(key)) {
        return;
      }
      const manifest = path.posix.join(requirement.cwd, "package.json");
      const manifestPath = path.join(workspaceRoot, manifest);
      if (!(await pathExists(manifestPath))) {
        return;
      }
      const packageJson = await readPackageJson(manifestPath, manifest);
      const actual = packageJson[requirement.section]?.[requirement.name];
      return actual === undefined
        ? undefined
        : `${manifest}: expected unselected ${requirement.section}.${requirement.name} to be absent, found ${actual}`;
    })
  );
  drift.push(
    ...unselectedPackageDrift.filter(
      (issue): issue is string => issue !== undefined
    )
  );

  const selectedPackageDrift = await Promise.all(
    plan.packageRequirements.map(async (requirement) => {
      const manifest = path.posix.join(requirement.cwd, "package.json");
      const packageJson = await readPackageJson(
        path.join(workspaceRoot, manifest),
        manifest
      );
      const actual = packageJson[requirement.section]?.[requirement.name];
      return actual === requirement.specifier
        ? undefined
        : `${manifest}: expected ${requirement.section}.${requirement.name} to be ${requirement.specifier}, found ${actual ?? "missing"}`;
    })
  );
  drift.push(
    ...selectedPackageDrift.filter(
      (issue): issue is string => issue !== undefined
    )
  );

  if (plan.catalogPnpmPatches.length > 0) {
    const workspaceFile = path.join(workspaceRoot, "pnpm-workspace.yaml");
    const { config } = readPnpmWorkspaceConfig(
      await readFile(workspaceFile, "utf8")
    );
    const selectedPatches = new Map(
      plan.pnpmPatches.map((patch) => [patch.dependency, patch.path])
    );
    for (const patch of plan.catalogPnpmPatches) {
      const expected = selectedPatches.get(patch.dependency);
      const actual = config.patchedDependencies?.[patch.dependency];
      if (actual !== expected) {
        drift.push(
          `pnpm-workspace.yaml: expected patchedDependencies.${patch.dependency} to be ${expected ?? "absent"}, found ${actual ?? "missing"}`
        );
      }
    }
  }

  const expectedManagedFiles = new Map(
    managedFiles.map((file) => [file.target, file.content])
  );
  const managedFileDrift = await Promise.all(
    plan.catalogManagedTargets.map(async (target) => {
      const filePath = path.join(workspaceRoot, target);
      const expected = expectedManagedFiles.get(target);
      if (!expected) {
        return (await pathExists(filePath))
          ? `${target}: managed file should not exist for this composition`
          : undefined;
      }
      if (!(await pathExists(filePath))) {
        return `${target}: managed file is missing`;
      }
      const actual = await readFile(filePath, "utf8");
      return actual === expected
        ? undefined
        : `${target}: managed file differs from the composition plan`;
    })
  );
  drift.push(
    ...managedFileDrift.filter((issue): issue is string => issue !== undefined)
  );

  return drift.sort((left, right) => left.localeCompare(right));
}
