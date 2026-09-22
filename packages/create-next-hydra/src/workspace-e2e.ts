import path from "node:path";

import { z } from "zod";

import { readPackageJson } from "./composition/packages.js";
import { discoverDevelopmentWorkspaces } from "./development-workspaces.js";
import { pathExists } from "./fs-utils.js";
import { runCommand } from "./git.js";

/** Delegate to the same project command delivered by customer scaffolding. */
export async function runWorkspaceE2E(
  sourceRoot: string,
  name: string,
  args: string[] = []
): Promise<void> {
  const names = await discoverDevelopmentWorkspaces(sourceRoot);
  if (!names.includes(name)) {
    throw new Error(
      `Unknown workspace ${name}. Available workspaces: ${names.join(", ")}`
    );
  }
  const workspace = path.join(sourceRoot, "workspaces", name);
  const manifestPath = path.join(workspace, "package.json");
  const manifest = (await pathExists(manifestPath))
    ? await readPackageJson(manifestPath)
    : {};
  if (!z.record(z.string()).parse(manifest.scripts ?? {})["test:e2e"]) {
    throw new Error(
      `${name} has no application E2E runner. Run pnpm --filter create-next-hydra compose ${name} first.`
    );
  }
  await runCommand(
    "pnpm",
    ["run", "test:e2e", ...(args.length ? ["--", ...args] : [])],
    {
      cwd: workspace,
      inheritStdio: true,
    }
  );
}
