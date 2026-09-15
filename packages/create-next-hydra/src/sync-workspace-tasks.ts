import { runCommand } from "./git.js";
import { findMaintainerWorkspaceRoot } from "./maintainer-workspace.js";
import { syncWorkspaceTasks } from "./workspace-task-sync.js";

async function main() {
  const check = process.argv.includes("--check");
  const root = await findMaintainerWorkspaceRoot(process.cwd());
  const changed = await syncWorkspaceTasks(root, check);
  if (check && changed.length > 0) {
    process.stderr.write(
      `Workspace Turbo metadata is stale. Run pnpm workspace:sync and commit the updated task files.\n${changed.join("\n")}\n`
    );
    process.exitCode = 1;
  } else {
    // pnpm owns lockfile membership and resolution; never hand-edit its importers.
    await runCommand(
      "pnpm",
      [
        "install",
        "--lockfile-only",
        "--ignore-scripts",
        check ? "--frozen-lockfile" : "--no-frozen-lockfile",
        ...(check ? ["--offline"] : []),
      ],
      { cwd: root, inheritStdio: true }
    );
    process.stdout.write(
      check
        ? "Workspace Turbo metadata and lockfile are current.\n"
        : `Updated ${changed.length} workspace task files and synchronized the outer lockfile. Commit the task files and pnpm-lock.yaml together.\n`
    );
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Workspace task synchronization failed"}\n`
  );
  process.exitCode = 1;
}
