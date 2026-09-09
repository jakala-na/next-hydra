import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { Schema } from "effect";

const AppManifest = Schema.Struct({
  dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});
const decodeManifest = Schema.decodeUnknownSync(
  Schema.fromJsonString(AppManifest)
);

/** Source checkouts run apps in a composition; customer projects already are one. */
export function resolveApplicationWorkspace(
  repositoryRoot: string,
  environment: Readonly<Record<string, string | undefined>>
): string {
  const external =
    environment.E2E_WEB_URL &&
    environment.E2E_API_URL &&
    environment.E2E_ADMIN_URL;
  if (
    external ||
    !existsSync(
      path.join(repositoryRoot, "packages/create-next-hydra/package.json")
    )
  ) {
    return repositoryRoot;
  }
  const name = "storefront-contentstack";
  if (environment.E2E_WORKSPACE && environment.E2E_WORKSPACE !== name) {
    throw new Error(
      "Local E2E tests target storefront-contentstack with WorkOS, Contentstack and commercetools. Remove E2E_WORKSPACE; other compositions are covered by provider and composition tests."
    );
  }
  const workspaceRoot = path.join(repositoryRoot, "workspaces", name);
  if (
    !["web", "api", "admin"].every((app) =>
      existsSync(path.join(workspaceRoot, "apps", app, "package.json"))
    )
  ) {
    throw new Error(
      `E2E requires a composed workspace with web, API and admin. Run pnpm --filter create-next-hydra compose ${name} --copy-env first.`
    );
  }
  const bindings = [
    ["web", "@repo/auth", "auth-workos"],
    ["web", "@repo/cms", "cms-contentstack"],
    ["web", "@repo/commerce-provider", "commerce-commercetools"],
    ["api", "@repo/auth", "auth-workos"],
    ["api", "@repo/commerce-provider", "commerce-commercetools"],
    ["admin", "@repo/auth", "auth-workos"],
  ] as const;
  for (const [app, alias, provider] of bindings) {
    if (
      decodeManifest(
        readFileSync(
          path.join(workspaceRoot, "apps", app, "package.json"),
          "utf-8"
        )
      ).dependencies?.[alias] !== `workspace:@repo/${provider}@*`
    ) {
      throw new Error(
        `Reference storefront provider mismatch: ${app}'s ${alias} must select ${provider}. Refresh storefront-contentstack before running E2E tests.`
      );
    }
  }
  return workspaceRoot;
}
