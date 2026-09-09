/* oxlint-disable no-await-in-loop -- Target removal and empty-parent pruning must run deepest-first. */
/* oxlint-disable unicorn/no-array-sort -- Only fresh arrays are sorted; this package targets ES2022. */
import { readdir, readFile, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseDocument } from "yaml";
import { z } from "zod";

import { pathExists, removePath, writeJsonFile } from "../fs-utils.js";
import { CompositionValidationError } from "./errors.js";
import { readPackageJson } from "./packages.js";
import type { CompositionPlan, WorkspaceSelection } from "./types.js";

export const WORKSPACE_SELECTION_FILE = "next-hydra.json";

export async function writeWorkspaceSelection(
  workspaceRoot: string,
  selection: WorkspaceSelection
): Promise<void> {
  await writeJsonFile(
    path.join(workspaceRoot, WORKSPACE_SELECTION_FILE),
    selection
  );
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
  const removals = plan.catalogPackageRequirementTargets.filter(
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
        Reflect.deleteProperty(section, requirement.name);
        changed = true;
      }
      if (changed) {
        await writeJsonFile(manifestPath, packageJson);
      }
    })
  );

  await applyPackageEntries(workspaceRoot, plan.packageRequirements);
}

function readPnpmWorkspaceConfig(source: string) {
  const document = parseDocument(source);
  if (document.errors.length > 0) {
    throw new CompositionValidationError(
      "pnpm-workspace.yaml is invalid.",
      document.errors.map((error) => error.message)
    );
  }
  return {
    config: z
      .object({ patchedDependencies: z.record(z.string()).optional() })
      .passthrough()
      .parse(document.toJS()),
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
    await readFile(workspaceFile, "utf-8")
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
  await writeFile(workspaceFile, document.toString(), "utf-8");
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
      // oxlint-disable-next-line no-await-in-loop -- Each iteration depends on the previous parent.
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
    // oxlint-disable-next-line no-await-in-loop -- Ordered removal keeps parent pruning deterministic.
    await removePath(path.join(workspaceRoot, target));
    await pruneEmptyParents(workspaceRoot, target);
  }
}
