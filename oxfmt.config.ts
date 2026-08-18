import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

const generatedPatterns = [
  "packages/cms-contentstack/gql/*",
  "packages/cms-drupal/gql/*",
  "packages/commerce/gql/*",
  "packages/commerce-commercetools/gql/*",
  "apps/email/.react-email/",
  ".scratch/**",
  "repos/**",
  "tools/oxlint/anti-slop/**",
];

export default defineConfig({
  ...ultracite,
  ignorePatterns: [...(ultracite.ignorePatterns ?? []), ...generatedPatterns],
  sortPackageJson: false,
});
