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
} from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { composeWorkspace } from "./compose.js";
import { parsePackageJson } from "./composition/packages.js";
import { resolveWorkspacePath } from "./composition/paths.js";
import {
  workspaceSelectionSchema,
  workspaceFilePathSchema,
} from "./composition/schema.js";
import { runCommand } from "./git.js";
import {
  copyMaintainerEnvironmentFiles,
  findMaintainerWorkspaceRoot,
  seedWorkspaceEnvironmentFile,
} from "./maintainer-workspace.js";
import {
  workspaceCacheDirectories,
  workspaceTaskFiles,
} from "./workspace-artifacts.js";
import {
  assertDirectoryPath,
  isEnvironmentFile,
  workspaceSourceFiles,
} from "./workspace-files.js";
import {
  hashWorkspaceContent,
  describeWorkspaceFile,
  copiedWorkspaceSources,
  workspaceOriginSchema,
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
  link?: boolean;
  all?: boolean;
  check?: boolean;
  watch?: boolean;
  copyEnv?: boolean;
  install?: boolean;
  offline?: boolean;
  explain?: string;
  run?: "dev" | "build" | "test" | "typecheck";
};
const definitionName = "next-hydra.json";
const sourceReceiptSchema = z.object({
  environmentDefaults: z.array(workspaceFilePathSchema).default([]),
  files: z.array(
    z.object({
      mode: z.enum(["linked", "copied"]),
      origin: workspaceOriginSchema.optional(),
      owner: z.string(),
      source: z.string().optional(),
      target: z.string(),
    })
  ),
});

export async function discoverDevelopmentWorkspaces(
  sourceRoot: string
): Promise<string[]> {
  const root = path.join(sourceRoot, "workspaces");
  if (!(await assertDirectoryPath(root))) {
    return [];
  }
  // Git-visible definitions include newly authored files, but exclude ignored legacy scratch output.
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

/** Use the actual scaffold and renderer, without installing or touching the destination. */
async function prepareWorkspaceFiles(
  sourceRoot: string,
  name: string,
  definition: Definition,
  linked = true
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
        linked,
        port: linked ? definition.development?.port : undefined,
      },
      { name, report: () => undefined, sourceRoot }
    );
    const receipt = linked
      ? sourceReceiptSchema.parse(
          JSON.parse(
            await readFile(path.join(outputRoot, WORKSPACE_STATE), "utf-8")
          )
        )
      : {
          environmentDefaults: created.origins
            .filter((file) =>
              isEnvironmentFile(path.posix.basename(file.target))
            )
            .map((file) => file.target),
          files: created.origins
            .filter(
              (file) => !isEnvironmentFile(path.posix.basename(file.target))
            )
            .map((file) => ({
              ...file,
              mode: "copied" as const,
              source: undefined,
            })),
        };
    const files: WorkspaceFile[] = [];
    const dependencyInputs: Record<string, string> = {};
    const dependencyDirectories: string[] = [];
    for (const entry of receipt.files) {
      if (/^apps\/[^/]+\/vercel\.json$/u.test(entry.target)) {
        // Customer defaults belong to the registry; named deployments use their own settings.
        continue;
      }
      if (
        entry.target === ".gitignore" ||
        /^apps\/[^/]+\/\.gitignore$/u.test(entry.target)
      ) {
        files.push({
          content: Buffer.from(
            entry.target === ".gitignore"
              ? "/*\n!/next-hydra.json\n!/README.md\n!/tasks/\n/tasks/*\n!/tasks/package.json\n!/tasks/turbo.json\n!/apps/\n/apps/*\n!/apps/*/\n/apps/*/*\n!/apps/*/vercel.json\n"
              : "/*\n!/vercel.json\n"
          ),
          mode: 0o644,
          owner: "named workspace Git visibility",
          target: entry.target,
        });
        continue;
      }
      if (entry.mode === "linked") {
        if (!entry.source) {
          throw new Error(`Missing link source for ${entry.target}`);
        }
        files.push({
          origin: entry.origin,
          owner: entry.owner,
          source: path.join(sourceRoot, entry.source),
          target: entry.target,
        });
      } else {
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
      receipt.environmentDefaults.map(async (target) => ({
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
        throw new Error("Cannot compose over a customer Git repository.");
      }
      if (
        workspaceTaskFiles.has(target) ||
        /^apps\/[^/]+\/vercel\.json$/u.test(target)
      ) {
        if (workspaceTaskFiles.has(target) && !entry.isFile()) {
          throw new Error(
            `Workspace task settings must be regular files: ${target}`
          );
        }
        // Previously owned links are validated and detached by the update engine.
        if (!entry.isFile() && !(initialized && entry.isSymbolicLink())) {
          throw new Error(
            `Workspace deployment settings must be regular files: ${target}`
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
          `Cannot initialize an existing unowned workspace containing ${target}. Only its definition, README, app vercel.json files, task metadata and restored caches may precede initialization. Nothing was replaced.`
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
  if (options.link === false && options.copyEnv) {
    throw new Error(
      "--copy-env is for linked development; copied workspaces use their own environment."
    );
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(name)) {
    throw new Error(
      "Use a workspace name of 1–63 lowercase letters, numbers or hyphens, starting and ending with a letter or number, not a path. It also names the local host."
    );
  }
  const targetRoot = path.join(sourceRoot, "workspaces", name);
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
    const prepared = await prepareWorkspaceFiles(
      sourceRoot,
      name,
      definition,
      options.link !== false
    );
    for (const target of preservedFiles) {
      if (workspaceTaskFiles.has(target)) {
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
      rejectUnowned: options.link === false,
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
  target: string,
  link = true
): Promise<string> {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(name)) {
    throw new Error("Explain requires a valid named workspace, not a path.");
  }
  const normalized = resolveWorkspacePath(target, "workspace file to explain");
  const definition = await readDefinition(
    path.join(sourceRoot, "workspaces", name)
  );
  if (/^apps\/[^/]+\/vercel\.json$/u.test(normalized)) {
    return `${name}: ${normalized} is workspace-owned deployment configuration, not registry output. Edit and commit it in this workspace.`;
  }
  if (workspaceTaskFiles.has(normalized)) {
    return `${name}: ${normalized} is derived Turbo task metadata, not application output. Run pnpm workspace:sync from the source checkout and commit the result.`;
  }
  const prepared = await prepareWorkspaceFiles(
    sourceRoot,
    name,
    definition,
    link
  );
  const file = prepared.files.find((entry) => entry.target === normalized);
  if (!file) {
    return `${name}: ${normalized} is not selected by this definition. If locally authored, reconcile it into canonical source and registry ownership.`;
  }
  return `${name}: ${describeWorkspaceFile(normalized, prepared.files, sourceRoot)}\n    ${"source" in file ? "Source-linked: edits change canonical source immediately." : "Physical output: edit the source/template, then refresh this workspace."}`;
}

async function watchWorkspaceInputs(
  sourceRoot: string,
  names: string[],
  refresh: () => Promise<void>
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
      process.off("SIGINT", stop);
      // oxlint-disable-next-line no-use-before-define -- Paired lifetime callbacks reference each other but run only after setup.
      process.off("SIGTERM", stop);
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
      const sourceFiles = await workspaceSourceFiles(sourceRoot);
      const watchedFiles = new Set(
        sourceFiles
          .filter(
            (file) =>
              file.includes("/registry/") ||
              /(?:^|\/)(?:registry\.json|package\.json|pnpm-workspace\.yaml|pnpm-lock\.yaml)$/u.test(
                file
              )
          )
          .map((file) => path.join(sourceRoot, file))
      );
      for (const name of names) {
        watchedFiles.add(
          path.join(sourceRoot, "workspaces", name, definitionName)
        );
        for (const source of await copiedWorkspaceSources(
          path.join(sourceRoot, "workspaces", name)
        )) {
          watchedFiles.add(path.join(sourceRoot, source));
        }
      }
      const directories = new Map<string, boolean>();
      for (const file of watchedFiles) {
        const index = file.indexOf("/registry/");
        // Watch authoring trees recursively, never dependency trees or materialized workspaces.
        directories.set(
          index === -1
            ? path.dirname(file)
            : file.slice(0, index + "/registry".length),
          index !== -1
        );
      }
      if (stopped) {
        return;
      }
      for (const watcher of watchers.values()) {
        watcher.close();
      }
      watchers.clear();
      for (const [directory, recursive] of directories) {
        // oxlint-disable-next-line no-loop-func -- Each callback captures block-scoped paths; the shared dirty flag deliberately coalesces events.
        const watcher = watch(directory, { recursive }, (_event, filename) => {
          if (
            recursive ||
            (filename && watchedFiles.has(path.join(directory, filename)))
          ) {
            dirty = true;
          }
        });
        watcher.on("error", fail);
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
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
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
  if (options.explain && (options.check || options.watch || options.copyEnv)) {
    throw new Error(
      "--explain is read-only and cannot be combined with --check, --watch or --copy-env."
    );
  }
  if (options.run && (options.check || options.watch || options.explain)) {
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
  if (options.explain) {
    for (const workspace of names) {
      console.log(
        await explainDevelopmentWorkspace(
          sourceRoot,
          workspace,
          options.explain,
          options.link !== false
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
    "Watching templates, copied source inputs, registry files, dependency inputs and selected definitions. Ordinary linked source edits are already live. Dependency changes are reported, not installed by the watcher."
  );
  await watchWorkspaceInputs(sourceRoot, names, async () => {
    await refresh(true);
  });
}
