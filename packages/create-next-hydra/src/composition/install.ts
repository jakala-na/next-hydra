/* oxlint-disable unicorn/no-array-sort -- Sort only newly constructed arrays; the CLI's library target is ES2022. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { addRegistryItems, loadRegistryItem } from "shadcn/registry";
import type { RegistryItem } from "shadcn/schema";

import { writeJsonFile } from "../fs-utils.js";
import { readPackageJson } from "./packages.js";
import {
  applyRegistryDependencies,
  planRegistryDependencies,
} from "./registry-dependencies.js";
import { renderPlannedSlotTemplates } from "./slot-templates.js";
import type {
  CompositionPlan,
  PreparedComposition,
  SourceRegistryCatalog,
} from "./types.js";

const SHADCN_ENVIRONMENT_HEADING = "Added the following variables to";

type AddRegistryItemsOptions = Omit<
  NonNullable<Parameters<typeof addRegistryItems>[1]>,
  "silent"
>;

async function suppressShadcnEnvironmentHeading<T>(
  operation: () => Promise<T>
): Promise<T> {
  // oxlint-disable-next-line typescript/unbound-method -- Restore the exact stream method in finally; all calls below retain the stream receiver.
  const originalWrite = process.stderr.write;
  process.stderr.write = (
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ) => {
    // ShadCN 4.16.2 emits this Ora heading even when `silent` is enabled.
    if (String(chunk).includes(SHADCN_ENVIRONMENT_HEADING)) {
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Node's typed write overload distinguishes an encoding from a completion callback.
      if (typeof encodingOrCallback === "function") {
        encodingOrCallback();
        return true;
      }
      callback?.();
      return true;
    }
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Dispatch Node's write overload without erasing its argument types.
    return typeof encodingOrCallback === "function"
      ? originalWrite.call(process.stderr, chunk, undefined, encodingOrCallback)
      : originalWrite.call(process.stderr, chunk, encodingOrCallback, callback);
  };

  try {
    return await operation();
  } finally {
    process.stderr.write = originalWrite;
  }
}

export async function addRegistryItemsQuietly(
  items: string[],
  options: AddRegistryItemsOptions
): Promise<void> {
  await suppressShadcnEnvironmentHeading(async () => {
    await addRegistryItems(items, { ...options, silent: true });
  });
}

async function resolveArtifact(
  catalog: SourceRegistryCatalog,
  item: string
): Promise<RegistryItem> {
  const resolved = catalog.items.get(item);
  if (
    resolved &&
    (resolved.files ?? []).every((file) => file.content !== undefined)
  ) {
    return resolved;
  }
  return await loadRegistryItem(item, {
    cwd: catalog.cwd,
    registryFile: catalog.registryFile,
  });
}

export async function prepareComposition(
  catalog: SourceRegistryCatalog,
  plan: CompositionPlan
): Promise<PreparedComposition> {
  const artifacts = await Promise.all(
    [...catalog.items].map(
      async ([item]) => await resolveArtifact(catalog, item)
    )
  );
  const selectedItemNames = new Set(plan.registryItems);
  const renderedFiles = await renderPlannedSlotTemplates(
    catalog.cwd,
    plan.templates
  );

  return {
    artifacts,
    assets: await Promise.all(
      plan.assets.map(async (asset) => ({
        ...asset,
        content: await readFile(path.join(catalog.cwd, asset.source)),
      }))
    ),
    entryItems: plan.entryItems,
    itemByReference: new Map(catalog.itemByReference),
    registryConfig: catalog.registryConfig,
    registryDependencies: planRegistryDependencies(
      artifacts.filter((artifact) => selectedItemNames.has(artifact.name))
    ),
    renderedFiles,
  };
}

function localDependencyName(
  reference: string,
  itemByReference: Map<string, string>,
  artifactPaths: Map<string, string>
): string | undefined {
  const itemName = itemByReference.get(reference);
  return itemName && artifactPaths.has(itemName) ? itemName : undefined;
}

export async function withPreparedRegistryArtifacts<T>(options: {
  artifacts: RegistryItem[];
  entryItems: string[];
  itemByReference: Map<string, string>;
  run: (entries: string[]) => Promise<T>;
}): Promise<T> {
  const artifactDirectory = await mkdtemp(
    path.join(tmpdir(), "next-hydra-registry-")
  );

  try {
    const artifactPaths = new Map(
      options.artifacts.map((artifact, index) => [
        artifact.name,
        path.join(artifactDirectory, `${index}.json`),
      ])
    );
    await Promise.all(
      options.artifacts.map(async (artifact) => {
        const artifactPath = artifactPaths.get(artifact.name);
        if (!artifactPath) {
          throw new Error(`Missing prepared registry item ${artifact.name}.`);
        }
        const registryDependencies = artifact.registryDependencies?.map(
          (reference) => {
            const localName = localDependencyName(
              reference,
              options.itemByReference,
              artifactPaths
            );
            return (
              (localName ? artifactPaths.get(localName) : undefined) ??
              reference
            );
          }
        );
        await writeFile(
          artifactPath,
          `${JSON.stringify({ ...artifact, registryDependencies }, null, 2)}\n`,
          "utf-8"
        );
      })
    );

    const entries = options.entryItems.map((item) => {
      const artifactPath = artifactPaths.get(item);
      if (!artifactPath) {
        throw new Error(`Missing prepared registry entry ${item}.`);
      }
      return artifactPath;
    });
    return await options.run(entries);
  } finally {
    await rm(artifactDirectory, { force: true, recursive: true });
  }
}

export async function installPreparedComposition(
  workspaceRoot: string,
  prepared: PreparedComposition
): Promise<void> {
  await Promise.all(
    prepared.assets.map(async (asset) => {
      const target = path.join(workspaceRoot, asset.target);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, asset.content);
    })
  );

  await withPreparedRegistryArtifacts({
    artifacts: prepared.artifacts.map((artifact) => ({
      ...artifact,
      // Record standard dependency fields below, without ShadCN running an early install.
      dependencies: undefined,
      devDependencies: undefined,
      docs: undefined,
    })),
    entryItems: prepared.entryItems,
    itemByReference: prepared.itemByReference,
    run: async (entries) => {
      await addRegistryItemsQuietly(entries, {
        config: prepared.registryConfig,
        cwd: workspaceRoot,
        overwrite: true,
      });
    },
  });

  if (prepared.registryDependencies.length) {
    const manifestPath = path.join(workspaceRoot, "package.json");
    const manifest = await readPackageJson(manifestPath);
    applyRegistryDependencies(manifest, prepared.registryDependencies);
    await writeJsonFile(manifestPath, manifest);
  }

  await Promise.all(
    prepared.renderedFiles.map(async (file) => {
      const target = path.join(workspaceRoot, file.target);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content, "utf-8");
    })
  );
}
