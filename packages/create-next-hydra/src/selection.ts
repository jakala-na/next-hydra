import { Effect, Schema } from "effect";
import type { RegistryItem } from "shadcn/schema";

import { IncompatibleSelection, InvalidComposition } from "./errors.ts";
import { relativeFile } from "./files.ts";
import { Selection, SelectionRequest } from "./model.ts";
import { DependencySection } from "./packages.ts";
import type {
  PackageRequirement,
  PackageRequirementTarget,
} from "./packages.ts";
import type { RegistryCatalog } from "./shadcn.ts";
import type {
  TypeScriptAlias,
  TypeScriptAliasTarget,
} from "./typescript-paths.ts";

const manifestTarget = Effect.fn("Composition.manifestTarget")(function* (
  cwd: string
) {
  return cwd === "."
    ? "package.json"
    : `${yield* relativeFile(cwd)}/package.json`;
});

const SlotRequirement = Schema.Literals(["required", "optional", "forbidden"]);
const ProviderSlot = Schema.Literals(["auth", "cms", "commerce"]);
export const providerAliases = {
  auth: "@repo/auth",
  cms: "@repo/cms",
  commerce: "@repo/commerce-provider",
} as const;
const officialReferences = {
  clerk: "next-hydra/auth/clerk",
  commercetools: "next-hydra/commerce/commercetools",
  contentstack: "next-hydra/cms/contentstack",
  drupal: "next-hydra/cms/drupal",
  standard: "next-hydra/preset/standard",
  workos: "next-hydra/auth/workos",
} as const;
const Metadata = Schema.Struct({
  assets: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        source: Schema.NonEmptyString,
        target: Schema.NonEmptyString,
      })
    )
  ),
  binding: Schema.optionalKey(
    Schema.Struct({
      sourcePath: Schema.optionalKey(Schema.NonEmptyString),
      specifier: Schema.NonEmptyString,
    })
  ),
  compatibility: Schema.optionalKey(
    Schema.Struct({
      conflicts: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)),
      requires: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)),
    })
  ),
  conditionalDependencies: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        items: Schema.NonEmptyArray(Schema.NonEmptyString),
        providers: Schema.NonEmptyArray(
          Schema.Literals(["auth", "cms", "commerce"])
        ),
      })
    )
  ),
  id: Schema.NonEmptyString,
  kind: Schema.Literals(["provider", "package", "recipe", "add-on", "preset"]),
  packages: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        cwd: Schema.NonEmptyString,
        name: Schema.NonEmptyString,
        section: DependencySection,
        specifier: Schema.NonEmptyString,
      })
    )
  ),
  pnpmPatches: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        dependency: Schema.NonEmptyString,
        path: Schema.NonEmptyString,
      })
    )
  ),
  providerDependencies: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        cwd: Schema.NonEmptyString,
        section: DependencySection,
        slot: ProviderSlot,
      })
    )
  ),
  providerSlots: Schema.optionalKey(
    Schema.Struct({
      auth: Schema.optionalKey(SlotRequirement),
      cms: Schema.optionalKey(SlotRequirement),
      commerce: Schema.optionalKey(SlotRequirement),
    })
  ),
  selections: Schema.optionalKey(
    Schema.Struct({
      addOns: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)),
      providers: Schema.optionalKey(Selection.fields.providers),
    })
  ),
  slot: Schema.optionalKey(Schema.Literals(["auth", "cms", "commerce"])),
  typeScriptAliases: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        alias: Schema.NonEmptyString,
        cwd: Schema.NonEmptyString,
        sourcePath: Schema.NonEmptyString,
      })
    )
  ),
});
const validateProviderRequirements = Effect.fn(
  "Composition.validateProviderRequirements"
)(function* (metadata: typeof Metadata.Type, selection: Selection) {
  for (const slot of ["auth", "cms", "commerce"] as const) {
    const requirement = metadata.providerSlots?.[slot];
    const present = selection.providers[slot] !== undefined;
    if (
      (requirement === "required" && !present) ||
      (requirement === "forbidden" && present)
    ) {
      return yield* new InvalidComposition({
        message: `${metadata.id} ${requirement === "required" ? "requires" : "forbids"} ${slot === "auth" ? "an" : "a"} ${slot} provider`,
      });
    }
  }
});

const resolvePackageBindings = Effect.fn("Composition.resolvePackageBindings")(
  function* (
    metadataByName: ReadonlyMap<string, typeof Metadata.Type>,
    references: ReadonlyMap<string, string>,
    selectedItems: readonly RegistryItem[],
    selection: Selection
  ) {
    const ownedRequirements: PackageRequirementTarget[] = [];
    const ownedAliases: TypeScriptAliasTarget[] = [];
    for (const metadata of metadataByName.values()) {
      for (const alias of metadata.typeScriptAliases ?? []) {
        ownedAliases.push({
          alias: alias.alias,
          cwd: alias.cwd === "." ? "." : yield* relativeFile(alias.cwd),
        });
      }
      for (const requirement of metadata.packages ?? []) {
        ownedRequirements.push({
          name: requirement.name,
          section: requirement.section,
          target: yield* manifestTarget(requirement.cwd),
        });
      }
      for (const dependency of metadata.providerDependencies ?? []) {
        ownedAliases.push({
          alias: providerAliases[dependency.slot],
          cwd:
            dependency.cwd === "." ? "." : yield* relativeFile(dependency.cwd),
        });
        ownedRequirements.push({
          name: providerAliases[dependency.slot],
          section: dependency.section,
          target: yield* manifestTarget(dependency.cwd),
        });
      }
    }
    const requirements: PackageRequirement[] = [];
    const aliases: TypeScriptAlias[] = [];
    for (const item of selectedItems) {
      const metadata = metadataByName.get(item.name);
      if (metadata) {
        yield* validateProviderRequirements(metadata, selection);
      }
      for (const alias of metadata?.typeScriptAliases ?? []) {
        aliases.push({
          alias: alias.alias,
          cwd: alias.cwd === "." ? "." : yield* relativeFile(alias.cwd),
          sourcePath: yield* relativeFile(alias.sourcePath),
        });
      }
      for (const requirement of metadata?.packages ?? []) {
        requirements.push({
          name: requirement.name,
          section: requirement.section,
          specifier: requirement.specifier,
          target: yield* manifestTarget(requirement.cwd),
        });
      }
      for (const dependency of metadata?.providerDependencies ?? []) {
        const reference = selection.providers[dependency.slot];
        const binding = metadataByName.get(
          references.get(reference ?? "") ?? ""
        )?.binding;
        if (!binding) {
          return yield* new InvalidComposition({
            message: `${metadata?.id} needs a ${dependency.slot} provider binding`,
          });
        }
        requirements.push({
          name: providerAliases[dependency.slot],
          section: dependency.section,
          specifier: binding.specifier,
          target: yield* manifestTarget(dependency.cwd),
        });
        if (binding.sourcePath) {
          aliases.push({
            alias: providerAliases[dependency.slot],
            cwd:
              dependency.cwd === "."
                ? "."
                : yield* relativeFile(dependency.cwd),
            sourcePath: yield* relativeFile(binding.sourcePath),
          });
        }
      }
    }
    const uniqueAliases = new Map<string, TypeScriptAlias>();
    for (const alias of aliases) {
      const key = `${alias.cwd}\0${alias.alias}`;
      const previous = uniqueAliases.get(key);
      if (previous && previous.sourcePath !== alias.sourcePath) {
        return yield* new InvalidComposition({
          message: `${alias.cwd} maps ${alias.alias} to both ${previous.sourcePath} and ${alias.sourcePath}`,
        });
      }
      uniqueAliases.set(key, alias);
    }
    return {
      aliases: [...uniqueAliases.values()],
      ownedAliases,
      ownedRequirements,
      requirements,
    };
  }
);

const validateCompatibility = Effect.fn("Composition.validateCompatibility")(
  function* (
    metadataByName: ReadonlyMap<string, typeof Metadata.Type>,
    selectedItems: readonly RegistryItem[]
  ) {
    const selectedIds = new Set(
      selectedItems.flatMap((item) => {
        const metadata = metadataByName.get(item.name);
        return metadata ? [metadata.id] : [];
      })
    );
    for (const item of selectedItems) {
      const metadata = metadataByName.get(item.name);
      const missing = (metadata?.compatibility?.requires ?? []).filter(
        (id) => !selectedIds.has(id)
      );
      const conflicts = (metadata?.compatibility?.conflicts ?? []).filter(
        (id) => selectedIds.has(id)
      );
      if (metadata && (missing.length || conflicts.length)) {
        return yield* new IncompatibleSelection({
          conflicts,
          missing,
          selection: metadata.id,
        });
      }
    }
  }
);

const resolveAssets = Effect.fn("Composition.resolveAssets")(function* (
  metadataByName: ReadonlyMap<string, typeof Metadata.Type>,
  selected: ReadonlySet<string>
) {
  const assets: {
    readonly source: string;
    readonly target: string;
    readonly owner: string;
  }[] = [];
  const patches = new Map<string, string>();
  const ownedAssetTargets = new Set<string>();
  for (const [name, metadata] of metadataByName) {
    for (const asset of metadata.assets ?? []) {
      const target = yield* relativeFile(asset.target);
      ownedAssetTargets.add(target);
      if (selected.has(name)) {
        assets.push({
          owner: name,
          source: yield* relativeFile(asset.source),
          target,
        });
      }
    }
    if (selected.has(name)) {
      for (const patch of metadata.pnpmPatches ?? []) {
        const target = yield* relativeFile(patch.path);
        const previous = patches.get(patch.dependency);
        if (previous && previous !== target) {
          return yield* new InvalidComposition({
            message: `Conflicting patches for ${patch.dependency}: ${previous}, ${target}`,
          });
        }
        patches.set(patch.dependency, target);
      }
    }
  }
  const assetTargets = new Set(assets.map((asset) => asset.target));
  for (const [dependency, target] of patches) {
    if (!assetTargets.has(target)) {
      return yield* new InvalidComposition({
        message: `${dependency} references ${target}, which is not a selected asset`,
      });
    }
  }
  return { assets, ownedAssetTargets, patches };
});

export const registryIndex = Effect.fn("Composition.registryIndex")(function* (
  registry: RegistryCatalog,
  acquiredReferences: ReadonlyMap<string, string> = new Map()
) {
  const items = new Map(registry.items.map((item) => [item.name, item]));
  if (items.size !== registry.items.length) {
    return yield* new InvalidComposition({
      message: "Registry item names must be unique.",
    });
  }
  const references = new Map([
    ...registry.items.map((item) => [item.name, item.name] as const),
    ...acquiredReferences,
  ]);
  const repository =
    /^https:\/\/github\.com\/(?<repository>[^/]+\/[^/]+?)(?:\.git)?\/?$/u.exec(
      registry.homepage ?? ""
    )?.groups?.repository;
  if (repository) {
    for (const item of registry.items) {
      references.set(`${repository}/${item.name}`, item.name);
    }
  }
  const metadataByName = new Map<string, typeof Metadata.Type>();
  for (const item of registry.items) {
    if (item.meta?.nextHydra !== undefined) {
      const metadata = yield* Schema.decodeUnknownEffect(Metadata)(
        item.meta.nextHydra,
        { onExcessProperty: "error" }
      ).pipe(
        Effect.mapError(
          () =>
            new InvalidComposition({
              message: `Unsupported or invalid selection metadata: ${item.name}`,
            })
        )
      );
      if (metadata.kind !== "provider" && (metadata.slot || metadata.binding)) {
        return yield* new InvalidComposition({
          message: `${metadata.id}: only providers may declare a slot or binding`,
        });
      }
      if (
        metadata.kind === "provider" &&
        (!metadata.slot || !metadata.binding)
      ) {
        return yield* new InvalidComposition({
          message: `${metadata.id}: a provider requires both a slot and binding`,
        });
      }
      if (
        (metadata.kind === "preset") !==
        (metadata.selections !== undefined)
      ) {
        return yield* new InvalidComposition({
          message: `${metadata.id}: selections belong to presets and are required for them`,
        });
      }
      if (
        metadata.kind === "preset" &&
        (metadata.providerDependencies?.length ?? 0) > 0
      ) {
        return yield* new InvalidComposition({
          message: `${metadata.id}: a preset cannot declare provider dependencies`,
        });
      }
      for (const requirement of metadata.packages ?? []) {
        if (
          Object.values(providerAliases).some(
            (alias) => alias === requirement.name
          )
        ) {
          return yield* new InvalidComposition({
            message: `${requirement.name} must be declared through providerDependencies`,
          });
        }
      }
      if (
        references.has(metadata.id) &&
        references.get(metadata.id) !== item.name
      ) {
        return yield* new InvalidComposition({
          message: `Duplicate selection ID: ${metadata.id}`,
        });
      }
      references.set(metadata.id, item.name);
      metadataByName.set(item.name, metadata);
      if (
        metadata.providerSlots &&
        metadata.kind !== "package" &&
        metadata.kind !== "recipe"
      ) {
        return yield* new InvalidComposition({
          message: `${metadata.id} must be a package or recipe to declare provider requirements`,
        });
      }
    }
  }
  for (const [alias, id] of Object.entries(officialReferences)) {
    const name = references.get(id);
    if (name) {
      references.set(alias, name);
    }
  }
  return { items, metadataByName, references };
});

export const resolveSelection = Effect.fn("Composition.resolveSelection")(
  function* (
    index: Effect.Success<ReturnType<typeof registryIndex>>,
    request: SelectionRequest
  ) {
    const decoded = yield* Schema.decodeEffect(SelectionRequest)(request, {
      onExcessProperty: "error",
    });
    if (!("preset" in decoded)) {
      return decoded;
    }
    const metadata = index.metadataByName.get(
      index.references.get(decoded.preset) ?? ""
    );
    if (metadata?.kind !== "preset" || !metadata.selections) {
      return yield* new InvalidComposition({
        message: `${decoded.preset} is not a preset`,
      });
    }
    return {
      addOns: [
        ...new Set([...(metadata.selections.addOns ?? []), ...decoded.addOns]),
      ],
      providers: metadata.selections.providers ?? {},
    };
  }
);

export const selectedConditionalDependencies = (
  metadata: typeof Metadata.Type | undefined,
  selection: Selection
) =>
  (metadata?.conditionalDependencies ?? []).flatMap((dependency) =>
    dependency.providers.every(
      (slot) => selection.providers[slot] !== undefined
    )
      ? dependency.items
      : []
  );

export const selectRegistryItems = Effect.fn("Composition.selectRegistryItems")(
  function* (
    registry: RegistryCatalog,
    request: SelectionRequest,
    acquiredReferences: ReadonlyMap<string, string> = new Map()
  ) {
    const { items, metadataByName, references } = yield* registryIndex(
      registry,
      acquiredReferences
    );
    const selection = yield* resolveSelection(
      { items, metadataByName, references },
      request
    );
    for (const [slot, reference] of Object.entries(selection.providers)) {
      const metadata = metadataByName.get(references.get(reference) ?? "");
      if (
        metadata?.kind !== "provider" ||
        metadata.slot !== slot ||
        !metadata.binding
      ) {
        return yield* new InvalidComposition({
          message: `${reference} is not a ${slot} provider`,
        });
      }
    }
    for (const reference of selection.addOns) {
      const metadata = metadataByName.get(references.get(reference) ?? "");
      if (metadata?.kind !== "add-on") {
        return yield* new InvalidComposition({
          message: `${reference} is not an add-on`,
        });
      }
    }
    if (!references.has("app-web")) {
      return yield* new InvalidComposition({
        message:
          "The source registry must include the shared app-web application",
      });
    }
    const pending = [
      "app-web",
      ...Object.values(selection.providers),
      ...selection.addOns,
    ];
    const selected = new Set<string>();
    const selectedItems: RegistryItem[] = [];
    while (pending.length > 0) {
      const reference = pending.pop();
      if (reference === undefined) {
        break;
      }
      const name = references.get(reference);
      if (!name) {
        return yield* new InvalidComposition({
          message: `Unknown registry selection: ${reference}`,
        });
      }
      if (selected.has(name)) {
        continue;
      }
      selected.add(name);
      const item = items.get(name);
      if (!item) {
        return yield* new InvalidComposition({
          message: `Missing registry item: ${name}`,
        });
      }
      selectedItems.push(item);
      pending.push(...(item.registryDependencies ?? []));
      const metadata = metadataByName.get(name);
      if (metadata?.kind === "preset") {
        return yield* new InvalidComposition({
          message: `${metadata.id} is a preset, not a materializable selection; resolve its selections first`,
        });
      }
      for (const recipeReference of selectedConditionalDependencies(
        metadata,
        selection
      )) {
        const target = metadataByName.get(
          references.get(recipeReference) ?? ""
        );
        if (target?.kind !== "recipe" && target?.kind !== "package") {
          return yield* new InvalidComposition({
            message: `${recipeReference} must be a package or composition recipe`,
          });
        }
        pending.push(recipeReference);
      }
    }

    yield* validateCompatibility(metadataByName, selectedItems);
    const bindings = yield* resolvePackageBindings(
      metadataByName,
      references,
      selectedItems,
      selection
    );
    const assets = yield* resolveAssets(metadataByName, selected);
    return {
      ...bindings,
      ...assets,
      references,
      selectedItems,
    };
  }
);
