# Searchable content definitions

Each selected recipe supplies its search definition beside its CMS schema. `landing-page.ts` reads the schema's UID and title and declares the connector's searchable text root and mapping fields. The projection, app installer and CLI instructions use that same definition.

`types.ts` defines `SearchContentType` and resolves selected definitions and extensions. A type is independently searchable; a block can extend a parent type's instructions through `SearchContentTypeExtension`. `product-collection.ts` is the Commerce example: it extends the Landing Page guide without creating a Product content type or another sync operation.

Composition owns the initial list through `registry/templates/search-content-types.template.ts`. The base `cms-contentstack-search` item contributes Landing Page. The conditional `cms-contentstack-search-commerce` item contributes the Commerce extension only when both Search and Commerce are selected. Their `registry.json` slot bindings target `packages/cms-contentstack/search-content-types.ts`.

In a scaffolded project the aggregate is ordinary source:

```ts
import { landingPageSearchType } from "./recipe/search/landing-page.ts";
import { resolveSearchContentTypes } from "./recipe/search/types.ts";

export const searchableContentTypes = resolveSearchContentTypes([
  landingPageSearchType,
]);
```

To add a searchable content type, add its schema and a definition exporting `uid`, `label`, `searchTextRoot`, `mappingFields` and `instructions`, then import the definition into this list. A maintainer-supplied recipe additionally registers the files and slot binding in its owning registry item. Edit canonical definitions/templates and refresh named development workspaces; do not edit their materialized aggregates.

Only registered types receive search settings and app mappings. The default list no longer assumes an Article type absent from the supplied schemas. Existing projects indexing additional types should register their actual definitions before reprovisioning.

Installation receipts list content-type UIDs and fields successfully applied to the app. A handoff removes a mapping task only when that receipt covers the type's required fields. App installation alone does not prove mappings are complete; sync and record verification remain explicit tasks. The installer does not start CMS indexing or verify remote records.

Locales remain explicit `search provision --locale` inputs. Definitions do not introduce locale defaults, workspace discovery or new CLI flags.
