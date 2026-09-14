import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import { parsePackageJson } from "./composition/packages.js";

export const REFERENCE_WORKSPACE_NAME = "storefront-contentstack";
export const REFERENCE_PROVIDERS = {
  auth: "workos",
  cms: "contentstack",
  commerce: "commercetools",
} as const;

const appBindings = [
  { alias: "@repo/auth", app: "web", provider: "auth-workos" },
  { alias: "@repo/cms", app: "web", provider: "cms-contentstack" },
  {
    alias: "@repo/commerce-provider",
    app: "web",
    provider: "commerce-commercetools",
  },
  { alias: "@repo/auth", app: "api", provider: "auth-workos" },
  {
    alias: "@repo/commerce-provider",
    app: "api",
    provider: "commerce-commercetools",
  },
  { alias: "@repo/auth", app: "admin", provider: "auth-workos" },
] as const;

function bindingError(
  app: string,
  alias: string,
  provider: string,
  cause?: unknown
): Error {
  return new Error(
    `${app}'s ${alias} must resolve to ${provider} inside ${REFERENCE_WORKSPACE_NAME}, not the source checkout or another provider. Refresh and reinstall the reference workspace.`,
    { cause }
  );
}

/** Both application test runners must exercise the installed reference graph. */
export function assertReferenceWorkspaceBindings(workspaceRoot: string): void {
  for (const { app, alias, provider } of appBindings) {
    const appRoot = path.join(workspaceRoot, "apps", app);
    const manifestPath = path.join(appRoot, "package.json");
    try {
      const manifest = parsePackageJson(
        readFileSync(manifestPath, "utf-8"),
        manifestPath
      );
      if (
        manifest.dependencies?.[alias] === `workspace:@repo/${provider}@*` &&
        realpathSync(path.join(appRoot, "node_modules", alias)) ===
          realpathSync(path.join(workspaceRoot, "packages", provider))
      ) {
        continue;
      }
    } catch (error) {
      throw bindingError(app, alias, provider, error);
    }
    throw bindingError(app, alias, provider);
  }
}
