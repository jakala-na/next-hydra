# LiquidJS layout prototype — throwaway

Question: Can one LiquidJS render pass preserve the real layout's optional props,
element slots, and nested wrappers while its unrendered source stays valid TSX?
This experiment belongs to the composition tooling; it does not migrate the
production renderer or materialize an application.

Run from the repository root: `pnpm prototype:liquid-layout`.
Use `pnpm prototype:liquid-layout --all` for the complete verification matrix.
Dependencies are isolated by the prototype's own workspace and lockfile.
On a fresh checkout, install them with
`pnpm --dir packages/create-next-hydra/prototype-liquid-layout install --frozen-lockfile --ignore-scripts`.

The template uses normal block-comment Liquid tags for conditionals and imports,
and complete JSX comments for output slots. Conditional JSX attributes become
properties in inline object spreads so their directives are valid JS comments.
In a required value position, the output marker's braces form an empty object
placeholder. The same token is a JSX comment in a child position.

Verification compares against the real current renderer, copied unchanged to an
ignored cache solely to resolve its dependencies in this isolated experiment.
Both results are parsed as TSX. Structural comparison expands only literal JSX
prop spreads and ignores formatting whitespace and grouping parentheses around
JSX elements; it preserves attribute order,
expressions, wrappers, imports and aliases. This is not application typechecking
or browser verification. The CLI can toggle each slot and inspect its output.

## Verdict: confirmed for the layout

The experiment passes with LiquidJS 10.29.0, TypeScript 6.0.2, and Oxfmt 0.61.0:

- The unrendered template parses as TSX, including the required cart expression.
- All 32 combinations of the five layout slots render and match the original
  renderer's normalized structure. These are independent slot combinations,
  not 32 valid complete workspace selections.
- Aliases, reversed binding input, and two ordered nested wrappers also match.
- Source containing `&` is preserved without HTML escaping.
- Missing condition variables and malformed tags fail instead of silently
  rendering incomplete source.
- Oxfmt can format the unrendered template without breaking its Liquid markers;
  the formatted template still produces the expected layout.

LiquidJS performs one render pass with two configured delimiter pairs. There is
no marker-normalization pass, custom Liquid tag, or custom conditional parser.
The main authoring change is placing optional props in object spreads. Output
retains those spreads, including empty spreads when no corresponding slot is
selected; it is structurally equivalent after expanding the literal spreads,
not byte-for-byte identical to the current renderer.

See `layout.prototype.tsx` for the proposed authoring format and `render.mjs` for
the small rendering boundary. The CLI writes ignored examples and a report under
`output/`. Toggle slots in the terminal to update `output/current.tsx`.

This confirms a fit for the layout, not a production migration. Existing checks
for slot cardinality, repeated/missing markers, and import collisions must remain
part of composition validation. Strict variables only check evaluated branches.
Template typechecking, other template file types, VS Code/Zed visual inspection,
GitHub highlighting, and application behavior were not exercised.

Captured on local throwaway branch `codex/prototype-liquid-layout`.
