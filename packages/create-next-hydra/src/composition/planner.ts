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
import type {
  AppSlot,
  CatalogSelection,
  CompositionPlan,
  PackageRequirement,
  PackageRequirementTarget,
  PnpmPatch,
  ProviderDependency,
  ProviderSlot,
  SourceRegistryCatalog,
  TypeScriptPathAlias,
  TypeScriptPathAliasTarget,
  WorkspaceSelection,
} from "./types.js";
import { APP_SLOTS, PROVIDER_ALIASES, PROVIDER_SLOTS } from "./types.js";

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

function resolveAppProfiles(
  catalog: SourceRegistryCatalog,
  selection: WorkspaceSelection
): Map<AppSlot, CatalogSelection> {
  const profiles = new Map<AppSlot, CatalogSelection>();
  const issues: string[] = [];

  for (const app of APP_SLOTS) {
    const reference = selection.apps?.[app];
    if (!reference) {
      continue;
    }
    const candidate = resolveCatalogSelection(catalog, reference);
    if (candidate.kind !== "app-profile" || candidate.app !== app) {
      issues.push(
        `${reference} is ${candidate.kind}${candidate.app ? ` for ${candidate.app}` : ""}, not a ${app} app profile`
      );
      continue;
    }
    profiles.set(app, candidate);
  }

  if (issues.length > 0) {
    throw new CompositionValidationError(
      "App Profile selection is invalid.",
      issues
    );
  }

  return profiles;
}

function validateAppProfileProviders(
  profiles: Iterable<CatalogSelection>,
  providers: ReadonlyMap<ProviderSlot, CatalogSelection>
): void {
  const issues: string[] = [];
  for (const profile of profiles) {
    for (const slot of PROVIDER_SLOTS) {
      const requirement = profile.providerSlots?.[slot] ?? "optional";
      if (requirement === "required" && !providers.has(slot)) {
        issues.push(`${profile.id} requires a ${slot} provider`);
      }
      if (requirement === "forbidden" && providers.has(slot)) {
        issues.push(`${profile.id} forbids a ${slot} provider`);
      }
    }
  }
  if (issues.length > 0) {
    throw new CompositionValidationError(
      "The selected App Profiles and Providers are incompatible.",
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

function resolveProviderRequirements(
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

function catalogTypeScriptPathAliases(
  dependencies: ProviderDependency[]
): TypeScriptPathAliasTarget[] {
  const aliases = new Map<string, TypeScriptPathAliasTarget>();
  for (const dependency of dependencies) {
    const alias = PROVIDER_ALIASES[dependency.slot];
    aliases.set(`${dependency.cwd}\0${alias}`, {
      alias,
      cwd: dependency.cwd,
    });
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

function catalogVariableTargets(
  catalog: SourceRegistryCatalog,
  includeAppProfiles: boolean
): string[] {
  const appProfileItems = new Set(
    catalog.selections
      .filter(({ kind }) => kind === "app-profile")
      .map(({ itemName }) => itemName)
  );
  return uniqueSorted(
    [...catalog.items.values()]
      .filter(
        (item) => includeAppProfiles || !appProfileItems.has(item.name)
      )
      .flatMap((item) =>
        item.files?.map((file) => {
          if (!file.target) {
            throw new CompositionValidationError(
              "Registry items require explicit targets.",
              [`${item.name}:${file.path} does not declare files[].target`]
            );
          }
          return resolveRegistryTarget(file.target);
        }) ?? []
      )
  );
}

function validateMaterializationTargets(options: {
  catalog: SourceRegistryCatalog;
  registryItems: string[];
  assets: CatalogSelection["assets"];
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
  if (issues.length > 0) {
    throw new CompositionValidationError(
      "Materialization targets conflict.",
      uniqueSorted(issues)
    );
  }
}

export function planComposition(
  catalog: SourceRegistryCatalog,
  selection: WorkspaceSelection
): CompositionPlan {
  const providers = resolveProviders(catalog, selection);
  const appProfiles = resolveAppProfiles(catalog, selection);
  const usesLegacyBaseline = appProfiles.size === 0;
  if (usesLegacyBaseline) {
    const missing = PROVIDER_SLOTS.filter((slot) => !providers.has(slot));
    if (missing.length > 0) {
      throw new CompositionValidationError(
        "Provider Slot cardinality is invalid.",
        missing.map(
          (slot) =>
            `${slot} requires exactly one provider when no App Profile is selected`
        )
      );
    }
  }
  validateAppProfileProviders(appProfiles.values(), providers);
  const providerSelections = PROVIDER_SLOTS.flatMap((slot) => {
    const provider = providers.get(slot);
    return provider ? [provider] : [];
  });
  const appProfileSelections = APP_SLOTS.flatMap((app) => {
    const profile = appProfiles.get(app);
    return profile ? [profile] : [];
  });
  const addOns = resolveAddOns(catalog, selection.addOns, providerSelections);
  const selections = [
    ...appProfileSelections,
    ...providerSelections,
    ...addOns,
  ];

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
  });
  const managedTargets = uniqueSorted(
    registryItems.flatMap((item) => itemManagedTargets(catalog, item))
  );
  const directlySelectedAddOnIds = new Set(
    selection.addOns.map(
      (reference) => resolveCatalogSelection(catalog, reference).id
    )
  );
  const requiredAddOnIds = addOns
    .filter((addOn) => !directlySelectedAddOnIds.has(addOn.id))
    .map((addOn) => addOn.id);

  return {
    assets,
    catalogManagedTargets: catalog.managedTargets,
    catalogPackageRequirementTargets: catalogPackageRequirementTargets(
      catalog,
      catalogDependencies
    ),
    catalogPnpmPatches: catalogPnpmPatches(catalog),
    catalogTypeScriptPathAliases:
      catalogTypeScriptPathAliases(catalogDependencies),
    entryItems,
    instructions: [
      ...new Set(
        selections
          .map((selected) => catalog.items.get(selected.itemName)?.docs)
          .filter((value): value is string => Boolean(value))
      ),
    ],
    managedTargets,
    packageRequirements,
    pnpmPatches,
    registryItems,
    selection: {
      ...selection,
      addOns: uniqueSorted([...selection.addOns, ...requiredAddOnIds]),
      apps: { ...selection.apps },
      providers: { ...selection.providers },
    },
    selections,
    typeScriptPathAliases: providerRequirements.typeScriptPathAliases,
    variableTargets: uniqueSorted([
      ...catalogVariableTargets(catalog, appProfiles.size > 0),
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
    apps: { ...preset.selections.apps },
    providers: { ...providers },
  };
}
