# Demo architecture overlays

This package belongs to maintainer demonstrations. Named workspace definitions opt in with `"demo": { "architecture": true }`. Customer creation always removes the package, its imports, metadata, toolbar and styles during composition. Neither `NODE_ENV` nor an application environment variable selects it.

Keep explanations beside the code they describe, using a named `ArchitectureBoundary` import from `@repo/demo-architecture/boundary` (aliases are supported). The boundary may contain multiple children and nested boundaries. Composition unwraps it, using a fragment where multiple children need grouping, and preserves application children, Suspense, directives and cache operations. The shared document-shell template imports the toolbar and styles; those imports and toolbar elements are also removed from customer output.

Annotations are descriptive: rendering labels remain authored intent, not an automatically inferred execution trace.

## Authoring contract

- Put application layout, keys and refs on application elements inside the boundary. Boundary props must only describe the demo; spreads and application props fail composition.
- Use literals or side-effect-free metadata values. For cache tags, use `cacheTags={() => PageRenderer.getCacheTags(entity)}`. The supplier runs only in the demo runtime. It must not perform work the application needs.
- Keep real `cacheTag`, `cacheLife`, data loading and invalidation outside metadata expressions. Eager calls in metadata fail composition.
- Do not re-export, dynamically import, pass around, or expose demo components/types through application interfaces. Use explicit JSX at the annotation site.
- Import styles through `@repo/demo-architecture/styles.css` and render the toolbar as `<ArchitectureToolbar />`, without props.

The same contract is validated in demos, so a new annotation cannot silently break customer creation. Unsupported syntax reports the source target and stops composition. `compose <name> --explain <file>` records `remove-demo-architecture` for transformed output; normal refresh conflict checks still protect local edits.
