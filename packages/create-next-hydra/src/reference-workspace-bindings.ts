import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import { Schema } from "effect";

import { ManifestJson } from "./packages.ts";

export const REFERENCE_WORKSPACE_NAME = "storefront-contentstack";
export const REFERENCE_PROVIDERS = {
  auth: "workos",
  cms: "contentstack",
  commerce: "commercetools",
} as const;
export const referenceBindings = [
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

// Retained synchronous package export for test-runner configuration consumers.
// CLI orchestration uses Effect FileSystem instead; this is not a second runtime.
export function assertReferenceWorkspaceBindings(workspaceRoot: string): void {
  for (const { app, alias, provider } of referenceBindings) {
    const appRoot = path.join(workspaceRoot, "apps", app);
    const manifest = Schema.decodeSync(ManifestJson)(
      readFileSync(path.join(appRoot, "package.json"), "utf-8")
    );
    if (
      manifest.dependencies?.[alias] !== `workspace:@repo/${provider}@*` ||
      realpathSync(path.join(appRoot, "node_modules", alias)) !==
        realpathSync(path.join(workspaceRoot, "packages", provider))
    ) {
      throw new Error(
        `${app}'s ${alias} must resolve to ${provider} inside ${REFERENCE_WORKSPACE_NAME}. Refresh and reinstall the reference workspace.`
      );
    }
  }
}
