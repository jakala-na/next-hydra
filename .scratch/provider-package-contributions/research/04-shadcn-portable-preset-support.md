# ShadCN support for portable Next Hydra Presets

Research date: 2026-08-11
Upstream inspected: [`shadcn-ui/ui@dcf56edd57d106825193b5432fdc99c8d3d6b8fa`](https://github.com/shadcn-ui/ui/tree/dcf56edd57d106825193b5432fdc99c8d3d6b8fa)

## Conclusion

ShadCN supports the proposed **data shape and dependency transport**, but not the Next Hydra meaning of a Preset.

A fileless `registry:item` can list Provider and Add-on items in `registryDependencies`, and raw `shadcn add` will recursively resolve and install them. However, ShadCN does not understand `meta.nextHydra`, Provider Slots, compatibility, package aliases, package-specific dependencies, or which inactive Provider files a maintainer switch should remove. Next Hydra must fetch the individual items, validate their metadata, and only then ask ShadCN to install the standard registry payload.

Therefore:

- Keep `registryDependencies` as the portable list of Provider and Add-on selections.
- Support Presets through `create-next-hydra --preset`, not customer `create-next-hydra add` or raw `shadcn add`.
- State clearly in Preset documentation that raw `shadcn add` bypasses Next Hydra validation and produces only the ShadCN-owned portion of the installation.

## 1. A dependency-only item is valid

Yes. The common item schema requires `name`, while the discriminated union requires `type`; `registryDependencies`, `files`, and arbitrary `meta` are all optional. `registry:item` is an accepted type ([schema source](https://github.com/shadcn-ui/ui/blob/dcf56edd57d106825193b5432fdc99c8d3d6b8fa/packages/shadcn/src/registry/schema.ts#L157-L190)). The published JSON Schema likewise requires only `name` and `type` ([JSON Schema source](https://github.com/shadcn-ui/ui/blob/dcf56edd57d106825193b5432fdc99c8d3d6b8fa/apps/v4/public/schema/registry-item.json#L262-L273)).

This is valid ShadCN data:

```json
{
  "name": "b2b-drupal",
  "type": "registry:item",
  "registryDependencies": [
    "@next-hydra/auth-workos",
    "@next-hydra/cms-drupal",
    "@next-hydra/commerce-commercetools",
    "@next-hydra/drupal-commercetools"
  ],
  "meta": {
    "nextHydra": {
      "kind": "preset",
      "id": "@next-hydra/preset-b2b-drupal"
    }
  }
}
```

A fileless `registry:item` also counts as a **universal item**: ShadCN treats missing `files` as an empty array, and the empty array passes its explicit-target check ([source](https://github.com/shadcn-ui/ui/blob/dcf56edd57d106825193b5432fdc99c8d3d6b8fa/packages/shadcn/src/registry/utils.ts#L277-L309)).

## 2. What raw `shadcn add` does

Raw `shadcn add <preset>` recursively fetches `registryDependencies`, including URLs, local files, GitHub item addresses, and configured namespaces ([resolver entry](https://github.com/shadcn-ui/ui/blob/dcf56edd57d106825193b5432fdc99c8d3d6b8fa/packages/shadcn/src/registry/resolver.ts#L148-L213), [recursive traversal](https://github.com/shadcn-ui/ui/blob/dcf56edd57d106825193b5432fdc99c8d3d6b8fa/packages/shadcn/src/registry/resolver.ts#L400-L538)). It resolves the complete graph before writing, then applies package dependencies, Tailwind configuration, environment variables, files, CSS, and installation documentation ([installer](https://github.com/shadcn-ui/ui/blob/dcf56edd57d106825193b5432fdc99c8d3d6b8fa/packages/shadcn/src/utils/add-components.ts#L85-L152)).

There is no Next Hydra validation point in that command. Duplicate Provider Slots, incompatible Add-ons, alias conflicts, and route collisions are invisible to it. Raw `shadcn add` would install the ordinary ShadCN payload immediately after its own resolution and target-path checks.

## 3. What happens to custom metadata

`meta` accepts arbitrary values, so `getRegistryItems()` returns `meta.nextHydra` on each individually fetched item ([schema](https://github.com/shadcn-ui/ui/blob/dcf56edd57d106825193b5432fdc99c8d3d6b8fa/packages/shadcn/src/registry/schema.ts#L157-L176), [fetch API](https://github.com/shadcn-ui/ui/blob/dcf56edd57d106825193b5432fdc99c8d3d6b8fa/packages/shadcn/src/registry/api.ts#L190-L209)). The official examples describe `meta` as data for custom tools or scripts ([docs](https://ui.shadcn.com/docs/registry/examples#metadata)).

ShadCN itself does not interpret or preserve that metadata in the installed workspace. Its resolved install tree contains dependencies, files, Tailwind, CSS variables, CSS, environment variables, docs, and fonts—but not `meta` ([resolver](https://github.com/shadcn-ui/ui/blob/dcf56edd57d106825193b5432fdc99c8d3d6b8fa/packages/shadcn/src/registry/resolver.ts#L338-L397), [resolved-tree schema](https://github.com/shadcn-ui/ui/blob/dcf56edd57d106825193b5432fdc99c8d3d6b8fa/packages/shadcn/src/registry/schema.ts#L272-L292)). It has no concepts for Auth, CMS, Commerce, Provider, Add-on, Slot Cardinality, or Next Hydra compatibility.

## 4. Addressing, private registries, and project configuration

The Preset can be fetched through all relevant ShadCN address forms:

- **Direct public URL:** supported directly by `shadcn add`; no namespace mapping is needed ([docs](https://ui.shadcn.com/docs/registry/namespace#adding-resources)). Nested dependencies should themselves use complete URLs, GitHub item addresses, built-in names, or configured namespaces.
- **Named public registry:** `@namespace/item` uses a URL template. A namespace already listed in ShadCN's public registry directory is automatically discovered and added to `components.json`; other namespaces must be configured ([registry directory docs](https://ui.shadcn.com/docs/registry/registry-index), [source](https://github.com/shadcn-ui/ui/blob/dcf56edd57d106825193b5432fdc99c8d3d6b8fa/packages/shadcn/src/utils/registries.ts#L10-L100)).
- **Authenticated private registry:** configure the namespace with a URL plus headers or query parameters whose values reference environment variables ([authentication docs](https://ui.shadcn.com/docs/registry/authentication), [configuration schema](https://github.com/shadcn-ui/ui/blob/dcf56edd57d106825193b5432fdc99c8d3d6b8fa/packages/shadcn/src/registry/schema.ts#L6-L26)). Private GitHub repositories are not supported through GitHub item addresses; the official guidance is an authenticated namespace ([FAQ](https://ui.shadcn.com/docs/registry/faq#can-github-registry-addresses-use-private-repositories)).

For raw `shadcn add`:

- Universal items with explicit targets can be installed without framework detection or `components.json` ([docs](https://ui.shadcn.com/docs/registry/examples#universal-items)).
- A normal project-aware item requires ShadCN project configuration.
- A private or unlisted namespace requires its mapping and authentication configuration in `components.json`.

For the Next Hydra wrapper:

- Registry configuration can be supplied in memory to the documented `shadcn/registry` API; it does not have to be retained in the customer workspace.
- `getRegistryItems()` can fetch individual definitions for validation.
- `addRegistryItems()` is the supported programmatic installer and accepts registry configuration directly ([API docs](https://ui.shadcn.com/docs/registry/api-reference#addregistryitems), [source](https://github.com/shadcn-ui/ui/blob/dcf56edd57d106825193b5432fdc99c8d3d6b8fa/packages/shadcn/src/registry/add.ts#L12-L102), [public export](https://github.com/shadcn-ui/ui/blob/dcf56edd57d106825193b5432fdc99c8d3d6b8fa/packages/shadcn/src/registry/index.ts#L1-L11)).
- A registries-only config is sufficient only when every item is universal. Items using ShadCN aliases or project-derived targets require the full resolved ShadCN project config ([API docs](https://ui.shadcn.com/docs/registry/api-reference#addregistryitems)).

## 5. Required Next Hydra flow

Using `registryDependencies` is safe **inside the Next Hydra command**, provided Next Hydra does not begin with `addRegistryItems()` or invoke raw `shadcn add`.

The flow must be:

1. Fetch the Preset as an individual item.
2. Recursively fetch every `registryDependency` as an individual item, retaining each `meta.nextHydra`.
3. Validate the complete selection: required slots, one Provider per v1 slot, Provider/Add-on compatibility, package alias claims, safe final targets, and target collisions.
4. Show the plan or obtain any required confirmation.
5. Prepare the exact validated items, call `addRegistryItems()` once at the workspace root, and perform Next Hydra's package-specific alias, asset, and patch work.
6. Leave the failed workspace in place if any later operation fails.

Raw `shadcn add <preset>` skips steps 2–4 as Next Hydra understands them. It resolves and materializes the dependency graph as ordinary registry content. Therefore the registry format is reusable as-is, but the Preset command is necessarily a Next Hydra feature.

One operational caution remains: the public fetch and install calls resolve the registry separately. Registry artifacts should be immutable or version-pinned so the content installed cannot change after validation.

Finally, ShadCN already uses the word “preset” for visual style configuration. `create-next-hydra --preset` can still use that user-facing name, but the portable registry artifact is technically an ordinary `registry:item`, not a ShadCN preset type.
