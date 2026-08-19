import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { addRegistryItems, loadRegistryItem } from "shadcn/registry";
import type { RegistryItem } from "shadcn/schema";

import { pathExists } from "../fs-utils.js";
import { CompositionValidationError } from "./errors.js";
import { parsePackageJson, readPackageJson } from "./packages.js";
import { isManagedApplicationSource, resolveRegistryTarget } from "./paths.js";
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
  const originalWrite = process.stderr.write;
  process.stderr.write = (...args: unknown[]) => {
    const [chunk] = args;
    // ShadCN 4.16.2 emits this Ora heading even when `silent` is enabled.
    if (String(chunk).includes(SHADCN_ENVIRONMENT_HEADING)) {
      const callback = args.find(
        (argument): argument is () => void => typeof argument === "function"
      );
      callback?.();
      return true;
    }
    return Reflect.apply(originalWrite, process.stderr, args) as boolean;
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
  const artifacts = await Promise.all(
    [...catalog.items].map(([item]) => resolveArtifact(catalog, item))
  );
  const selectedItemNames = new Set(plan.registryItems);
  const managedFiles = artifacts
    .filter((artifact) => selectedItemNames.has(artifact.name))
    .flatMap(
      (artifact) =>
        artifact.files
          ?.filter((file) => isManagedApplicationSource(file.path, file.target))
          .map((file) => {
            if (!(file.target && file.content !== undefined)) {
              throw new CompositionValidationError(
                "Managed application files require targets and resolved content.",
                [`${artifact.name}:${file.path} cannot be prepared`]
              );
            }
            return {
              content: file.content,
              target: resolveRegistryTarget(file.target),
            };
          }) ?? []
    )
    .sort((left, right) => left.target.localeCompare(right.target));

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
    managedFiles,
    registryConfig: catalog.registryConfig,
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

export async function validatePackageRequirementTargets(
  workspaceRoot: string,
  plan: CompositionPlan,
  prepared: PreparedComposition,
  removedTargets: Iterable<string> = []
): Promise<void> {
  const selectedItems = new Set(plan.registryItems);
  const removed = new Set(removedTargets);
  const prospectiveManifests = new Map<string, string>();
  for (const artifact of prepared.artifacts) {
    if (!selectedItems.has(artifact.name)) {
      continue;
    }
    for (const file of artifact.files ?? []) {
      if (!(file.target && file.content !== undefined)) {
        continue;
      }
      const target = resolveRegistryTarget(file.target);
      if (target.endsWith("/package.json") || target === "package.json") {
        prospectiveManifests.set(target, file.content);
      }
    }
  }

  const issues = (
    await Promise.all(
      plan.packageRequirements.map(async (requirement) => {
        const manifest = path.posix.join(requirement.cwd, "package.json");
        const prospective = prospectiveManifests.get(manifest);
        try {
          if (prospective !== undefined) {
            parsePackageJson(prospective, manifest);
          } else if (
            !removed.has(manifest) &&
            (await pathExists(path.join(workspaceRoot, manifest)))
          ) {
            await readPackageJson(path.join(workspaceRoot, manifest), manifest);
          } else {
            return `${manifest} is not present or supplied by the selected graph`;
          }
        } catch (error) {
          if (error instanceof CompositionValidationError) {
            return `${manifest}: ${error.issues.join("; ")}`;
          }
          return `${manifest} could not be read`;
        }
      })
    )
  ).filter((issue): issue is string => issue !== undefined);

  if (issues.length > 0) {
    throw new CompositionValidationError(
      "Package requirements have invalid package.json targets.",
      [...new Set(issues)].sort((left, right) => left.localeCompare(right))
    );
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
}
