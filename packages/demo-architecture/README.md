# Demo architecture overlays

This package belongs to maintainer demonstrations. Named workspace definitions opt in with `"demo": { "architecture": true }`. Customer creation always removes the package, its imports, metadata, toolbar and styles during composition. Neither `NODE_ENV` nor an application environment variable selects it.

Keep explanations beside the code they describe, using a named `ArchitectureBoundary` import from `@repo/demo-architecture/boundary` (aliases are supported). The boundary may contain multiple children and nested boundaries. Composition unwraps it, using a fragment where multiple children need grouping, and preserves application children, Suspense, directives and cache operations. The shared document-shell template imports the toolbar and styles; those imports and toolbar elements are also removed from customer output.

The toolbar offers Off, Caching, Streaming and Composition. Each view draws only boundaries annotated for that question; an unannotated ancestor or descendant stays transparent.

- **Caching:** use `caching="Cached · revalidate after 1h"` (or describe a request/preview bypass) where a distinct data policy is defined. Add `cacheTags` there. Do not repeat an inherited policy on every presentation component. The label describes the named data, not a promise that every descendant shares its cache.
- **Streaming:** set `streaming` on the region containing the actual Suspense boundary. The region includes its fallback and resolved content; do not label every grid, card or fallback as another stream. Cached data can also be inside this region.
- **Composition:** set `composition` to `app`, `cms`, `commerce` or `client` at meaningful application, provider or browser-interaction boundaries. Passive presentation wrappers usually need no annotation.

A region can participate in multiple views, such as Latest Articles with cached data inside Suspense. These labels are authored explanations, not live cache hits, measured streaming state or an automatically inferred execution trace.

## Annotation wording

Use short, sentence-case names for the thing being shown: `Product collection`, `Product detail`, `Latest articles`. Keep the same name across views and providers for the same responsibility. Use `Product collection block` for the CMS settings wrapper, and provider names only when identifying the page implementation, such as `Contentstack page` or `Drupal page`.

Keep cache badges concise: `Cached · revalidate after 15m`, `Cached · revalidate after 1h`, `Uncached · per request`, or `Bypassed · preview`. Show the revalidation duration rather than only a profile name. Revalidation happens on a subsequent request, not on a timer; it is distinct from expiry. Put the full profile timings in the hover description. Use `Drupal response policy` when Canvas delegates caching to Drupal's response metadata. Put details about the current store, customer, pricing, or availability in a short `description` shown on hover, rather than adding them to the name or badge.

### Keeping cache timings in sync

These timings are manually authored, not read from a live cache. Check the installed Next.js version's `cacheLife` documentation and resolved application configuration when changing cache calls, overriding profiles, or upgrading Next.js. Update the matching badge and hover description in the same change. Do not import Next.js internal configuration into the demo runtime.

Current annotations use the unmodified Next.js 16.3.1 profiles:

| Data | Cache definition | Client cache | Background revalidation | Expiry |
| --- | --- | --- | --- | --- |
| Contentstack page | `getPageCached` in `cms-contentstack/components/pages/landing-page.tsx`, implicit `default` | 5m | After 15m | No time-based expiry |
| Drupal page | `getCachedRouteEntity` in `cms-drupal/components/page.tsx`, `hours` outside preview | 5m | After 1h | After 1d |
| Latest articles | `cms-drupal/lib/latest-articles.ts`, `hours` | 5m | After 1h | After 1d |

Revalidation starts on the next request after the interval. After expiry, a request waits for fresh content. Invalidation and eviction can remove entries earlier. Canvas pages retain `Drupal response policy` because their timings come from each response rather than a fixed Next.js profile.

## Authoring contract

- Put application layout, keys and refs on application elements inside the boundary. Boundary props must only describe the demo; spreads and application props fail composition.
- Use literals or side-effect-free metadata values. For already available tags, pass an array, such as `cacheTags={["node_list:article"]}`. For computed tags, use `getCacheTags={() => PageRenderer.getCacheTags(entity)}`. The supplier runs only in the demo runtime. It must not perform work the application needs.
- Keep real `cacheTag`, `cacheLife`, data loading and invalidation outside metadata expressions. Eager calls in metadata fail composition.
- Do not re-export, dynamically import, pass around, or expose demo components/types through application interfaces. Use explicit JSX at the annotation site.
- Import styles through `@repo/demo-architecture/styles.css` and render the toolbar as `<ArchitectureToolbar />`, without props.

The same contract is validated in demos, so a new annotation cannot silently break customer creation. Unsupported syntax reports the source target and stops composition. `compose <name> --explain <file>` records `remove-demo-architecture` for transformed output; normal refresh conflict checks still protect local edits.
