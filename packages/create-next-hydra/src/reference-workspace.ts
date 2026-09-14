import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  workspaceDefinitionSchema,
  updateDevelopmentWorkspace,
} from "./development-workspaces.js";
import { runCommand } from "./git.js";
import { info } from "./logger.js";
import {
  assertReferenceWorkspaceBindings,
  REFERENCE_PROVIDERS,
  REFERENCE_WORKSPACE_NAME,
} from "./reference-workspace-bindings.js";

export { REFERENCE_WORKSPACE_NAME } from "./reference-workspace-bindings.js";

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
      (slot) => definition.providers[slot] !== REFERENCE_PROVIDERS[slot]
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
  assertReferenceWorkspaceBindings(targetRoot);
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
