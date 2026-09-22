import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { workspaceFilePathSchema } from "./composition/schema.js";
import { CommandExecutionError, runGit } from "./git.js";
import type { RunCommandResult } from "./types.js";
import { workspaceNonSourceDirectories } from "./workspace-artifacts.js";
import { assertDirectoryPath, isEnvironmentFile } from "./workspace-files.js";

export type WorkspaceSnapshotFile = {
  target: string;
  content: Uint8Array;
  mode: number;
};

/** Credentials and runtime output must not enter Git objects or inspection output. */
export function isWorkspaceSnapshotTarget(target: string): boolean {
  return !target
    .split("/")
    .some(
      (part) =>
        workspaceNonSourceDirectories.has(part) ||
        isEnvironmentFile(part) ||
        [".npmrc", ".netrc", ".ssh", ".aws", ".azure"].includes(part) ||
        /\.(?:pem|key|p12|pfx|keystore|tsbuildinfo)$/iu.test(part) ||
        /^id_(?:rsa|ed25519|ecdsa)(?:\.|$)/u.test(part)
    );
}

export function workspaceSnapshotDirectory(
  sourceRoot: string,
  targetRoot: string
): string {
  const identity = createHash("sha256")
    .update(path.resolve(targetRoot))
    .digest("hex");
  return path.resolve(
    sourceRoot,
    ".cache",
    "workspace-snapshots",
    `${identity}.git`
  );
}

function snapshotGit(
  gitDirectory: string,
  workTree: string,
  index: string
): (args: string[]) => Promise<RunCommandResult> {
  // Inherited Git paths (including those set by hooks) must never select the
  // maintainer index, objects or configuration for this private repository.
  const env: NodeJS.ProcessEnv = Object.fromEntries(
    Object.keys(process.env)
      .filter((name) => name.startsWith("GIT_"))
      .map((name) => [name, undefined])
  );
  Object.assign(env, {
    GIT_ATTR_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_INDEX_FILE: index,
    GIT_OPTIONAL_LOCKS: "0",
  });
  return async (args: string[]) =>
    await runGit(
      [
        `--git-dir=${gitDirectory}`,
        ...(args[0] === "init" ? [] : [`--work-tree=${workTree}`]),
        "--literal-pathspecs",
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "core.attributesFile=/dev/null",
        "-c",
        "core.autocrlf=false",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "user.name=Workspace composition",
        "-c",
        "user.email=workspace@localhost",
        ...args,
      ],
      { cwd: workTree, env }
    );
}

/** Snapshot approved bytes, never `git add` the user's live workspace. */
export async function saveWorkspaceSnapshot(options: {
  sourceRoot: string;
  targetRoot: string;
  files: WorkspaceSnapshotFile[];
  previous?: string;
}): Promise<string> {
  const directory = workspaceSnapshotDirectory(
    options.sourceRoot,
    options.targetRoot
  );
  await assertDirectoryPath(directory);
  await mkdir(directory, { recursive: true });
  const temporary = await mkdtemp(path.join(directory, "snapshot-"));
  try {
    const treeRoot = path.join(temporary, "tree");
    await mkdir(treeRoot);
    const git = snapshotGit(directory, treeRoot, path.join(temporary, "index"));
    await git([
      "init",
      "--bare",
      "--template=",
      "--object-format=sha1",
      "--initial-branch=composition",
      directory,
    ]);
    // Snapshots compare exact bytes, not application .gitattributes conversions.
    await mkdir(path.join(directory, "info"), { recursive: true });
    await writeFile(
      path.join(directory, "info/attributes"),
      "* -text -filter -ident -working-tree-encoding !diff\n"
    );
    const writes = await Promise.allSettled(
      options.files.map(async (file) => {
        workspaceFilePathSchema.parse(file.target);
        if (!isWorkspaceSnapshotTarget(file.target)) {
          return;
        }
        const destination = path.join(treeRoot, file.target);
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, file.content, { mode: file.mode });
      })
    );
    const failures = writes.filter((result) => result.status === "rejected");
    if (failures.length) {
      throw new AggregateError(
        failures.map(
          (result) =>
            new Error("Snapshot file write failed.", { cause: result.reason })
        ),
        "Unable to prepare workspace snapshot files."
      );
    }
    await git(["read-tree", "--empty"]);
    await git(["add", "--force", "--all", "--", "."]);
    const treeResult = await git(["write-tree"]);
    const tree = treeResult.stdout.trim();
    let parent = options.previous;
    if (parent) {
      try {
        const previousResult = await git([
          "rev-parse",
          "--verify",
          `${parent}^{tree}`,
        ]);
        const previousTree = previousResult.stdout.trim();
        if (tree === previousTree) {
          return parent;
        }
      } catch (error) {
        if (!(error instanceof CommandExecutionError) || error.code !== 128) {
          throw error;
        }
        // A cleared local cache can be rebuilt from verified composition bytes.
        parent = undefined;
      }
    }
    const commitResult = await git([
      "commit-tree",
      tree,
      ...(parent ? ["-p", parent] : []),
      "-m",
      "Compose workspace",
    ]);
    const commit = commitResult.stdout.trim();
    await git(["update-ref", "refs/heads/composition", commit]);
    return commit;
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
}

/** Uses a disposable index; inspection never advances the saved composition snapshot. */
export async function diffWorkspaceSnapshot(options: {
  sourceRoot: string;
  targetRoot: string;
  commit: string;
}): Promise<{ changes: Map<string, string>; patch: string }> {
  const directory = workspaceSnapshotDirectory(
    options.sourceRoot,
    options.targetRoot
  );
  if (!(await assertDirectoryPath(directory))) {
    throw new Error(
      "Composition snapshot is missing. Refresh with compose <name> to recreate it; existing edits remain protected."
    );
  }
  await readFile(path.join(directory, "HEAD"));
  const temporary = await mkdtemp(path.join(directory, "inspection-"));
  try {
    const git = snapshotGit(
      directory,
      options.targetRoot,
      path.join(temporary, "index")
    );
    await git(["read-tree", options.commit]);
    const flags = [
      "--no-ext-diff",
      "--no-textconv",
      "--no-renames",
      "--no-color",
    ];
    const namesResult = await git([
      "diff",
      ...flags,
      "--name-status",
      "-z",
      options.commit,
      "--",
    ]);
    const names = namesResult.stdout.split("\0");
    const changes = new Map<string, string>();
    for (let index = 0; index + 1 < names.length; index += 2) {
      const target = workspaceFilePathSchema.parse(names[index + 1]);
      changes.set(target, names[index] ?? "M");
    }
    const patchResult = await git(["diff", ...flags, options.commit, "--"]);
    return { changes, patch: patchResult.stdout };
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
}
