import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { readPackageJson } from "./composition/packages.js";
import {
  workspaceDefinitionSchema,
  updateDevelopmentWorkspace,
} from "./development-workspaces.js";
import { runCommand } from "./git.js";
import { info } from "./logger.js";

export const REFERENCE_WORKSPACE_NAME = "storefront-contentstack";
const providers = {
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

/** Run common app integration tests once; domain/provider suites run from source. */
export async function testReferenceWorkspace(
  sourceRoot: string,
  dependencies: {
    update?: typeof updateDevelopmentWorkspace;
    run?: typeof runCommand;
  } = {}
): Promise<void> {
  const targetRoot = path.join(
    sourceRoot,
    "workspaces",
    REFERENCE_WORKSPACE_NAME
  );
  const definition = workspaceDefinitionSchema.parse(
    JSON.parse(
      await readFile(path.join(targetRoot, "next-hydra.json"), "utf-8")
    )
  );
  if (
    (["auth", "cms", "commerce"] as const).some(
      (slot) => definition.providers[slot] !== providers[slot]
    )
  ) {
    throw new Error(
      "Workspace tests require storefront-contentstack with WorkOS, Contentstack and commercetools. Restore its reference definition before running tests."
    );
  }
  const update = dependencies.update ?? updateDevelopmentWorkspace;
  const result = await update(sourceRoot, REFERENCE_WORKSPACE_NAME);
  if (result.needsInstall || result.conflicts.length) {
    throw new Error(
      "Reference workspace must be refreshed and installed before running its application tests."
    );
  }
  await Promise.all(
    appBindings.map(async ({ app, alias, provider }) => {
      const appRoot = path.join(targetRoot, "apps", app);
      const manifest = await readPackageJson(
        path.join(appRoot, "package.json")
      );
      const expectedSpecifier = `workspace:@repo/${provider}@*`;
      const expectedPath = path.join(targetRoot, "packages", provider);
      if (
        manifest.dependencies?.[alias] !== expectedSpecifier ||
        (await realpath(path.join(appRoot, "node_modules", alias))) !==
          (await realpath(expectedPath))
      ) {
        throw new Error(
          `${app}'s ${alias} must resolve to ${provider} inside ${REFERENCE_WORKSPACE_NAME}, not the source checkout or another provider. Refresh and reinstall the reference workspace.`
        );
      }
    })
  );
  info(
    `Application tests: ${REFERENCE_WORKSPACE_NAME} (WorkOS, Contentstack, commercetools)`
  );
  await (dependencies.run ?? runCommand)(
    "pnpm",
    [
      "exec",
      "turbo",
      "run",
      "test",
      "--filter=./apps/*",
      "--only",
      "--continue=always",
    ],
    { cwd: targetRoot, inheritStdio: true }
  );
}
