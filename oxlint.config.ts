import { recommended as effectRecommended } from "@effect/tsgo/oxlint-presets";
import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";
import vitestBase from "ultracite/oxlint/vitest";

// Ultracite's vitest override wins over later extends/local overrides for the same
// files, so patch that override in place for @effect/vitest testers.
const vitest = {
  ...vitestBase,
  overrides: vitestBase.overrides?.map((override) => ({
    ...override,
    rules: {
      ...override.rules,
      "vitest/no-standalone-expect": [
        "error",
        {
          additionalTestBlockFunctions: [
            "effect",
            "it.effect",
            "it.live",
            "live",
            "test.effect",
            "test.live",
          ],
        },
      ],
      // Syntactic rule with no type information: it cannot tell a `Context.Service`
      // class from a `Schema.Struct` value, and rewrites `describe("X", ...)` to
      // `describe(X, ...)` for both. Vitest requires a function there.
      "vitest/prefer-describe-function-title": "off",
      // `toStrictEqual` also compares prototypes, so rewriting `toEqual` breaks
      // every assertion that checks a Schema/Data class instance against a plain
      // object literal. Failures surface only at run time, not in typecheck.
      "vitest/prefer-strict-equal": "off",
    },
  })),
};

const generatedPatterns = [
  "packages/cms-contentstack/gql/*",
  "packages/cms-drupal/gql/*",
  "packages/commerce/gql/*",
  "packages/commerce-commercetools/gql/*",
  "apps/email/.react-email/",
];

const commerceProviderPatterns = [
  "@repo/commerce-commercetools",
  "@repo/commerce-commercetools/**",
];

const restrictedCommerceImports = (
  group: string[],
  message: string
): ["error", { patterns: { group: string[]; message: string }[] }] => [
  "error",
  {
    patterns: [{ group, message }],
  },
];

export const commerceImportBoundaryConfig = {
  rules: {
    "no-restricted-imports": restrictedCommerceImports(
      commerceProviderPatterns,
      "Import the installed commerce provider only from an application composition or tooling root."
    ),
  },
  overrides: [
    {
      files: ["apps/web/env.ts", "apps/cli/env.ts"],
      rules: {
        "no-restricted-imports": restrictedCommerceImports(
          [...commerceProviderPatterns, "!@repo/commerce-commercetools/keys"],
          "This environment root may import only the provider's keys module."
        ),
      },
    },
    {
      files: ["apps/api/env.ts"],
      rules: {
        "no-restricted-imports": restrictedCommerceImports(
          [...commerceProviderPatterns, "!@repo/commerce-commercetools/keys"],
          "The API environment root may import only the provider's keys module."
        ),
      },
    },
    {
      files: ["apps/api/lib/checkout/runtime.ts"],
      rules: {
        "no-restricted-imports": restrictedCommerceImports(
          [
            ...commerceProviderPatterns,
            "!@repo/commerce-commercetools/address-book",
            "!@repo/commerce-commercetools/cart",
            "!@repo/commerce-commercetools/commerce-accounts",
          ],
          "The Checkout runtime may import only the provider Layers it composes."
        ),
      },
    },
    {
      files: ["apps/api/lib/registration/runtime.ts"],
      rules: {
        "no-restricted-imports": restrictedCommerceImports(
          [
            ...commerceProviderPatterns,
            "!@repo/commerce-commercetools/commerce-accounts",
            "!@repo/commerce-commercetools/registration",
            "!@repo/commerce-commercetools/versioned-store",
          ],
          "The Registration runtime may import only the provider Layers it composes."
        ),
      },
    },
    {
      files: ["apps/cli/src/program.ts"],
      rules: {
        "no-restricted-imports": restrictedCommerceImports(
          [...commerceProviderPatterns, "!@repo/commerce-commercetools/cli"],
          "The CLI program may import only the provider's CLI module."
        ),
      },
    },
    {
      files: ["apps/web/lib/commerce-layers.ts"],
      rules: {
        "no-restricted-imports": restrictedCommerceImports(
          [
            ...commerceProviderPatterns,
            "!@repo/commerce-commercetools/provider",
          ],
          "The Web composition root may import only the provider's named Layer bundle."
        ),
      },
    },
    {
      files: ["packages/commerce/**"],
      rules: {
        "no-restricted-imports": restrictedCommerceImports(
          [
            "@commercetools/platform-sdk",
            "@commercetools/platform-sdk/**",
            "@commercetools/ts-client",
            "@commercetools/ts-client/**",
            "@gql.tada/cli-utils",
            "@gql.tada/cli-utils/**",
            ...commerceProviderPatterns,
            "@repo/versioned-store",
            "@repo/versioned-store/**",
            "@t3-oss/env-nextjs",
            "@t3-oss/env-nextjs/**",
            "@urql/core",
            "@urql/core/**",
            "chalk",
            "chalk/**",
            "commander",
            "commander/**",
            "dotenv",
            "dotenv/**",
            "gql.tada",
            "gql.tada/**",
            "ora",
            "ora/**",
            "urql",
            "urql/**",
            "wonka",
            "wonka/**",
          ],
          "Core commerce may import only provider-neutral dependencies."
        ),
      },
    },
  ],
};

export default defineConfig({
  extends: [core, react, next, vitest, effectRecommended],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    ...generatedPatterns,
    ".agent/**",
    ".agents/**",
    ".claude/**",
    ".codex/**",
    ".continue/**",
    ".cursor/**",
    ".gemini/**",
    ".opencode/**",
    ".pi/**",
    ".roo/**",
    ".windsurf/**",
    "repos/**",
    "tools/oxlint/anti-slop/**",
  ],
  jsPlugins: [
    {
      name: "anti-slop",
      specifier: "./tools/oxlint/anti-slop/index.ts",
    },
    {
      name: "anti-slop-effect",
      specifier: "./tools/oxlint/anti-slop/effect/index.ts",
    },
  ],
  rules: {
    ...commerceImportBoundaryConfig.rules,
    "anti-slop-effect/no-service-constructor-imports": "error",
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
    // Default max is 20, which several pre-existing components and workflow
    // functions already exceed for legitimate reasons (many mutually exclusive
    // branches, not tangled logic). Raised so lint-driven edits aren't forced to
    // extract throwaway helpers just to dodge the number; still catches genuinely
    // unreadable functions.
    complexity: ["error", { max: 40 }],
    // Fires on the bare `async` keyword with no boundary awareness, so it flags
    // Vitest callbacks, Next.js Server Actions/Route Handlers/Server Components,
    // React client-component event handlers, and packages with no Effect
    // dependency (create-next-hydra) — none of which can become Effect.gen. It
    // also flags `Effect.tryPromise({ try: async () => ... })`, which is the
    // canonical Effect idiom for crossing a Promise boundary, not a violation
    // of it. Sampled across the largest and smallest hit buckets: 8/8 files
    // checked were one of these cases, none a genuine unconverted call site.
    "effecttsgo/async-function": "off",
    "func-names": "off",
    "func-style": "off",
    "import/no-namespace": "warn",
    "jsx-a11y/label-has-associated-control": "warn",
    "jsx-a11y/no-noninteractive-element-interactions": "warn",
    "jsx-a11y/no-static-element-interactions": "warn",
    "jsx-a11y/prefer-tag-over-role": "warn",
    "no-console": "warn",
    "no-empty": "warn",
    "no-magic-numbers": "off",
    "no-shadow": "warn",
    "no-useless-escape": "off",
    "oxc/no-barrel-file": "off",
    // Effect modules intentionally co-locate related Schema classes, including
    // tagged errors, and Schema.TaggedError is a class factory rather than a
    // thrown value. These structural rules misclassify those domain modules.
    "max-classes-per-file": "off",
    "unicorn/throw-new-error": "off",
    // Effect combinators transform Effect values through callback-based APIs;
    // they are not Promise chains that can be rewritten to async/await.
    "promise/prefer-await-to-callbacks": "off",
    "promise/prefer-await-to-then": "off",
    radix: "warn",
    "react/function-component-definition": "off",
    "react/no-array-index-key": "warn",
    "react/no-danger": "warn",
    "react/no-unstable-nested-components": "warn",
    "sort-keys": "warn",
    // Effect generators use `return yield* failure` as a typed terminal exit,
    // which this syntax-only rule reports as an inconsistent return value.
    "typescript/consistent-return": "off",
    "typescript/consistent-type-definitions": "off",
    // Off by default, re-enabled for the Next apps below. A workspace package is
    // type-checked against its own tsconfig, where `Route` from `next` is the
    // unnarrowed default, so `href as Route` looks redundant and the autofix
    // removes it. The apps compile those same sources with their generated
    // `.next/types` route declarations in scope, where the assertion is required.
    "typescript/no-unnecessary-type-assertion": "off",
    "typescript/prefer-optional-chain": "warn",
    // Keep the cases where implicit coercion hides a real bug, drop the ones
    // where it doesn't:
    //   - nullable number stays flagged (default): `if (count)` silently skips 0.
    //   - always-truthy object stays flagged: catches dead branches, and an
    //     array needs an explicit `.length > 0` rather than an existence check.
    //   - `any` and inconsistent-truthiness unions stay flagged: genuinely
    //     ambiguous.
    //   - nullable string/boolean are allowed: `if (name)` treating "" or
    //     undefined as absent is the intended reading essentially everywhere in
    //     this repo, and spelling it out needs a type guard per call site to
    //     keep narrowing, which is pure noise for no behaviour change.
    "typescript/strict-boolean-expressions": [
      "error",
      { allowNullableBoolean: true, allowNullableString: true },
    ],
    // Autofix strips arguments that are required but undefined-able, silently
    // changing behaviour: `Effect.succeed(undefined)`, `Option.some(undefined)`,
    // `reduce(fn, undefined)`, `mockResolvedValue(undefined)`.
    "unicorn/no-useless-undefined": "off",
    "unicorn/prefer-node-protocol": "warn",
    "use-isnan": "warn",
  },
  overrides: [
    {
      files: [
        "oxlint.config.ts",
        "oxlint.boundaries.config.ts",
        "oxfmt.config.ts",
      ],
      rules: {
        "sort-keys": "off",
      },
    },
    ...commerceImportBoundaryConfig.overrides,
    {
      files: ["packages/testing/**"],
      rules: {
        "unicorn/prefer-module": "off",
      },
    },
    {
      // These roots own the generated route types, so the rule sees the same
      // types `next build` does and its fixes are trustworthy here.
      files: ["apps/web/**", "apps/api/**"],
      rules: {
        "typescript/no-unnecessary-type-assertion": "error",
      },
    },
    {
      // shadcn components are overwritten wholesale by `pnpm bump-ui`
      // (`shadcn add --all --overwrite`); fixes here would be silently
      // discarded on the next sync. Story files pair 1:1 with a vendor
      // component and ship from the same source.
      files: [
        "packages/design-system/components/ui/**",
        "apps/storybook/stories/*.stories.tsx",
      ],
      rules: {
        "typescript/strict-boolean-expressions": "off",
      },
    },
  ],
});
