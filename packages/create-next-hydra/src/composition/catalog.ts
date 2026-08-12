import { readFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  getRegistriesConfig,
  getRegistryItems,
  loadRegistry,
} from "shadcn/registry";
import type { RegistryItem } from "shadcn/schema";

import { pathExists } from "../fs-utils.js";
import { CompositionValidationError } from "./errors.js";
import {
  isManagedApplicationSource,
  resolveRegistryTarget,
  resolveWorkspacePath,
} from "./paths.js";
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
  /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/;

const OFFICIAL_REFERENCES: Record<string, string> = {
  commercetools: "next-hydra/commerce/commercetools",
  contentstack: "next-hydra/cms/contentstack",
  drupal: "next-hydra/cms/drupal",
  standard: "next-hydra/preset/standard",
  workos: "next-hydra/auth/workos",
};

const OFFICIAL_ITEM_NAMES = [
  "auth-workos",
  "cms-contentstack",
  "cms-drupal",
  "commerce-commercetools",
  "drupal-hydra",
  "next-hydra-standard",
] as const;

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
    const candidate = item.meta?.nextHydra;
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

  const managedTargets = [
    ...new Set(
      options.registryItems.flatMap(
        (item) =>
          item.files
            ?.filter((file) =>
              isManagedApplicationSource(file.path, file.target)
            )
            .map((file) => {
              if (!file.target) {
                throw new CompositionValidationError(
                  "Managed application files require explicit targets.",
                  [`${item.name}:${file.path} does not declare files[].target`]
                );
              }
              return resolveRegistryTarget(file.target);
            }) ?? []
      )
    ),
  ].sort((left, right) => left.localeCompare(right));

  return {
    authoringPaths: options.authoringPaths,
    byId,
    byReference,
    cwd: options.cwd,
    itemByReference,
    items,
    managedTargets,
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
      // biome-ignore lint/performance/noAwaitInLoops: graph discovery is breadth-first and each item reveals the next references
      const resolvedReference = await resolveRegistryReference(
        reference,
        options.cwd
      );
      const [artifact] = await fetchItems([resolvedReference], {
        config: options.config,
      });
      if (!artifact) {
        throw new CompositionValidationError(
          "The registry dependency graph is incomplete.",
          [`${reference} returned no registry item`]
        );
      }

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
  }

  return { fetchedItemNames, itemByReference, items };
}

export async function loadSourceRegistryCatalog(
  cwd: string,
  registryFile = "registry.json"
): Promise<SourceRegistryCatalog> {
  const resolvedCwd = path.resolve(cwd);
  const safeRegistryFile = resolveWorkspacePath(
    registryFile,
    "source registry file"
  );
  const registryPath = path.resolve(resolvedCwd, safeRegistryFile);
  const sourceRegistry = JSON.parse(await readFile(registryPath, "utf8")) as {
    homepage?: string;
    include?: string[];
  };
  const repository = sourceRegistry.homepage?.match(
    GITHUB_HOMEPAGE_PATTERN
  )?.[1];
  const registry = await loadRegistry({
    cwd: resolvedCwd,
    registryFile: safeRegistryFile,
  });
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

export async function loadGitHubSourceRegistryCatalog(
  repository: string,
  ref?: string
): Promise<SourceRegistryCatalog> {
  const suffix = ref ? `#${ref}` : "";
  const addresses = OFFICIAL_ITEM_NAMES.map(
    (item) => `${repository}/${item}${suffix}`
  );
  const registryItems = await getRegistryItems(addresses);
  const registryConfig = await getRegistriesConfig(process.cwd());
  const itemByReference = new Map(
    registryItems.flatMap((item, index) => {
      const address = addresses[index];
      return address ? [[address, item.name] as const] : [];
    })
  );

  return createCatalog({
    authoringPaths: [],
    cwd: "",
    itemByReference,
    registryConfig,
    registryFile: `${repository}/registry.json${suffix}`,
    registryItems,
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

  for (const itemName of graph.fetchedItemNames) {
    const externalSelection = current.byReference.get(itemName);
    if (externalSelection?.assets.length) {
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
