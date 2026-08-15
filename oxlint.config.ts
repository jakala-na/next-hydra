import { recommended as effectRecommended } from "@effect/tsgo/oxlint-presets";
import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import react from "ultracite/oxlint/react";
import vitest from "ultracite/oxlint/vitest";

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
    "repos/**",
  ],
  rules: {
    ...commerceImportBoundaryConfig.rules,
    "import/no-namespace": "warn",
    "jsx-a11y/label-has-associated-control": "warn",
    "jsx-a11y/no-noninteractive-element-interactions": "warn",
    "jsx-a11y/no-static-element-interactions": "warn",
    "jsx-a11y/prefer-tag-over-role": "warn",
    "no-console": "warn",
    "no-empty": "warn",
    "no-magic-numbers": "warn",
    "no-shadow": "warn",
    "no-useless-escape": "off",
    "oxc/no-barrel-file": "off",
    radix: "warn",
    "react/no-array-index-key": "warn",
    "react/no-danger": "warn",
    "react/no-unstable-nested-components": "warn",
    "typescript/consistent-type-definitions": "off",
    "typescript/prefer-optional-chain": "warn",
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
  ],
});
