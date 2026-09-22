import { CommandExecutionError } from "./git.js";
import { findMaintainerWorkspaceRoot } from "./maintainer-workspace.js";
import { runWorkspaceE2E } from "./workspace-e2e.js";

try {
  const [name, ...args] = process.argv.slice(2);
  if (!name) {
    throw new Error("Specify a named workspace to run its E2E tests.");
  }
  await runWorkspaceE2E(
    await findMaintainerWorkspaceRoot(process.cwd()),
    name,
    args
  );
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Workspace E2E failed"}\n`
  );
  process.exitCode =
    error instanceof CommandExecutionError ? (error.code ?? 1) : 1;
}
