/* oxlint-disable no-await-in-loop, no-console -- Workspace operations are ordered, bounded and reported by the maintainer CLI. */
/* oxlint-disable unicorn/no-array-sort -- Only fresh arrays are sorted; this package targets ES2022. */
import { watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import {
  lstat,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { composeWorkspace } from "./compose.js";
import { parsePackageJson } from "./composition/packages.js";
import { resolveWorkspacePath } from "./composition/paths.js";
import { workspaceSelectionSchema } from "./composition/schema.js";
import { runCommand, runGit } from "./git.js";
import {
  copyMaintainerEnvironmentFiles,
  findMaintainerWorkspaceRoot,
  seedWorkspaceEnvironmentFile,
} from "./maintainer-workspace.js";
import {
  workspaceCacheDirectories,
  workspaceNonSourceDirectories,
  workspaceSettingKind,
} from "./workspace-artifacts.js";
import {
  assertDirectoryPath,
  isEnvironmentFile,
  workspaceSourceFiles,
} from "./workspace-files.js";
import {
  hashWorkspaceContent,
  inspectWorkspaceChanges,
  describeWorkspaceFile,
  copiedWorkspaceSources,
  updateWorkspaceFiles,
  WORKSPACE_LOCK,
  WORKSPACE_STATE,
} from "./workspace-update.js";
import type {
  WorkspaceFile,
  WorkspaceUpdateResult,
} from "./workspace-update.js";

export const workspaceDefinitionSchema = workspaceSelectionSchema.extend({
  development: z
    .object({ port: z.number().int().min(1024).max(65_533).optional() })
    .strict()
    .optional(),
});
type Definition = z.infer<typeof workspaceDefinitionSchema>;
export type DevelopmentWorkspaceOptions = {
  all?: boolean;
  check?: boolean;
  watch?: boolean;
  copyEnv?: boolean;
  install?: boolean;
  offline?: boolean;
  explain?: string | true;
  diff?: boolean;
  run?: "dev" | "build" | "test" | "typecheck";
};
const definitionName = "next-hydra.json";
function developmentWorkspacePath(sourceRoot: string, name: string): string {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(name)) {
    throw new Error(
      "Use a workspace name of 1–63 lowercase letters, numbers or hyphens, starting and ending with a letter or number, not a path. It also names the local host."
    );
  }
  return path.join(sourceRoot, "workspaces", name);
}

const defaultIgnoreRules = `# Commit workspace settings only; Compose owns the materialized application.
/*
!/.gitignore
!/next-hydra.json
!/README.md
!/tasks/
/tasks/*
!/tasks/package.json
!/tasks/turbo.json
!/apps/
/apps/*
!/apps/*/
/apps/*/*
!/apps/*/.gitignore
!/apps/*/vercel.json
`;

export async function discoverDevelopmentWorkspaces(
  sourceRoot: string
): Promise<string[]> {
  const root = path.join(sourceRoot, "workspaces");
  if (!(await assertDirectoryPath(root))) {
    return [];
  }
  // New definitions participate before they are committed; explicitly ignored ones opt out.
  const inventory = new Set(await workspaceSourceFiles(sourceRoot));
  const names: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }
    if (!inventory.has(`workspaces/${entry.name}/${definitionName}`)) {
      continue;
    }
    try {
      const info = await lstat(path.join(root, entry.name, definitionName));
      if (!info.isFile()) {
        throw new Error(
          `Workspace definition must be a regular file: ${entry.name}/${definitionName}`
        );
      }
      names.push(entry.name);
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ENOENT")
      ) {
        throw error;
      }
    }
  }
  return names.sort();
}

async function readDefinition(targetRoot: string): Promise<Definition> {
  await assertDirectoryPath(targetRoot);
  const file = path.join(targetRoot, definitionName);
  const info = await lstat(file);
  if (!info.isFile()) {
    throw new Error(`Workspace definition must not be a link: ${file}`);
  }
  return workspaceDefinitionSchema.parse(
    JSON.parse(await readFile(file, "utf-8"))
  );
}

/** Seed once; subsequent Git visibility decisions belong to the workspace author. */
async function seedWorkspaceIgnoreFile(targetRoot: string): Promise<void> {
  const target = path.join(targetRoot, ".gitignore");
  try {
    await writeFile(target, defaultIgnoreRules, { flag: "wx" });
  } catch (error) {
    if (
      !(error instanceof Error && "code" in error && error.code === "EEXIST")
    ) {
      throw error;
    }
    const info = await lstat(target);
    if (!info.isFile()) {
      throw new Error(`Workspace settings must be regular files: ${target}`, {
        cause: error,
      });
    }
  }
}

/** Use the actual scaffold and renderer, without installing or touching the destination. */
async function prepareWorkspaceFiles(
  sourceRoot: string,
  name: string,
  definition: Definition
) {
  const stagingRoot = await mkdtemp(
    path.join(sourceRoot, "workspaces", ".prepare-")
  );
  const outputRoot = path.join(stagingRoot, name);
  try {
    const { cms } = definition.providers;
    if (!cms) {
      throw new Error(`${name} requires a CMS provider.`);
    }
    const created = await composeWorkspace(
      outputRoot,
      {
        addOns: definition.addOns,
        auth: definition.providers.auth,
        cms,
        commerce: definition.providers.commerce,
        copyEnv: false,
        install: false,
        port: definition.development?.port,
      },
      { name, report: () => undefined, sourceRoot }
    );
    const environmentTargets = created.origins
      .filter((file) => isEnvironmentFile(path.posix.basename(file.target)))
      .map((file) => file.target);
    const entries = created.origins.filter(
      (file) => !isEnvironmentFile(path.posix.basename(file.target))
    );
    const files: WorkspaceFile[] = [];
    const dependencyInputs: Record<string, string> = {};
    const dependencyDirectories: string[] = [];
    for (const entry of entries) {
      const setting = workspaceSettingKind(entry.target);
      if (setting === "ignore" || setting === "deployment") {
        // Customer defaults stay in customer output; named workspaces own their
        // deployment and Git visibility settings.
        continue;
      }
      const file = path.join(outputRoot, entry.target);
      const content = await readFile(file);
      const info = await stat(file);
      files.push({
        content,
        // oxlint-disable-next-line no-bitwise -- Preserve ordinary POSIX permissions.
        mode: info.mode & 0o777,
        origin: entry.origin,
        owner: entry.owner,
        target: entry.target,
      });
      if (path.basename(entry.target) === "package.json") {
        const manifest = parsePackageJson(content.toString(), entry.target);
        if (
          [
            manifest.dependencies,
            manifest.devDependencies,
            manifest.optionalDependencies,
            manifest.peerDependencies,
          ].some((section) => Object.keys(section ?? {}).length > 0)
        ) {
          dependencyDirectories.push(path.posix.dirname(entry.target));
        }
        dependencyInputs[entry.target] = hashWorkspaceContent(
          JSON.stringify(
            Object.fromEntries(
              [
                "name",
                "version",
                "packageManager",
                "engines",
                "dependencies",
                "devDependencies",
                "optionalDependencies",
                "peerDependencies",
                "pnpm",
              ].map((key) => [key, manifest[key]])
            )
          )
        );
      } else if (
        ["pnpm-lock.yaml", "pnpm-workspace.yaml"].includes(entry.target) ||
        entry.target.endsWith(".patch")
      ) {
        dependencyInputs[entry.target] = hashWorkspaceContent(content);
      }
    }
    // Sorting avoids reinstalls caused by registry inventory ordering alone.
    const dependencyHash = hashWorkspaceContent(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(dependencyInputs).sort(([a], [b]) =>
            a.localeCompare(b)
          )
        )
      )
    );
    const environmentDefaults = await Promise.all(
      environmentTargets.map(async (target) => ({
        content: await readFile(path.join(outputRoot, target)),
        target,
      }))
    );
    return {
      dependencyDirectories,
      dependencyHash,
      environmentDefaults,
      files,
    };
  } finally {
    // This unique temporary directory was created by this invocation. rm does not follow file symlinks.
    await rm(stagingRoot, { force: true, recursive: true });
  }
}

/** Only explicit workspace settings and restored caches may precede the first composition. */
async function inspectWorkspaceDirectory(
  targetRoot: string
): Promise<string[]> {
  const entries = await readdir(targetRoot);
  const initialized = entries.includes(WORKSPACE_STATE);
  const settings: string[] = [];
  const inspect = async (relative: string): Promise<void> => {
    for (const entry of await readdir(path.join(targetRoot, relative), {
      withFileTypes: true,
    })) {
      const target = path.posix.join(relative, entry.name);
      const absolute = path.join(targetRoot, target);
      if (workspaceCacheDirectories.has(entry.name)) {
        await assertDirectoryPath(absolute);
        continue;
      }
      if (target === ".git") {
        throw new Error("Cannot compose over an existing Git repository.");
      }
      const setting = workspaceSettingKind(target);
      if (setting) {
        if (!entry.isFile()) {
          throw new Error(
            `Workspace settings must be regular files: ${target}`
          );
        }
        settings.push(target);
        continue;
      }
      if (
        [definitionName, "README.md", WORKSPACE_LOCK, WORKSPACE_STATE].includes(
          target
        )
      ) {
        if (!entry.isFile()) {
          throw new Error(
            `Workspace metadata must be regular files: ${target}`
          );
        }
        continue;
      }
      if (entry.isDirectory()) {
        await inspect(target);
      } else if (!initialized) {
        throw new Error(
          `Cannot initialize an existing unowned workspace containing ${target}. Only its definition, root/app .gitignore files, README, app vercel.json files, task metadata and restored caches may precede initialization. Nothing was replaced.`
        );
      }
    }
  };
  await inspect("");
  return settings;
}

export async function updateDevelopmentWorkspace(
  sourceRoot: string,
  name: string,
  options: DevelopmentWorkspaceOptions = {}
): Promise<WorkspaceUpdateResult> {
  const targetRoot = developmentWorkspacePath(sourceRoot, name);
  const definition = await readDefinition(targetRoot);
  const lockPath = path.join(targetRoot, WORKSPACE_LOCK);
  let lock;
  try {
    lock = await open(lockPath, "wx", 0o600);
  } catch (error) {
    throw new Error(
      `Cannot acquire workspace update lock: ${lockPath}. Another update may be running. If interrupted, verify that process has stopped before removing this lock and retrying.`,
      { cause: error }
    );
  }
  try {
    await lock.writeFile(`${JSON.stringify({ pid: process.pid })}\n`);
    const preservedFiles = await inspectWorkspaceDirectory(targetRoot);
    const prepared = await prepareWorkspaceFiles(sourceRoot, name, definition);
    for (const target of preservedFiles) {
      if (workspaceSettingKind(target) !== "deployment") {
        continue;
      }
      const manifest = path.posix.join(
        path.posix.dirname(target),
        "package.json"
      );
      if (!prepared.files.some((file) => file.target === manifest)) {
        throw new Error(
          `Deployment settings target an app not selected by this workspace: ${target}`
        );
      }
    }
    const needsIgnoreFile = !preservedFiles.includes(".gitignore");
    const result = await updateWorkspaceFiles({
      sourceRoot,
      targetRoot,
      ...prepared,
      check: options.check,
      install:
        options.install === false
          ? undefined
          : async (cwd) => {
              await runCommand(
                "pnpm",
                [
                  "install",
                  ...(options.offline ? ["--offline"] : []),
                  "--no-frozen-lockfile",
                ],
                { cwd, verbose: true }
              );
            },
      preservedFiles,
      rejectUnowned: true,
      snapshot: true,
    });
    if (!options.check && result.conflicts.length === 0 && options.copyEnv) {
      const copied = await copyMaintainerEnvironmentFiles(
        sourceRoot,
        targetRoot,
        { preserveExisting: true }
      );
      console.log(
        `${name}: copied ${copied.length} missing environment files; existing values preserved.`
      );
    }
    if (!options.check && result.conflicts.length === 0) {
      for (const file of prepared.environmentDefaults) {
        await seedWorkspaceEnvironmentFile(targetRoot, file);
      }
    }
    if (needsIgnoreFile) {
      // A failed refresh must not hide previously visible work needing reconciliation.
      if (!options.check) {
        await seedWorkspaceIgnoreFile(targetRoot);
      }
      result.changed += 1;
    }
    return result;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

function describeResult(
  sourceRoot: string,
  name: string,
  result: WorkspaceUpdateResult,
  check: boolean
): void {
  console.log(
    `${name}: ${result.changed} ${check ? "pending" : "updated"} files, ${result.removed} ${check ? "pending removals" : "removed"}; dependencies ${result.needsInstall ? "need installation" : "current"}.`
  );
  if (result.conflicts.length) {
    console.log(
      `Local changes requiring reconciliation:\n${result.conflicts.map((file) => `  ${describeWorkspaceFile(file, result.origins, sourceRoot)}`).join("\n")}`
    );
  }
  if (result.unowned.length) {
    console.log(
      `Unregistered files preserved; move them into canonical source and register ownership before relying on a fresh workspace:\n${result.unowned.map((file) => `  ${file}`).join("\n")}`
    );
  }
}

/** Explain the current definition, even before installation; no workspace files are updated. */
export async function explainDevelopmentWorkspace(
  sourceRoot: string,
  name: string,
  target?: string
): Promise<string> {
  const targetRoot = developmentWorkspacePath(sourceRoot, name);
  const normalized =
    target === undefined
      ? undefined
      : resolveWorkspacePath(target, "workspace file to explain");
  const definition = await readDefinition(targetRoot);
  const setting =
    normalized === undefined ? undefined : workspaceSettingKind(normalized);
  if (setting === "ignore") {
    return `${name}: ${normalized} is workspace-owned Git visibility configuration, not registry output. Edit it in this workspace; the root .gitignore controls which settings Git exposes.`;
  }
  if (setting === "deployment") {
    return `${name}: ${normalized} is workspace-owned deployment configuration, not registry output. Edit and commit it in this workspace.`;
  }
  if (setting === "tasks") {
    return `${name}: ${normalized} is derived Turbo task metadata, not application output. Run pnpm workspace:sync from the source checkout and commit the result.`;
  }
  const prepared = await prepareWorkspaceFiles(sourceRoot, name, definition);
  if (normalized === undefined) {
    return `${name}: ${prepared.files.length} selected files\n${prepared.files.map((file) => describeWorkspaceFile(file.target, prepared.files, sourceRoot)).join("\n")}`;
  }
  const file = prepared.files.find((entry) => entry.target === normalized);
  if (!file) {
    return `${name}: ${normalized} is not selected by this definition. If locally authored, reconcile it into canonical source and registry ownership.`;
  }
  return `${name}: ${describeWorkspaceFile(normalized, prepared.files, sourceRoot)}\n    Physical output: edit the source/template, then refresh this workspace.`;
}

/** Watch selected authoring trees without traversing dependencies, caches or ignored output. */
async function workspaceWatchPlan(
  sourceRoot: string,
  names: string[]
): Promise<{
  accepts: (file: string) => boolean;
  directories: Map<string, boolean>;
  files: Set<string>;
}> {
  const sourceFiles = await workspaceSourceFiles(sourceRoot);
  const ignoredResult = await runGit(
    [
      "ls-files",
      "--others",
      "--ignored",
      "--exclude-standard",
      "--directory",
      "-z",
    ],
    { cwd: sourceRoot }
  );
  const ignored = ignoredResult.stdout
    .split("\0")
    .filter(Boolean)
    .map((file) => file.replace(/\/$/u, ""));
  const accepts = (file: string) =>
    !file
      .split("/")
      .some(
        (part) =>
          workspaceNonSourceDirectories.has(part) ||
          isEnvironmentFile(part) ||
          part.endsWith(".tsbuildinfo")
      ) &&
    !ignored.some((entry) => file === entry || file.startsWith(`${entry}/`));
  const files = new Set([
    ".gitignore",
    ...sourceFiles.filter((file) =>
      /(?:^|\/)(?:\.gitignore|registry\.json|package\.json|pnpm-workspace\.yaml|pnpm-lock\.yaml)$/u.test(
        file
      )
    ),
  ]);
  const trees = new Set<string>();
  for (const file of sourceFiles) {
    const index = file.indexOf("/registry/");
    if (index !== -1) {
      trees.add(file.slice(0, index + "/registry".length));
    }
  }
  for (const name of names) {
    files.add(path.posix.join("workspaces", name, definitionName));
    for (const source of await copiedWorkspaceSources(
      path.join(sourceRoot, "workspaces", name)
    )) {
      const tree = /^(?:apps|packages)\/[^/]+(?=\/)/u.exec(source)?.[0];
      if (tree) {
        trees.add(tree);
      } else {
        files.add(source);
      }
    }
  }
  const directories = new Map<string, boolean>();
  // Parent watches also see a selected root being removed or recreated.
  for (const tree of trees) {
    files.add(tree);
  }
  for (const file of files) {
    directories.set(path.posix.dirname(file), false);
  }
  const visit = async (directory: string): Promise<void> => {
    if (!accepts(directory)) {
      return;
    }
    let entries;
    try {
      entries = await readdir(path.join(sourceRoot, directory), {
        withFileTypes: true,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return;
      }
      throw error;
    }
    directories.set(directory, true);
    for (const entry of entries) {
      // Dirents do not follow symlinks into dependency or external source trees.
      if (entry.isDirectory()) {
        await visit(path.posix.join(directory, entry.name));
      }
    }
  };
  for (const tree of trees) {
    if ([...trees].some((parent) => tree.startsWith(`${parent}/`))) {
      continue;
    }
    if (await assertDirectoryPath(path.join(sourceRoot, tree))) {
      await visit(tree);
    }
  }
  return { accepts, directories, files };
}

export async function watchWorkspaceInputs(
  sourceRoot: string,
  names: string[],
  refresh: () => Promise<void>,
  signal: AbortSignal
): Promise<void> {
  const watchers = new Map<string, FSWatcher>();
  let dirty = false;
  let stopped = false;
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  // oxlint-disable-next-line promise/avoid-new -- Adapt filesystem events and process signals to an awaited lifetime.
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      stopped = true;
      clearInterval(timer);
      for (const watcher of watchers.values()) {
        watcher.close();
      }
      watchers.clear();
      // oxlint-disable-next-line no-use-before-define -- Paired lifetime callbacks reference each other but run only after setup.
      signal.removeEventListener("abort", stop);
    };
    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };
    const stop = () => {
      cleanup();
      // Finish an already-started update before releasing the command's lifetime.
      void (running ?? Promise.resolve()).then(resolve, reject);
    };
    const connect = async () => {
      const plan = await workspaceWatchPlan(sourceRoot, names);
      if (stopped) {
        return;
      }
      const onChange =
        (directory: string, tree: boolean) =>
        (event: string, filename: string | null) => {
          if (!filename) {
            dirty = true;
            return;
          }
          const file = path.posix.join(directory, filename);
          if (plan.accepts(file) && (tree || plan.files.has(file))) {
            if (event === "rename") {
              // Directory watches follow the old inode after a rename. Retire it
              // so reconnect schedules a refresh even when the same path is reused.
              watchers.get(file)?.close();
              watchers.delete(file);
            }
            dirty = true;
          }
        };
      const next = new Map<string, FSWatcher>();
      try {
        for (const [directory, tree] of plan.directories) {
          try {
            const watcher = watch(
              path.join(sourceRoot, directory),
              onChange(directory, tree)
            );
            watcher.on("error", fail);
            next.set(directory, watcher);
          } catch (error) {
            // A directory can disappear while an editor renames its tree. Parent watches remain active.
            if (
              error instanceof Error &&
              "code" in error &&
              error.code === "ENOENT"
            ) {
              continue;
            }
            throw error;
          }
        }
      } catch (error) {
        for (const watcher of next.values()) {
          watcher.close();
        }
        throw error;
      }
      // A new directory may receive files between composition and watcher connection.
      if ([...next.keys()].some((directory) => !watchers.has(directory))) {
        dirty = true;
      }
      // Keep current watches alive until the replacement set is ready.
      for (const watcher of watchers.values()) {
        watcher.close();
      }
      watchers.clear();
      for (const [directory, watcher] of next) {
        watchers.set(directory, watcher);
      }
    };
    timer = setInterval(() => {
      if (stopped || !dirty || running) {
        return;
      }
      dirty = false;
      running = refresh()
        .then(connect)
        .catch(fail)
        .finally(() => {
          running = undefined;
        });
    }, 300);
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) {
      stop();
      return;
    }
    // Refresh once after connecting to cover edits between the initial update and watcher startup.
    void connect()
      .then(() => {
        dirty = true;
      })
      .catch(fail);
  });
}

export async function composeDevelopmentWorkspaces(
  name: string | undefined,
  options: DevelopmentWorkspaceOptions = {}
): Promise<void> {
  if (Boolean(name) === Boolean(options.all)) {
    throw new Error("Choose one workspace name or --all.");
  }
  if (options.check && options.watch) {
    throw new Error("--check and --watch cannot be combined.");
  }
  const explaining = options.explain !== undefined;
  if (
    (explaining || options.diff) &&
    (options.check || options.watch || options.copyEnv || options.run)
  ) {
    throw new Error(
      "--explain and --diff are read-only and cannot be combined with --check, --watch, --copy-env or --run."
    );
  }
  if (explaining && options.diff) {
    throw new Error(
      "Choose --explain for source ownership or --diff for local changes."
    );
  }
  if (options.run && (options.check || options.watch || explaining)) {
    throw new Error(
      "--run cannot be combined with --check, --watch or --explain."
    );
  }
  if (options.run === "dev" && options.all) {
    throw new Error("Choose one named workspace for --run dev.");
  }
  const sourceRoot = await findMaintainerWorkspaceRoot(process.cwd());
  const names = name ? [name] : await discoverDevelopmentWorkspaces(sourceRoot);
  if (!names.length) {
    throw new Error(
      "No named workspace definitions found in workspaces/*/next-hydra.json."
    );
  }
  if (options.diff) {
    for (const workspace of names) {
      const result = await inspectWorkspaceChanges(
        sourceRoot,
        developmentWorkspacePath(sourceRoot, workspace)
      );
      const changed = result.files.filter(
        (file) => file.status !== "unchanged"
      );
      console.log(
        `${workspace}: ${changed.length} local changes since the last composition snapshot.`
      );
      for (const file of changed) {
        console.log(
          `${file.status}: ${describeWorkspaceFile(file.target, result.files, sourceRoot)}`
        );
      }
      if (result.patch) {
        console.log(result.patch);
      }
    }
    return;
  }
  if (explaining) {
    for (const workspace of names) {
      console.log(
        await explainDevelopmentWorkspace(
          sourceRoot,
          workspace,
          options.explain === true ? undefined : options.explain
        )
      );
    }
    return;
  }
  const refresh = async (watching = false) => {
    const failures: string[] = [];
    for (const workspace of names) {
      try {
        const result = await updateDevelopmentWorkspace(sourceRoot, workspace, {
          ...options,
          copyEnv: watching ? false : options.copyEnv,
          install: watching ? false : options.install,
        });
        describeResult(sourceRoot, workspace, result, options.check ?? false);
        if (options.run) {
          if (result.needsInstall) {
            throw new Error(
              "Install this workspace's dependencies before running its tasks (omit --no-install)."
            );
          }
          await runCommand("pnpm", ["run", options.run], {
            cwd: path.join(sourceRoot, "workspaces", workspace),
            inheritStdio: true,
          });
        }
        if (
          options.check &&
          (result.changed ||
            result.removed ||
            result.conflicts.length ||
            result.unowned.length ||
            result.needsInstall)
        ) {
          failures.push(workspace);
        }
      } catch (error) {
        console.error(
          `${workspace}: ${error instanceof Error ? error.message : String(error)}`
        );
        failures.push(workspace);
      }
    }
    return failures;
  };
  const failures = await refresh();
  if (!options.watch && failures.length) {
    throw new Error(
      `Workspaces needing attention: ${failures.join(", ")}. Other workspaces were processed independently; rerun after resolving the reported issues.`
    );
  }
  if (!options.watch) {
    return;
  }
  console.log(
    "Watching templates, copied source inputs, registry files, dependency inputs and selected definitions. Dependency changes are reported, not installed by the watcher."
  );
  const controller = new AbortController();
  const stop = () => {
    controller.abort();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await watchWorkspaceInputs(
      sourceRoot,
      names,
      async () => {
        await refresh(true);
      },
      controller.signal
    );
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}
