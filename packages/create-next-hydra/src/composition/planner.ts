import { resolveCatalogSelection } from "./catalog.js";
import { CompositionValidationError } from "./errors.js";
import {
  normalizeRoutePath,
  resolveRegistryTarget,
  routeTarget,
} from "./paths.js";
import type {
  CatalogSelection,
  CompositionPlan,
  PackageRequirement,
  PlannedInstallUnit,
  PlannedRoute,
  PnpmPatch,
  ProviderSlot,
  SourceRegistryCatalog,
  WorkspaceSelection,
} from "./types.js";
import { PROVIDER_SLOTS } from "./types.js";

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function itemTargets(
  catalog: SourceRegistryCatalog,
  itemName: string,
  cwd: string
): string[] {
  const item = catalog.items.get(itemName);
  if (!item) {
    throw new CompositionValidationError("Missing registry Install Unit.", [
      `${itemName} is referenced with cwd ${cwd} but is not in the source registry`,
    ]);
  }

  return uniqueSorted(
    (item.files ?? []).map((file) => {
      if (!file.target) {
        throw new CompositionValidationError(
          "Registry Install Units require explicit targets.",
          [`${itemName}:${file.path} does not declare files[].target`]
        );
      }

      return resolveRegistryTarget(cwd, file.target);
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
    const candidate = resolveCatalogSelection(
      catalog,
      selection.providers[slot]
    );
    if (candidate.kind !== "provider" || candidate.slot !== slot) {
      issues.push(
        `${selection.providers[slot]} is ${candidate.kind}${candidate.slot ? ` for ${candidate.slot}` : ""}, not a ${slot} provider`
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

function resolvePackageRequirements(
  selections: CatalogSelection[]
): PackageRequirement[] {
  const requirements = new Map<string, PackageRequirement>();
  const issues: string[] = [];

  for (const selection of selections) {
    for (const requirement of selection.packages) {
      const key = `${requirement.cwd}\0${requirement.section}\0${requirement.name}`;
      const existing = requirements.get(key);
      if (existing && existing.specifier !== requirement.specifier) {
        issues.push(
          `${requirement.cwd}/${requirement.section}.${requirement.name} is claimed as both ${existing.specifier} and ${requirement.specifier}`
        );
      } else {
        requirements.set(key, requirement);
      }
    }
  }

  if (issues.length > 0) {
    throw new CompositionValidationError(
      "Package requirements conflict.",
      issues
    );
  }

  return [...requirements.values()].sort((left, right) =>
    `${left.cwd}/${left.section}/${left.name}`.localeCompare(
      `${right.cwd}/${right.section}/${right.name}`
    )
  );
}

function catalogPackageRequirements(
  catalog: SourceRegistryCatalog
): PackageRequirement[] {
  const requirements = new Map<string, PackageRequirement>();

  for (const selection of catalog.selections) {
    for (const requirement of selection.packages) {
      const key = `${requirement.cwd}\0${requirement.section}\0${requirement.name}`;
      if (!requirements.has(key)) {
        requirements.set(key, requirement);
      }
    }
  }

  return [...requirements.values()].sort((left, right) =>
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
      const existing = patches.get(patch.dependency);
      if (existing && existing.path !== patch.path) {
        issues.push(
          `${patch.dependency} is patched by both ${existing.path} and ${patch.path}`
        );
      } else {
        patches.set(patch.dependency, patch);
      }
    }
  }

  if (issues.length > 0) {
    throw new CompositionValidationError("pnpm patches conflict.", issues);
  }

  return [...patches.values()].sort((left, right) =>
    left.dependency.localeCompare(right.dependency)
  );
}

function catalogPnpmPatches(catalog: SourceRegistryCatalog): PnpmPatch[] {
  const patches = new Map<string, PnpmPatch>();

  for (const selection of catalog.selections) {
    for (const patch of selection.pnpmPatches) {
      if (!patches.has(patch.dependency)) {
        patches.set(patch.dependency, patch);
      }
    }
  }

  return [...patches.values()].sort((left, right) =>
    left.dependency.localeCompare(right.dependency)
  );
}

function resolveRoutes(selections: CatalogSelection[]): PlannedRoute[] {
  const claims = new Map<string, PlannedRoute>();
  const issues: string[] = [];

  for (const selection of selections) {
    for (const route of selection.routes) {
      const normalizedPath = normalizeRoutePath(route.path);
      const normalized = {
        ...route,
        path: normalizedPath,
        target: routeTarget({ ...route, path: normalizedPath }),
      };
      const key = `${route.app}\0${normalizedPath}\0${route.method}`;
      const existing = claims.get(key);
      if (existing) {
        issues.push(
          `${route.method} ${normalizedPath} in ${route.app} is claimed by ${existing.module}#${existing.export} and ${route.module}#${route.export}`
        );
      } else {
        claims.set(key, normalized);
      }
    }
  }

  if (issues.length > 0) {
    throw new CompositionValidationError("Route claims conflict.", issues);
  }

  return [...claims.values()].sort((left, right) =>
    `${left.target}/${left.method}`.localeCompare(
      `${right.target}/${right.method}`
    )
  );
}

function resolveInstallUnits(
  catalog: SourceRegistryCatalog,
  selections: CatalogSelection[]
): PlannedInstallUnit[] {
  const units = new Map<string, PlannedInstallUnit>();

  for (const selection of selections) {
    for (const unit of selection.installUnits) {
      const key = `${unit.cwd}\0${unit.item}`;
      const targets = itemTargets(catalog, unit.item, unit.cwd);
      const existing = units.get(key);
      if (existing) {
        existing.targets = uniqueSorted([...existing.targets, ...targets]);
      } else {
        units.set(key, { ...unit, selectionId: selection.id, targets });
      }
    }
  }

  // Preserve selection order: Provider Install Units must exist before an
  // Add-on asks ShadCN to add dependencies to the workspace.
  return [...units.values()];
}

function catalogVariableTargets(catalog: SourceRegistryCatalog): string[] {
  const targets: string[] = [];
  for (const selection of catalog.selections) {
    if (selection.kind === "preset") {
      continue;
    }
    for (const unit of selection.installUnits) {
      targets.push(...itemTargets(catalog, unit.item, unit.cwd));
    }
  }
  return uniqueSorted(targets);
}

function catalogRouteTargets(catalog: SourceRegistryCatalog): string[] {
  return uniqueSorted(
    catalog.selections.flatMap((selection) =>
      selection.routes.map((route) => routeTarget(route))
    )
  );
}

function validateMaterializationTargets(options: {
  installUnits: PlannedInstallUnit[];
  assets: CatalogSelection["assets"];
  routes: PlannedRoute[];
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

  for (const unit of options.installUnits) {
    for (const target of unit.targets) {
      claim(target, `Install Unit ${unit.item}`);
    }
  }
  for (const asset of options.assets) {
    claim(asset.target, `asset ${asset.source}`);
  }
  for (const target of uniqueSorted(
    options.routes.map((route) => route.target)
  )) {
    claim(target, "a generated route");
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
  const providerSelections = PROVIDER_SLOTS.map((slot) => {
    const provider = providers.get(slot);
    if (!provider) {
      throw new CompositionValidationError(
        "Provider Slot cardinality is invalid.",
        [`${slot} requires exactly one provider`]
      );
    }
    return provider;
  });
  const addOns = resolveAddOns(catalog, selection.addOns, providerSelections);
  const selections = [...providerSelections, ...addOns];

  validateCompatibility(selections);

  const installUnits = resolveInstallUnits(catalog, selections);
  const assets = selections
    .flatMap((selected) => selected.assets)
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
  const routes = resolveRoutes(selections);
  validateMaterializationTargets({ assets, installUnits, routes });
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
    catalogPackageRequirements: catalogPackageRequirements(catalog),
    catalogPnpmPatches: catalogPnpmPatches(catalog),
    generatedRouteTargets: catalogRouteTargets(catalog),
    installUnits,
    instructions: uniqueSorted(
      selections
        .map((selected) => catalog.items.get(selected.itemName)?.docs)
        .filter((value): value is string => Boolean(value))
    ),
    packageRequirements: resolvePackageRequirements(selections),
    pnpmPatches,
    routes,
    selection: {
      addOns: uniqueSorted([...selection.addOns, ...requiredAddOnIds]),
      providers: { ...selection.providers },
    },
    selections,
    variableTargets: uniqueSorted([
      ...catalogVariableTargets(catalog),
      ...catalog.selections.flatMap((selected) =>
        selected.assets.map((asset) => asset.target)
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
      `${reference} is not a complete Next Hydra preset`,
    ]);
  }

  const { addOns, providers } = preset.selections;
  if (!(providers.auth && providers.cms && providers.commerce)) {
    throw new CompositionValidationError("Preset is incomplete.", [
      `${preset.id} must select auth, cms, and commerce providers`,
    ]);
  }

  return {
    addOns,
    providers: {
      auth: providers.auth,
      cms: providers.cms,
      commerce: providers.commerce,
    },
  };
}
