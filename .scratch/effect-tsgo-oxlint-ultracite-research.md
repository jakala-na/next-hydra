# Effect tsgo Oxlint integration with Ultracite

Research snapshot: 2026-08-14. This note compares `@effect/tsgo@0.36.4`, Ultracite 7.10.0, and Next Hydra's current lint configuration.

## Conclusion

Effect's Oxlint integration and Ultracite's Oxlint backend are compatible. Ultracite owns the general Oxlint/Oxfmt presets and command wrapper; Effect patches the installed Oxlint and `oxlint-tsgolint` binaries and contributes the separate `effecttsgo/*` rule namespace. Both projects compose their configurations through Oxlint's `defineConfig({ extends: [...] })` mechanism.

The migration is not drop-in for Next Hydra because the repository currently uses Ultracite's **Biome** backend. [`biome.json`](../biome.json) contains repository-specific import-boundary overrides and a custom Grit rule at [`plugins/biome/no-manual-boundary-decoding.grit`](../plugins/biome/no-manual-boundary-decoding.grit). Ultracite's Oxlint initializer removes the Biome configuration when switching backends, so those policies must be ported or deliberately retained through a separate check before the switch.

## How the integrations fit together

Effect's current setup requires `@effect/tsgo`, `oxlint`, and `oxlint-tsgolint`, then patches Oxlint with:

```sh
effect-tsgo patch --oxlint
```

The default still patches TypeScript too; `--no-typescript --oxlint` is only for an Oxlint-only installation. Effect's recommended Oxlint preset enables `options.typeAware`, registers the `effecttsgo` plugin, and configures its Effect-specific rules. See the official [Effect Oxlint setup guide](https://github.com/Effect-TS/tsgo/blob/main/docs/README.md) and [recommended preset](https://github.com/Effect-TS/tsgo/blob/main/oxlint-presets/recommended.json).

Ultracite 7.10.0 supports an Oxlint/Oxfmt backend. Its initializer generates `oxlint.config.ts` with the core/framework presets and `oxfmt.config.ts` with the Ultracite formatter preset; `ultracite check` then invokes Oxfmt in check mode and Oxlint. See the [Ultracite README](https://github.com/haydenbleasel/ultracite#quick-start) and the project's own [composed Oxlint configuration](https://github.com/haydenbleasel/ultracite/blob/main/oxlint.config.ts).

The combined configuration should be composed manually so both preset families are present:

```ts
import { recommended as effectRecommended } from "@effect/tsgo/oxlint-presets";
import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  extends: [core, react, next, vitest, effectRecommended],
  ignorePatterns: core.ignorePatterns,
});
```

The rule namespaces do not conflict: Ultracite configures Oxlint's native `eslint`, `typescript`, React, Next.js, and other rules, while Effect adds `effecttsgo/*`. The Effect preset also enables the type-aware engine required by all Effect rules.

## Version constraint

Do not use unpinned `latest` versions for the patched pair. Effect states that `oxlint` and `oxlint-tsgolint` must match the versions supported by the installed `@effect/tsgo` release, and its patch command validates them before modifying binaries.

For `@effect/tsgo@0.36.4`, the release manifest records:

```jsonc
{
  "@effect/tsgo": "0.36.4",
  "oxlint": "1.77.0",
  "oxlint-tsgolint": "7.0.2001"
}
```

See the release-pinned [`upstream.json`](https://github.com/Effect-TS/tsgo/blob/%40effect%2Ftsgo%400.36.4/_packages/tsgo/upstream.json). Ultracite 7.10.0 declares `oxlint: ^1.0.0` as its peer range and develops its current presets against Oxlint 1.76+, so Oxlint 1.77.0 is within its supported range. Effect's current unreleased `main` has already moved to Oxlint 1.78.0, but the published 0.36.4 package should use its release-pinned 1.77.0 backend rather than following `latest` independently.

`oxlint-tsgolint@7.0.2001` is based on TypeScript 7.0.2. Oxlint's type-aware engine builds the TypeScript program once and supplies both native type-aware rules and the patched Effect rules. See Oxlint's [type-aware linting documentation](https://oxc.rs/docs/guide/usage/linter/type-aware.html) and [stable release announcement](https://oxc.rs/blog/2026-07-22-type-aware-linting-stable.html).

## Recommended Next Hydra migration

1. Complete the stable TypeScript 7 and `@effect/tsgo@0.36.4` migration described in [`effect-tsgo-typescript-7-research.md`](./effect-tsgo-typescript-7-research.md).
2. Install `oxlint@1.77.0`, `oxlint-tsgolint@7.0.2001`, and Oxfmt alongside Ultracite 7.10.0.
3. Create the combined `oxlint.config.ts` shown above and an Ultracite `oxfmt.config.ts`.
4. Change `prepare` to run `effect-tsgo patch --typescript --oxlint` after installation.
5. Port every `biome.json` ignore and `noRestrictedImports` override to Oxlint.
6. Reimplement `no-manual-boundary-decoding.grit` as an Oxlint-compatible custom rule, or retain an explicit targeted Biome check until that port exists.
7. Only then remove `biome.json` and `@biomejs/biome`; otherwise `ultracite check` continues detecting the Biome backend before Oxlint.
8. Because both the TypeScript language service and patched Oxlint can report Effect diagnostics, follow Effect's recommendation to set the language-service plugin's `diagnostics` option to `false` once Oxlint is the canonical diagnostic path. This retains editor refactors and language features without duplicate Effect diagnostics.
9. Keep the separate TypeScript typecheck initially. The Effect preset enables `typeAware`, not Oxlint's optional `typeCheck`, so linting does not replace the repository's compiler checks.

The safest implementation is therefore a policy-preserving backend migration, not running `ultracite init --linter oxlint` directly against the current worktree.
