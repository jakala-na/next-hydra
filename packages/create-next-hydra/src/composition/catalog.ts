/* oxlint-disable unicorn/no-array-sort -- Sort fresh arrays without requiring an API beyond the CLI's ES2022 library target. */
/* oxlint-disable no-await-in-loop -- Graph discovery and ordered registry merges depend on the preceding result. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  getRegistriesConfig,
  getRegistryItems,
  loadRegistry,
} from "shadcn/registry";
import type { RegistryItem } from "shadcn/schema";
import { z } from "zod";

import { pathExists } from "../fs-utils.js";
import { CompositionValidationError } from "./errors.js";
import { resolveWorkspacePath } from "./paths.js";
import {
  formatZodError,
  NEXT_HYDRA_SELECTION_SCHEMA_URL,
  selectionDefinitionSchema,
} from "./schema.js";
import type {
  CatalogSelection,
  RegistriesConfig,
  SourceRegistryCatalog,
} from "./types.js";

const GITHUB_HOMEPAGE_PATTERN =
  /^https:\/\/github\.com\/(?<repository>[^/]+\/[^/]+?)(?:\.git)?\/?$/u;
const SHADCN_REGISTRY_ITEM_SCHEMA_URL =
  "https://ui.shadcn.com/schema/registry-item.json";

const OFFICIAL_REFERENCES = {
  clerk: "next-hydra/auth/clerk",
  commercetools: "next-hydra/commerce/commercetools",
  contentstack: "next-hydra/cms/contentstack",
  drupal: "next-hydra/cms/drupal",
  standard: "next-hydra/preset/standard",
  workos: "next-hydra/auth/workos",
};

function restoreFetchedSelectionSchema(item: RegistryItem): RegistryItem {
  // ShadCN assigns its registry-item schema to every resolved artifact,
  // including artifacts authored with the Next Hydra Selection schema.
  if (
    item.meta?.nextHydra !== undefined &&
    item.$schema === SHADCN_REGISTRY_ITEM_SCHEMA_URL
  ) {
    return { ...item, $schema: NEXT_HYDRA_SELECTION_SCHEMA_URL };
  }

  return item;
}

function createCatalog(options: {
  cwd: string;
  registryFile: string;
  repository?: string;
  authoringPaths: string[];
  itemByReference?: Map<string, string>;
  registryConfig: RegistriesConfig;
  registryItems: RegistryItem[];
}): SourceRegistryCatalog {
  const items = new Map(options.registryItems.map((item) => [item.name, item]));
  const itemByReference = new Map(options.itemByReference);
  const selections: CatalogSelection[] = [];
  const issues: string[] = [];

  for (const item of options.registryItems) {
    itemByReference.set(item.name, item.name);
    if (options.repository) {
      itemByReference.set(`${options.repository}/${item.name}`, item.name);
    }
  }

  for (const item of options.registryItems) {
    const candidate: unknown = item.meta?.nextHydra;
    if (candidate === undefined) {
      continue;
    }

    if (item.$schema !== NEXT_HYDRA_SELECTION_SCHEMA_URL) {
      issues.push(
        `${item.name}.$schema must be ${NEXT_HYDRA_SELECTION_SCHEMA_URL}`
      );
      continue;
    }

    const result = selectionDefinitionSchema.safeParse(candidate);
    if (!result.success) {
      issues.push(
        ...formatZodError(result.error).map(
          (issue) => `${item.name}.meta.nextHydra.${issue}`
        )
      );
      continue;
    }

    selections.push({ ...result.data, itemName: item.name });
  }

  const byId = new Map<string, CatalogSelection>();
  const byReference = new Map<string, CatalogSelection>();

  for (const selection of selections) {
    const duplicateItemName = byId.get(selection.id)?.itemName;
    if (duplicateItemName !== undefined) {
      issues.push(
        `selection ID ${selection.id} is declared by both ${duplicateItemName} and ${selection.itemName}`
      );
      continue;
    }

    byId.set(selection.id, selection);
    byReference.set(selection.itemName, selection);
    byReference.set(selection.id, selection);
    itemByReference.set(selection.id, selection.itemName);
  }

  for (const [reference, id] of Object.entries(OFFICIAL_REFERENCES)) {
    const selection = byId.get(id);
    if (selection) {
      byReference.set(reference, selection);
      itemByReference.set(reference, selection.itemName);
    }
  }

  for (const [reference, itemName] of itemByReference) {
    const selection = selections.find(
      (candidate) => candidate.itemName === itemName
    );
    if (selection) {
      byReference.set(reference, selection);
    }
  }

  if (issues.length > 0) {
    throw new CompositionValidationError(
      "The source registry contains invalid Next Hydra metadata.",
      issues
    );
  }

  return {
    authoringPaths: options.authoringPaths,
    byId,
    byReference,
    cwd: options.cwd,
    externalItemNames: new Set<string>(),
    itemByReference,
    items,
    registryConfig: options.registryConfig,
    registryFile: options.registryFile,
    repository: options.repository,
    selections: [...selections].sort((left, right) =>
      left.id.localeCompare(right.id)
    ),
  };
}

function registryDependencyName(
  catalog: SourceRegistryCatalog,
  reference: string
): string | undefined {
  return catalog.itemByReference.get(reference);
}

export function resolveRegistryItemGraph(
  catalog: SourceRegistryCatalog,
  entryItems: string[]
): string[] {
  const resolved = new Set<string>();
  const pending = [...entryItems];

  while (pending.length > 0) {
    const itemName = pending.pop();
    if (!itemName || resolved.has(itemName)) {
      continue;
    }
    const item = catalog.items.get(itemName);
    if (!item) {
      throw new CompositionValidationError("Missing registry item.", [
        `${itemName} is not in the source registry`,
      ]);
    }
    resolved.add(itemName);
    for (const reference of item.registryDependencies ?? []) {
      const dependency = registryDependencyName(catalog, reference);
      if (!dependency) {
        throw new CompositionValidationError(
          "Registry dependency graph is incomplete.",
          [`${itemName} depends on unresolved item ${reference}`]
        );
      }
      if (!resolved.has(dependency)) {
        pending.push(dependency);
      }
    }
  }

  return [...resolved].sort((left, right) => left.localeCompare(right));
}

async function resolveRegistryReference(
  reference: string,
  cwd: string
): Promise<string> {
  if (path.isAbsolute(reference)) {
    return reference;
  }
  const localReference = path.resolve(cwd, reference);
  return (await pathExists(localReference)) ? localReference : reference;
}

export type RegistryItemGraph = {
  fetchedItemNames: Set<string>;
  itemByReference: Map<string, string>;
  items: Map<string, RegistryItem>;
};

export async function fetchRegistryItemGraph(options: {
  config: RegistriesConfig;
  cwd: string;
  fetchItems?: typeof getRegistryItems;
  itemByReference?: Map<string, string>;
  items?: Iterable<RegistryItem>;
  references: Iterable<string>;
  repository?: string;
}): Promise<RegistryItemGraph> {
  const items = new Map(
    [...(options.items ?? [])].map((item) => [item.name, item])
  );
  const itemByReference = new Map(options.itemByReference);
  const pending = [...new Set(options.references)];
  const expandedItems = new Set<string>();
  const fetchedItemNames = new Set<string>();
  const fetchedItems = new Map<string, RegistryItem>();
  const fetchItems = options.fetchItems ?? getRegistryItems;

  for (const item of items.values()) {
    itemByReference.set(item.name, item.name);
    if (options.repository) {
      itemByReference.set(`${options.repository}/${item.name}`, item.name);
    }
  }

  while (pending.length > 0) {
    const reference = pending.shift();
    if (!reference) {
      continue;
    }

    let itemName = itemByReference.get(reference);
    if (!itemName) {
      // oxlint-disable-next-line no-await-in-loop -- Breadth-first discovery reveals each next reference in order.
      const repositoryReference =
        options.repository &&
        !reference.includes("/") &&
        !reference.includes("#")
          ? `${options.repository}/${reference}`
          : reference;
      const resolvedReference = await resolveRegistryReference(
        repositoryReference,
        options.cwd
      );
      const [fetchedArtifact] = await fetchItems([resolvedReference], {
        config: options.config,
      });
      if (!fetchedArtifact) {
        throw new CompositionValidationError(
          "The registry dependency graph is incomplete.",
          [`${reference} returned no registry item`]
        );
      }
      const artifact = restoreFetchedSelectionSchema(fetchedArtifact);

      const fetched = fetchedItems.get(artifact.name);
      const unpinnedReference = reference.split("#", 1)[0] ?? reference;
      const replacesPinnedRepositoryItem =
        reference.includes("#") &&
        options.repository !== undefined &&
        unpinnedReference === `${options.repository}/${artifact.name}`;
      const existing = items.get(artifact.name);
      if (
        (fetched && !isDeepStrictEqual(fetched, artifact)) ||
        (existing &&
          !isDeepStrictEqual(existing, artifact) &&
          !replacesPinnedRepositoryItem)
      ) {
        throw new CompositionValidationError("Registry item names conflict.", [
          `${artifact.name} resolves to different content through ${reference}`,
        ]);
      }
      if (
        existing &&
        !isDeepStrictEqual(existing, artifact) &&
        replacesPinnedRepositoryItem
      ) {
        expandedItems.delete(artifact.name);
      }
      items.set(artifact.name, artifact);
      fetchedItems.set(artifact.name, artifact);
      fetchedItemNames.add(artifact.name);
      itemName = artifact.name;
      itemByReference.set(reference, itemName);
      itemByReference.set(resolvedReference, itemName);
      itemByReference.set(itemName, itemName);
    }

    if (expandedItems.has(itemName)) {
      continue;
    }
    const item = items.get(itemName);
    if (!item) {
      throw new CompositionValidationError(
        "The registry dependency graph is incomplete.",
        [`${reference} resolves to missing item ${itemName}`]
      );
    }
    expandedItems.add(itemName);
    pending.push(...(item.registryDependencies ?? []));
    // Discover potential built-ins so the catalog can plan either composition.
    // Discovery does not make them unconditional registry dependencies.
    if (item.meta?.nextHydra !== undefined) {
      const selection = selectionDefinitionSchema.parse(item.meta.nextHydra);
      pending.push(
        ...selection.conditionalDependencies.flatMap(
          (dependency) => dependency.items
        )
      );
    }
  }

  return { fetchedItemNames, itemByReference, items };
}

export async function loadSourceRegistryCatalog(
  cwd: string,
  registryFile = "registry.json",
  additionalRegistryFiles: string[] = []
): Promise<SourceRegistryCatalog> {
  const resolvedCwd = path.resolve(cwd);
  const safeRegistryFile = resolveWorkspacePath(
    registryFile,
    "source registry file"
  );
  const registryPath = path.resolve(resolvedCwd, safeRegistryFile);
  const sourceRegistry = z
    .object({
      homepage: z.string().optional(),
      include: z.array(z.string()).optional(),
    })
    .parse(JSON.parse(await readFile(registryPath, "utf-8")));
  const repository = sourceRegistry.homepage?.match(
    GITHUB_HOMEPAGE_PATTERN
  )?.[1];
  const registry = await loadRegistry({
    cwd: resolvedCwd,
    registryFile: safeRegistryFile,
  });
  // Local experiments can add opt-in definitions without changing the published catalog.
  for (const additional of additionalRegistryFiles) {
    const extra = await loadRegistry({
      cwd: resolvedCwd,
      registryFile: resolveWorkspacePath(additional, "additional registry"),
    });
    for (const item of extra.items) {
      item.files = await Promise.all(
        (item.files ?? []).map(async (file) => {
          const source = resolveWorkspacePath(
            path.posix.join(path.posix.dirname(additional), file.path),
            "additional registry source"
          );
          return {
            ...file,
            content: await readFile(path.join(resolvedCwd, source), "utf-8"),
            path: source,
          };
        })
      );
      registry.items.push(item);
    }
  }
  const registryConfig = await getRegistriesConfig(resolvedCwd);
  const includedRegistries = (sourceRegistry.include ?? []).map((included) =>
    resolveWorkspacePath(included, "source registry include")
  );
  const registrySourcePaths = includedRegistries.map((included) =>
    path.posix.join(path.posix.dirname(included), "registry")
  );
  return createCatalog({
    authoringPaths: [
      safeRegistryFile,
      ...additionalRegistryFiles,
      ...includedRegistries,
      ...registrySourcePaths,
    ].sort((left, right) => left.localeCompare(right)),
    cwd: resolvedCwd,
    registryConfig,
    registryFile: safeRegistryFile,
    registryItems: registry.items,
    repository,
  });
}

export async function addCatalogReferences(
  catalog: SourceRegistryCatalog,
  references: Iterable<string>,
  cwd = catalog.cwd || process.cwd()
): Promise<SourceRegistryCatalog> {
  const registryConfig = await getRegistriesConfig(cwd);
  const requestedReferences = [...new Set(references)];
  const graph = await fetchRegistryItemGraph({
    config: registryConfig,
    cwd,
    itemByReference: catalog.itemByReference,
    items: catalog.items.values(),
    references: requestedReferences,
    repository: catalog.repository,
  });
  const current = createCatalog({
    authoringPaths: catalog.authoringPaths,
    cwd: catalog.cwd,
    itemByReference: graph.itemByReference,
    registryConfig,
    registryFile: catalog.registryFile,
    registryItems: [...graph.items.values()],
    repository: catalog.repository,
  });

  for (const reference of requestedReferences) {
    const itemName = current.itemByReference.get(reference);
    const selection = itemName ? current.byReference.get(itemName) : undefined;
    if (!selection) {
      throw new CompositionValidationError(
        "The requested registry item is not a Next Hydra selection.",
        [`${reference} does not contain meta.nextHydra`]
      );
    }
    current.byReference.set(reference, selection);
  }

  for (const name of catalog.externalItemNames) {
    current.externalItemNames.add(name);
  }
  for (const itemName of graph.fetchedItemNames) {
    current.externalItemNames.add(itemName);
    const externalSelection = current.byReference.get(itemName);
    if (
      externalSelection !== undefined &&
      externalSelection.assets.length > 0
    ) {
      throw new CompositionValidationError(
        "External selections cannot declare separate binary assets in v1.",
        [
          `${externalSelection.id} must be included by the starter source registry; separately fetched binary assets are not supported`,
        ]
      );
    }
  }

  return current;
}

export function resolveCatalogSelection(
  catalog: SourceRegistryCatalog,
  reference: string
): CatalogSelection {
  const selection = catalog.byReference.get(reference);
  if (!selection) {
    throw new CompositionValidationError("Unknown composition selection.", [
      `${reference} is not present in ${catalog.registryFile}`,
    ]);
  }

  return selection;
}
