import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { addRegistryItems, loadRegistryItem } from "shadcn/registry";

import type {
  CompositionPlan,
  PreparedComposition,
  SourceRegistryCatalog,
} from "./types.js";

function resolveArtifact(catalog: SourceRegistryCatalog, item: string) {
  const resolved = catalog.items.get(item);
  if (
    resolved &&
    (resolved.files ?? []).every((file) => file.content !== undefined)
  ) {
    return resolved;
  }
  return loadRegistryItem(item, {
    cwd: catalog.cwd,
    registryFile: catalog.registryFile,
  });
}

export async function prepareComposition(
  catalog: SourceRegistryCatalog,
  plan: CompositionPlan
): Promise<PreparedComposition> {
  return {
    assets: await Promise.all(
      plan.assets.map(async (asset) => ({
        ...asset,
        content: await readFile(path.join(catalog.cwd, asset.source)),
      }))
    ),
    units: await Promise.all(
      plan.installUnits.map(async (unit) => ({
        ...unit,
        artifact: await resolveArtifact(catalog, unit.item),
      }))
    ),
  };
}

export async function installPreparedComposition(
  workspaceRoot: string,
  prepared: PreparedComposition
): Promise<void> {
  const artifactDirectory = await mkdtemp(
    path.join(tmpdir(), "next-hydra-registry-")
  );

  try {
    await Promise.all(
      prepared.assets.map(async (asset) => {
        const target = path.join(workspaceRoot, asset.target);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, asset.content);
      })
    );

    for (const [index, unit] of prepared.units.entries()) {
      const unitRoot = path.join(workspaceRoot, unit.cwd);
      // Units install in order because each can update the same workspace
      // package manifest and package-manager state.
      // biome-ignore lint/performance/noAwaitInLoops: concurrent package installation is unsafe
      await mkdir(unitRoot, { recursive: true });
      const artifactPath = path.join(
        artifactDirectory,
        `${index}-${unit.item}.json`
      );
      await writeFile(
        artifactPath,
        `${JSON.stringify(
          {
            ...unit.artifact,
            docs: undefined,
            registryDependencies: undefined,
          },
          null,
          2
        )}\n`,
        "utf8"
      );
      await addRegistryItems([artifactPath], {
        cwd: unitRoot,
        overwrite: true,
        silent: true,
      });
    }
  } finally {
    await rm(artifactDirectory, { force: true, recursive: true });
  }
}
