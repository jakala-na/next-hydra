import { existsSync } from "node:fs";
import path from "node:path";

import {
  assertReferenceWorkspaceBindings,
  REFERENCE_WORKSPACE_NAME,
} from "create-next-hydra/reference-workspace";

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
  const name = REFERENCE_WORKSPACE_NAME;
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
  assertReferenceWorkspaceBindings(workspaceRoot);
  return workspaceRoot;
}
