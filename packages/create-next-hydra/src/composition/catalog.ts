import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  getRegistriesConfig,
  getRegistryItems,
  loadRegistry,
} from "shadcn/registry";
import type { RegistryItem } from "shadcn/schema";

import { pathExists } from "../fs-utils.js";
import { CompositionValidationError } from "./errors.js";
import {
  formatZodError,
  NEXT_HYDRA_SELECTION_SCHEMA_URL,
  selectionDefinitionSchema,
} from "./schema.js";
import type { CatalogSelection, SourceRegistryCatalog } from "./types.js";

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
  authoringPaths: string[];
  registryItems: RegistryItem[];
}): SourceRegistryCatalog {
  const items = new Map(options.registryItems.map((item) => [item.name, item]));
  const selections: CatalogSelection[] = [];
  const issues: string[] = [];

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
  }

  for (const [reference, id] of Object.entries(OFFICIAL_REFERENCES)) {
    const selection = byId.get(id);
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
    items,
    registryFile: options.registryFile,
    selections: [...selections].sort((left, right) =>
      left.id.localeCompare(right.id)
    ),
  };
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

export async function loadSourceRegistryCatalog(
  cwd: string,
  registryFile = "registry.json"
): Promise<SourceRegistryCatalog> {
  const resolvedCwd = path.resolve(cwd);
  const registryPath = path.resolve(resolvedCwd, registryFile);
  const sourceRegistry = JSON.parse(await readFile(registryPath, "utf8")) as {
    include?: string[];
  };
  const registry = await loadRegistry({ cwd: resolvedCwd, registryFile });
  return createCatalog({
    authoringPaths: [registryFile, ...(sourceRegistry.include ?? [])].sort(
      (left, right) => left.localeCompare(right)
    ),
    cwd: resolvedCwd,
    registryFile,
    registryItems: registry.items,
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

  return createCatalog({
    authoringPaths: [],
    cwd: "",
    registryFile: `${repository}/registry.json${suffix}`,
    registryItems,
  });
}

export async function addCatalogReferences(
  catalog: SourceRegistryCatalog,
  references: Iterable<string>,
  cwd = catalog.cwd || process.cwd()
): Promise<SourceRegistryCatalog> {
  let current = catalog;
  const registryConfig = await getRegistriesConfig(cwd);

  for (const reference of new Set(references)) {
    if (current.byReference.has(reference)) {
      continue;
    }
    // Each fetched item can make a later reference resolvable by Selection ID,
    // so the catalog is intentionally expanded in request order.
    // biome-ignore lint/performance/noAwaitInLoops: each iteration depends on the expanded catalog
    const resolvedReference = await resolveRegistryReference(reference, cwd);
    const artifacts = await getRegistryItems([resolvedReference], {
      config: registryConfig,
    });
    const [primary] = artifacts;
    if (!primary) {
      throw new CompositionValidationError(
        "The registry returned no Selection Definition.",
        [reference]
      );
    }

    const items = new Map(current.items);
    for (const artifact of artifacts) {
      items.set(artifact.name, artifact);
    }
    current = createCatalog({
      authoringPaths: current.authoringPaths,
      cwd: current.cwd,
      registryFile: current.registryFile,
      registryItems: [...items.values()],
    });
    const selection = current.byReference.get(primary.name);
    if (!selection) {
      throw new CompositionValidationError(
        "The requested registry item is not a Next Hydra selection.",
        [`${reference} does not contain meta.nextHydra`]
      );
    }
    if (selection.assets.length > 0) {
      throw new CompositionValidationError(
        "External selections cannot declare separate binary assets in v1.",
        [
          `${reference} must be included by the starter source registry; separately fetched binary assets are not supported`,
        ]
      );
    }
    current.byReference.set(reference, selection);
    current.byReference.set(resolvedReference, selection);
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
