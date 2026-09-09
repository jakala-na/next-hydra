import {
  resolveCatalogSelection,
  resolveRegistryItemGraph,
} from "./catalog.js";
import { CompositionValidationError } from "./errors.js";
import { mergePackageRequirements } from "./packages.js";
import {
  isManagedApplicationSource,
  resolveRegistryTarget,
  resolveWorkspacePath,
} from "./paths.js";
import { planSlotTemplates, slotCompositionSchema } from "./slot-templates.js";
import type {
  CatalogSelection,
  CompositionPlan,
  PackageRequirement,
  PackageRequirementTarget,
  PlannedCompositionTemplate,
  PnpmPatch,
  ProviderDependency,
  ProviderSlot,
  SourceRegistryCatalog,
  TypeScriptPathAlias,
  TypeScriptPathAliasTarget,
  WorkspaceSelection,
} from "./types.js";
import { PROVIDER_ALIASES, PROVIDER_SLOTS } from "./types.js";

function uniqueSorted(values: Iterable<string>): string[] {
  // eslint-disable-next-line unicorn/no-array-sort -- The newly-created array is safe to sort in place.
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function itemTargets(
  catalog: SourceRegistryCatalog,
  itemName: string
): string[] {
  const item = catalog.items.get(itemName);
  if (!item) {
    throw new CompositionValidationError("Missing registry item.", [
      `${itemName} is not in the source registry`,
    ]);
  }

  return uniqueSorted(
    (item.files ?? []).map((file) => {
      if (!file.target) {
        throw new CompositionValidationError(
          "Registry items require explicit targets.",
          [`${itemName}:${file.path} does not declare files[].target`]
        );
      }

      return resolveRegistryTarget(file.target);
    })
  );
}

function itemManagedTargets(
  catalog: SourceRegistryCatalog,
  itemName: string
): string[] {
  const item = catalog.items.get(itemName);
  if (!item) {
    throw new CompositionValidationError("Missing registry item.", [
      `${itemName} is not in the source registry`,
    ]);
  }

  return uniqueSorted(
    (item.files ?? [])
      .filter((file) => isManagedApplicationSource(file.path, file.target))
      .map((file) => {
        if (!file.target) {
          throw new CompositionValidationError(
            "Managed application files require explicit targets.",
            [`${itemName}:${file.path} does not declare files[].target`]
          );
        }
        return resolveRegistryTarget(file.target);
      })
  );
}

function resolveProviders(
  catalog: SourceRegistryCatalog,
  selection: WorkspaceSelection
): Map<ProviderSlot, CatalogSelection> {
  const providers = new Map<ProviderSlot, CatalogSelection>();
  const issues: string[] = [];

  for (const slot of PROVIDER_SLOTS) {
    const reference = selection.providers[slot];
    if (!reference) {
      continue;
    }
    const candidate = resolveCatalogSelection(catalog, reference);
    if (candidate.kind !== "provider" || candidate.slot !== slot) {
      issues.push(
        `${reference} is ${candidate.kind}${candidate.slot ? ` for ${candidate.slot}` : ""}, not a ${slot} provider`
      );
      continue;
    }
    providers.set(slot, candidate);
  }

  if (issues.length > 0) {
    throw new CompositionValidationError(
      "Provider Slot cardinality is invalid.",
      issues
    );
  }

  return providers;
}

function validateProviderRequirements(
  selections: Iterable<CatalogSelection>,
  providers: ReadonlyMap<ProviderSlot, CatalogSelection>
): void {
  const issues: string[] = [];
  for (const selection of selections) {
    for (const slot of PROVIDER_SLOTS) {
      const requirement = selection.providerSlots?.[slot] ?? "optional";
      const article = slot === "auth" ? "an" : "a";
      if (requirement === "required" && !providers.has(slot)) {
        issues.push(`${selection.id} requires ${article} ${slot} provider`);
      }
      if (requirement === "forbidden" && providers.has(slot)) {
        issues.push(`${selection.id} forbids ${article} ${slot} provider`);
      }
    }
  }
  if (issues.length > 0) {
    throw new CompositionValidationError(
      "The selected registry items and Providers are incompatible.",
      issues
    );
  }
}

function resolveAddOns(
  catalog: SourceRegistryCatalog,
  references: string[],
  providers: CatalogSelection[]
): CatalogSelection[] {
  const selected = new Map<string, CatalogSelection>();
  const queue = references.map((reference) =>
    resolveCatalogSelection(catalog, reference)
  );
  const selectedProviderIds = new Set(providers.map((provider) => provider.id));

  const enqueueRequiredAddOns = (selection: CatalogSelection) => {
    for (const requiredId of selection.compatibility.requires) {
      if (selectedProviderIds.has(requiredId) || selected.has(requiredId)) {
        continue;
      }
      const required = catalog.byId.get(requiredId);
      if (required?.kind === "add-on") {
        queue.push(required);
      }
    }
  };

  for (const provider of providers) {
    enqueueRequiredAddOns(provider);
  }

  while (queue.length > 0) {
    const candidate = queue.shift();
    if (!candidate) {
      continue;
    }
    if (candidate.kind !== "add-on") {
      throw new CompositionValidationError("Invalid Add-on selection.", [
        `${candidate.id} is ${candidate.kind}, not an add-on`,
      ]);
    }
    if (selected.has(candidate.id)) {
      continue;
    }
    selected.set(candidate.id, candidate);
    enqueueRequiredAddOns(candidate);
  }

  // eslint-disable-next-line unicorn/no-array-sort -- The newly-created array is safe to sort in place.
  return [...selected.values()].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
}

function validateCompatibility(selections: CatalogSelection[]): void {
  const selectedIds = new Set(selections.map((selection) => selection.id));
  const issues: string[] = [];

  for (const selection of selections) {
    for (const requiredId of selection.compatibility.requires) {
      if (!selectedIds.has(requiredId)) {
        issues.push(`${selection.id} requires ${requiredId}`);
      }
    }
    for (const conflictingId of selection.compatibility.conflicts) {
      if (selectedIds.has(conflictingId)) {
        issues.push(`${selection.id} conflicts with ${conflictingId}`);
      }
    }
  }

  if (issues.length > 0) {
    throw new CompositionValidationError(
      "The requested selections are incompatible.",
      uniqueSorted(issues)
    );
  }
}

const BASELINE_PROVIDER_DEPENDENCIES = [
  { cwd: "apps/admin", section: "dependencies", slot: "auth" },
  { cwd: "apps/api", section: "dependencies", slot: "auth" },
  { cwd: "apps/cli", section: "dependencies", slot: "auth" },
  { cwd: "apps/web", section: "dependencies", slot: "auth" },
  { cwd: "packages/feature-flags", section: "dependencies", slot: "auth" },
  { cwd: "tests/e2e", section: "devDependencies", slot: "auth" },
  { cwd: "apps/cli", section: "dependencies", slot: "cms" },
  { cwd: "apps/web", section: "dependencies", slot: "cms" },
  { cwd: "apps/api", section: "dependencies", slot: "commerce" },
  { cwd: "apps/cli", section: "dependencies", slot: "commerce" },
  { cwd: "apps/web", section: "dependencies", slot: "commerce" },
  { cwd: "tests/e2e", section: "devDependencies", slot: "commerce" },
] satisfies ProviderDependency[];

function selectedProviderDependencies(
  selections: CatalogSelection[],
  usesLegacyBaseline: boolean
): ProviderDependency[] {
  return [
    ...(usesLegacyBaseline ? BASELINE_PROVIDER_DEPENDENCIES : []),
    ...selections.flatMap((selection) => selection.providerDependencies),
  ];
}

function catalogProviderDependencies(
  catalog: SourceRegistryCatalog
): ProviderDependency[] {
  return [
    ...BASELINE_PROVIDER_DEPENDENCIES,
    ...catalog.selections.flatMap(
      (selection) => selection.providerDependencies
    ),
  ];
}

export function resolveProviderRequirements(
  providers: Map<ProviderSlot, CatalogSelection>,
  dependencies: ProviderDependency[]
) {
  const packageRequirements: PackageRequirement[] = [];
  const typeScriptPathAliases = new Map<string, TypeScriptPathAlias>();

  for (const dependency of dependencies) {
    const provider = providers.get(dependency.slot);
    if (!provider?.binding) {
      throw new CompositionValidationError("Provider binding is missing.", [
        `${dependency.slot} does not supply a Provider binding`,
      ]);
    }
    const alias = PROVIDER_ALIASES[dependency.slot];
    packageRequirements.push({
      cwd: dependency.cwd,
      name: alias,
      section: dependency.section,
      specifier: provider.binding.specifier,
    });
    if (provider.binding.sourcePath) {
      typeScriptPathAliases.set(`${dependency.cwd}\0${alias}`, {
        alias,
        cwd: dependency.cwd,
        sourcePath: resolveWorkspacePath(
          provider.binding.sourcePath,
          `${provider.id} Provider binding source path`
        ),
      });
    }
  }

  // eslint-disable-next-line unicorn/no-array-sort -- The newly-created array is safe to sort in place.
  const aliases = [...typeScriptPathAliases.values()].sort((left, right) =>
    `${left.cwd}/${left.alias}`.localeCompare(`${right.cwd}/${right.alias}`)
  );
  return { packageRequirements, typeScriptPathAliases: aliases };
}

function resolveSelectionTypeScriptPathAliases(
  selections: CatalogSelection[]
): TypeScriptPathAlias[] {
  return selections.flatMap((selection) =>
    (selection.typeScriptAliases ?? []).map((alias) => ({
      alias: alias.alias,
      cwd: resolveWorkspacePath(
        alias.cwd,
        `${selection.id} TypeScript alias consumer`
      ),
      sourcePath: resolveWorkspacePath(
        alias.sourcePath,
        `${selection.id} TypeScript alias source path`
      ),
    }))
  );
}

function mergeTypeScriptPathAliases(
  aliases: TypeScriptPathAlias[]
): TypeScriptPathAlias[] {
  const merged = new Map<string, TypeScriptPathAlias>();
  const issues: string[] = [];

  for (const alias of aliases) {
    const key = `${alias.cwd}\0${alias.alias}`;
    const existing = merged.get(key);
    if (existing && existing.sourcePath !== alias.sourcePath) {
      issues.push(
        `${alias.cwd} maps ${alias.alias} to both ${existing.sourcePath} and ${alias.sourcePath}`
      );
      continue;
    }
    merged.set(key, alias);
  }

  if (issues.length > 0) {
    throw new CompositionValidationError(
      "TypeScript path aliases conflict.",
      uniqueSorted(issues)
    );
  }

  // eslint-disable-next-line unicorn/no-array-sort -- The newly-created array is safe to sort in place.
  return [...merged.values()].sort((left, right) =>
    `${left.cwd}/${left.alias}`.localeCompare(`${right.cwd}/${right.alias}`)
  );
}

function catalogTypeScriptPathAliases(
  dependencies: ProviderDependency[],
  selections: CatalogSelection[]
): TypeScriptPathAliasTarget[] {
  const aliases = new Map<string, TypeScriptPathAliasTarget>();
  for (const dependency of dependencies) {
    const alias = PROVIDER_ALIASES[dependency.slot];
    aliases.set(`${dependency.cwd}\0${alias}`, {
      alias,
      cwd: dependency.cwd,
    });
  }
  for (const selection of selections) {
    for (const alias of selection.typeScriptAliases ?? []) {
      aliases.set(`${alias.cwd}\0${alias.alias}`, {
        alias: alias.alias,
        cwd: alias.cwd,
      });
    }
  }

  // eslint-disable-next-line unicorn/no-array-sort -- The newly-created array is safe to sort in place.
  return [...aliases.values()].sort((left, right) =>
    `${left.cwd}/${left.alias}`.localeCompare(`${right.cwd}/${right.alias}`)
  );
}

function catalogPackageRequirementTargets(
  catalog: SourceRegistryCatalog,
  providerDependencies: ProviderDependency[]
): PackageRequirementTarget[] {
  const targets = new Map<string, PackageRequirementTarget>();
  const add = (target: PackageRequirementTarget) => {
    targets.set(`${target.cwd}\0${target.section}\0${target.name}`, target);
  };

  for (const selection of catalog.selections) {
    for (const { cwd, name, section } of selection.packages) {
      add({ cwd, name, section });
    }
  }
  for (const dependency of providerDependencies) {
    add({
      cwd: dependency.cwd,
      name: PROVIDER_ALIASES[dependency.slot],
      section: dependency.section,
    });
  }

  // eslint-disable-next-line unicorn/no-array-sort -- The newly-created array is safe to sort in place.
  return [...targets.values()].sort((left, right) =>
    `${left.cwd}/${left.section}/${left.name}`.localeCompare(
      `${right.cwd}/${right.section}/${right.name}`
    )
  );
}

function resolvePnpmPatches(selections: CatalogSelection[]): PnpmPatch[] {
  const patches = new Map<string, PnpmPatch>();
  const issues: string[] = [];

  for (const selection of selections) {
    for (const patch of selection.pnpmPatches) {
      const normalized = {
        ...patch,
        path: resolveWorkspacePath(
          patch.path,
          `${selection.id} pnpm patch path`
        ),
      };
      const existing = patches.get(normalized.dependency);
      if (existing && existing.path !== normalized.path) {
        issues.push(
          `${normalized.dependency} is patched by both ${existing.path} and ${normalized.path}`
        );
      } else {
        patches.set(normalized.dependency, normalized);
      }
    }
  }

  if (issues.length > 0) {
    throw new CompositionValidationError("pnpm patches conflict.", issues);
  }

  // eslint-disable-next-line unicorn/no-array-sort -- The newly-created array is safe to sort in place.
  return [...patches.values()].sort((left, right) =>
    left.dependency.localeCompare(right.dependency)
  );
}

function catalogPnpmPatches(catalog: SourceRegistryCatalog): PnpmPatch[] {
  const patches = new Map<string, PnpmPatch>();

  for (const selection of catalog.selections) {
    for (const patch of selection.pnpmPatches) {
      const normalized = {
        ...patch,
        path: resolveWorkspacePath(
          patch.path,
          `${selection.id} pnpm patch path`
        ),
      };
      if (!patches.has(normalized.dependency)) {
        patches.set(normalized.dependency, normalized);
      }
    }
  }

  // eslint-disable-next-line unicorn/no-array-sort -- The newly-created array is safe to sort in place.
  return [...patches.values()].sort((left, right) =>
    left.dependency.localeCompare(right.dependency)
  );
}

function catalogVariableTargets(catalog: SourceRegistryCatalog): string[] {
  return uniqueSorted([
    ...[...catalog.items.values()].flatMap(
      (item) =>
        item.files?.map((file) => {
          if (!file.target) {
            throw new CompositionValidationError(
              "Registry items require explicit targets.",
              [`${item.name}:${file.path} does not declare files[].target`]
            );
          }
          return resolveRegistryTarget(file.target);
        }) ?? []
    ),
    ...[...catalog.items.values()].flatMap((item) =>
      slotCompositionSchema
        .parse(item.meta?.composition ?? {})
        .templates.map((template) =>
          resolveWorkspacePath(template.target, "template target")
        )
    ),
  ]);
}

function validateMaterializationTargets(options: {
  catalog: SourceRegistryCatalog;
  registryItems: string[];
  assets: CatalogSelection["assets"];
  templates: PlannedCompositionTemplate[];
}): void {
  const claims = new Map<string, string>();
  const issues: string[] = [];
  const claim = (target: string, owner: string) => {
    const existing = claims.get(target);
    if (existing && existing !== owner) {
      issues.push(`${target} is claimed by both ${existing} and ${owner}`);
      return;
    }
    claims.set(target, owner);
  };

  for (const item of options.registryItems) {
    for (const target of itemTargets(options.catalog, item)) {
      claim(target, `registry item ${item}`);
    }
  }
  for (const asset of options.assets) {
    claim(asset.target, `asset ${asset.source}`);
  }
  for (const template of options.templates) {
    claim(template.target, `template ${template.source}`);
  }
  if (issues.length > 0) {
    throw new CompositionValidationError(
      "Materialization targets conflict.",
      uniqueSorted(issues)
    );
  }
}

function resolveBuiltInContributions(
  catalog: SourceRegistryCatalog,
  providers: Map<ProviderSlot, CatalogSelection>,
  selected: CatalogSelection[]
): CatalogSelection[] {
  const selections = [...selected];
  const included = new Set(selections.map((item) => item.itemName));
  const selectionsByItem = new Map(
    catalog.selections.map((item) => [item.itemName, item])
  );
  // New built-ins join the queue so their own conditions and registry dependencies are considered.
  for (const owner of selections) {
    const references = (owner.conditionalDependencies ?? [])
      .filter((dependency) =>
        dependency.providers.every((slot) => providers.has(slot))
      )
      .flatMap((dependency) => dependency.items);
    const roots = references.map((reference) => {
      const contribution = resolveCatalogSelection(catalog, reference);
      if (
        !["contribution", "integration", "package"].includes(contribution.kind)
      ) {
        throw new CompositionValidationError(
          "Invalid conditional dependency.",
          [`${reference} must be a package or package integration`]
        );
      }
      return contribution.itemName;
    });
    for (const name of resolveRegistryItemGraph(catalog, [
      owner.itemName,
      ...roots,
    ])) {
      if (included.has(name)) {
        continue;
      }
      const dependency = selectionsByItem.get(name);
      if (
        dependency &&
        ["contribution", "integration", "package"].includes(dependency.kind)
      ) {
        included.add(name);
        selections.push(dependency);
      }
    }
  }
  return selections;
}

function legacyBaselineContributions(
  catalog: SourceRegistryCatalog
): CatalogSelection[] {
  // The clone-based reference workflow retains its web source in place. Its
  // contributed backends still need to be selected explicitly before pruning.
  // Shared-application workflows already discover these through registryDependencies.
  const reference = catalog.items.get("app-web-reference");
  if (!reference) {
    return [];
  }
  const dependencies = new Set(
    resolveRegistryItemGraph(catalog, [reference.name])
  );
  return catalog.selections.filter(
    (selection) =>
      selection.kind === "contribution" && dependencies.has(selection.itemName)
  );
}

export function planComposition(
  catalog: SourceRegistryCatalog,
  selection: WorkspaceSelection
): CompositionPlan {
  // One shared web application; installed packages extend it through registry dependencies.
  const providers = resolveProviders(catalog, selection);
  const application = catalog.byReference.get("app-web");
  const usesLegacyBaseline = !application;
  if (usesLegacyBaseline) {
    const missing = PROVIDER_SLOTS.filter((slot) => !providers.has(slot));
    if (missing.length > 0) {
      throw new CompositionValidationError(
        "Provider Slot cardinality is invalid.",
        missing.map(
          (slot) =>
            `${slot} requires exactly one provider in a registry without the shared application`
        )
      );
    }
  }
  validateProviderRequirements(application ? [application] : [], providers);
  const providerSelections = PROVIDER_SLOTS.flatMap((slot) => {
    const provider = providers.get(slot);
    return provider ? [provider] : [];
  });
  const addOns = resolveAddOns(catalog, selection.addOns, providerSelections);
  const selections = resolveBuiltInContributions(catalog, providers, [
    ...(usesLegacyBaseline ? legacyBaselineContributions(catalog) : []),
    ...(application ? [application] : []),
    ...providerSelections,
    ...addOns,
  ]);

  // Required provider slots also apply to packages reached through registry
  // dependencies (for example Commerce requires an Auth provider).
  validateProviderRequirements(selections, providers);
  validateCompatibility(selections);
  const providerDependencies = selectedProviderDependencies(
    selections,
    usesLegacyBaseline
  );
  const catalogDependencies = catalogProviderDependencies(catalog);
  const providerRequirements = resolveProviderRequirements(
    providers,
    providerDependencies
  );
  const typeScriptPathAliases = mergeTypeScriptPathAliases([
    ...providerRequirements.typeScriptPathAliases,
    ...resolveSelectionTypeScriptPathAliases(selections),
  ]);
  const packageRequirements = mergePackageRequirements([
    ...selections.flatMap((selected) => selected.packages),
    ...providerRequirements.packageRequirements,
  ]);

  const entryItems = uniqueSorted(
    selections.map((selected) => selected.itemName)
  );
  const registryItems = resolveRegistryItemGraph(catalog, entryItems);
  const assets = selections
    .flatMap((selected) =>
      selected.assets.map((asset) => ({
        owner: selected.itemName,
        source: resolveWorkspacePath(
          asset.source,
          `${selected.id} asset source`
        ),
        target: resolveWorkspacePath(
          asset.target,
          `${selected.id} asset target`
        ),
      }))
    )
    // eslint-disable-next-line unicorn/no-array-sort -- flatMap creates a fresh array.
    .sort((left, right) => left.target.localeCompare(right.target));
  const pnpmPatches = resolvePnpmPatches(selections);
  const templates = planSlotTemplates(
    registryItems.map((name) => {
      const item = catalog.items.get(name);
      if (!item) {
        throw new Error(`Missing selected registry item: ${name}`);
      }
      return item;
    })
  );
  const maintainerCopyTargets = uniqueSorted(
    selections.flatMap((selectedSelection) =>
      (selectedSelection.maintainerWorkspace?.copy ?? []).map((target) =>
        resolveWorkspacePath(
          target,
          `${selectedSelection.id} maintainer workspace copy target`
        )
      )
    )
  );
  const assetTargets = new Set(assets.map((asset) => asset.target));
  const missingPatchAssets = pnpmPatches
    .filter((patch) => !assetTargets.has(patch.path))
    .map(
      (patch) =>
        `${patch.dependency} references ${patch.path}, which is not a selected asset target`
    );
  if (missingPatchAssets.length > 0) {
    throw new CompositionValidationError(
      "pnpm patch files are missing.",
      missingPatchAssets
    );
  }
  validateMaterializationTargets({
    assets,
    catalog,
    registryItems,
    templates,
  });
  const managedTargets = uniqueSorted([
    ...registryItems.flatMap((item) => itemManagedTargets(catalog, item)),
    ...templates.map((template) => template.target),
  ]);
  const directlySelectedAddOnIds = new Set(
    selection.addOns.map(
      (reference) => resolveCatalogSelection(catalog, reference).id
    )
  );
  const requiredAddOnIds = addOns
    .filter((addOn) => !directlySelectedAddOnIds.has(addOn.id))
    .map((addOn) => addOn.id);
  const registryVariableTargets = catalogVariableTargets(catalog);
  const variableRegistryTargets = new Set(registryVariableTargets);

  return {
    assets,
    catalogManagedTargets: catalog.managedTargets.filter((target) =>
      variableRegistryTargets.has(target)
    ),
    catalogPackageRequirementTargets: catalogPackageRequirementTargets(
      catalog,
      catalogDependencies
    ),
    catalogPnpmPatches: catalogPnpmPatches(catalog),
    catalogTypeScriptPathAliases: catalogTypeScriptPathAliases(
      catalogDependencies,
      catalog.selections
    ),
    entryItems,
    instructions: [
      ...new Set(
        selections
          .map((selected) => catalog.items.get(selected.itemName)?.docs)
          .filter((value): value is string => Boolean(value))
      ),
    ],
    maintainerCopyTargets,
    managedTargets,
    packageRequirements,
    pnpmPatches,
    registryItems,
    selection: {
      ...selection,
      addOns: uniqueSorted([...selection.addOns, ...requiredAddOnIds]),
      providers: { ...selection.providers },
    },
    selections,
    templates,
    typeScriptPathAliases,
    variableTargets: uniqueSorted([
      ...registryVariableTargets,
      ...catalog.selections.flatMap((selected) =>
        selected.assets.map((asset) =>
          resolveWorkspacePath(asset.target, `${selected.id} asset target`)
        )
      ),
    ]),
  };
}

export function selectionFromPreset(
  catalog: SourceRegistryCatalog,
  reference: string
): WorkspaceSelection {
  const preset = resolveCatalogSelection(catalog, reference);
  if (preset.kind !== "preset" || !preset.selections?.providers) {
    throw new CompositionValidationError("Invalid Preset selection.", [
      `${reference} is not a Next Hydra preset`,
    ]);
  }

  const { addOns, providers } = preset.selections;

  return {
    addOns,
    providers: { ...providers },
  };
}
