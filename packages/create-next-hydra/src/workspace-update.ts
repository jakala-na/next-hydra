/** Ownership-aware updates. Never recursively remove workspace directories. */
/* oxlint-disable no-await-in-loop -- Ordered preflight and atomic file operations are bounded to one workspace. */
/* oxlint-disable unicorn/no-array-sort -- Only fresh arrays are sorted; this package targets ES2022. */
import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { workspaceFilePathSchema } from "./composition/schema.js";
import {
  workspaceNonSourceDirectories,
  workspaceSettingKind,
} from "./workspace-artifacts.js";
import {
  assertDirectoryPath,
  assertDistinctFileTargets,
  isEnvironmentFile,
} from "./workspace-files.js";
import {
  diffWorkspaceSnapshot,
  isWorkspaceSnapshotTarget,
  saveWorkspaceSnapshot,
} from "./workspace-snapshots.js";
import type { WorkspaceSnapshotFile } from "./workspace-snapshots.js";

export const WORKSPACE_STATE = ".workspace-composition.json";
export const WORKSPACE_LOCK = ".workspace-update.lock";
const metadata = new Set([
  WORKSPACE_STATE,
  WORKSPACE_LOCK,
  "next-hydra.json",
  "README.md",
]);
const fingerprintSchema = z.discriminatedUnion("kind", [
  z
    .object({
      hash: z.string(),
      kind: z.literal("file"),
      mode: z.number().int().min(0).max(0o777),
    })
    .strict(),
  z.object({ kind: z.literal("link"), source: z.string() }).strict(),
]);
export const workspaceOriginSchema = z
  .object({
    kind: z.enum(["source", "template", "asset"]),
    path: workspaceFilePathSchema,
  })
  .strict();
export type WorkspaceOrigin = z.infer<typeof workspaceOriginSchema>;
type Fingerprint = z.infer<typeof fingerprintSchema>;
const entrySchema = z
  .object({
    applied: fingerprintSchema,
    desired: fingerprintSchema,
    origin: workspaceOriginSchema.optional(),
    owner: z.string(),
    target: workspaceFilePathSchema,
  })
  .strict();
type Entry = z.infer<typeof entrySchema>;
const stateSchema = z
  .object({
    dependencyHash: z.string(),
    files: z.array(entrySchema),
    installedDependencies: z.string().optional(),
    snapshot: z
      .string()
      .regex(/^[a-f0-9]{40}$/u)
      .optional(),
    sourceRoot: z.string(),
    version: z.literal(2),
  })
  .strict();
type State = z.infer<typeof stateSchema>;
const stateDocumentSchema = stateSchema.extend({
  pending: stateSchema.optional(),
});
type StateDocument = z.infer<typeof stateDocumentSchema>;

export type WorkspaceFile = {
  target: string;
  owner: string;
  origin?: WorkspaceOrigin;
  content: Uint8Array;
  mode: number;
};
export type WorkspaceUpdateResult = {
  changed: number;
  removed: number;
  unowned: string[];
  conflicts: string[];
  needsInstall: boolean;
  origins: { target: string; owner: string; origin?: WorkspaceOrigin }[];
};
export type WorkspaceChanges = {
  files: {
    target: string;
    owner?: string;
    origin?: WorkspaceOrigin;
    status: "unchanged" | "modified" | "deleted" | "unregistered";
  }[];
  patch: string;
};
export const hashWorkspaceContent = (content: string | Uint8Array): string =>
  createHash("sha256").update(content).digest("hex");

/** Include edit locations without exposing file contents or relying on a saved receipt. */
export function describeWorkspaceFile(
  target: string,
  origins: { target: string; owner?: string; origin?: WorkspaceOrigin }[],
  sourceRoot: string
): string {
  const file = origins.find(
    (entry) => target === entry.target || target.startsWith(`${entry.target} (`)
  );
  if (!file?.owner) {
    return `${target}\n    No registered owner; reconcile this file into canonical source.`;
  }
  const location = file.origin
    ? `${file.origin.kind}: ${path.join(sourceRoot, file.origin.path)}`
    : "workspace baseline (derived by create-next-hydra)";
  return `${target}\n    Owner: ${file.owner}\n    Edit ${location}`;
}

function same(a: Fingerprint | undefined, b: Fingerprint | undefined): boolean {
  if (!a || !b) {
    return a === b;
  }
  if (a.kind === "link" && b.kind === "link") {
    return a.source === b.source;
  }
  return (
    a.kind === "file" &&
    b.kind === "file" &&
    a.hash === b.hash &&
    a.mode === b.mode
  );
}
const desiredFingerprint = (file: WorkspaceFile): Fingerprint => ({
  hash: hashWorkspaceContent(file.content),
  kind: "file",
  mode: file.mode,
});

async function inspect(target: string): Promise<Fingerprint | undefined> {
  await assertDirectoryPath(path.dirname(target));
  let info;
  try {
    info = await lstat(target);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  if (info.isSymbolicLink()) {
    return {
      kind: "link",
      source: path.resolve(path.dirname(target), await readlink(target)),
    };
  }
  if (!info.isFile()) {
    throw new Error(
      `Expected a file, not a directory or special file: ${target}`
    );
  }
  // Preserve executable permissions without special POSIX mode bits.
  return {
    hash: hashWorkspaceContent(await readFile(target)),
    kind: "file",
    // oxlint-disable-next-line no-bitwise -- Keep only ordinary POSIX permission bits.
    mode: info.mode & 0o777,
  };
}

async function readMetadata(
  targetRoot: string,
  name: string
): Promise<StateDocument | undefined> {
  const target = path.join(targetRoot, name);
  const current = await inspect(target);
  if (!current) {
    return undefined;
  }
  if (current.kind !== "file") {
    throw new Error(`Workspace metadata must not be symlinked: ${name}`);
  }
  const parsed = stateDocumentSchema.safeParse(
    JSON.parse(await readFile(target, "utf-8"))
  );
  if (!parsed.success) {
    throw new Error(
      `Unsupported or invalid workspace state: ${name}. Legacy receipts cannot be auto-adopted; preserve this output and initialize a named definition.`,
      { cause: parsed.error }
    );
  }
  return parsed.data;
}

/** Outputs need refresh when their canonical inputs change. */
export async function copiedWorkspaceSources(
  targetRoot: string
): Promise<string[]> {
  const state = await readMetadata(targetRoot, WORKSPACE_STATE);
  return [
    ...new Set(
      [...(state?.files ?? []), ...(state?.pending?.files ?? [])].flatMap(
        (file) =>
          file.applied.kind === "file" && file.origin ? [file.origin.path] : []
      )
    ),
  ];
}

function validateEntries(files: readonly Entry[]): void {
  assertDistinctFileTargets(files.map((file) => file.target));
  for (const { target } of files) {
    if (
      target !== path.posix.normalize(target) ||
      metadata.has(target) ||
      target
        .split("/")
        .some((part) => workspaceNonSourceDirectories.has(part)) ||
      isEnvironmentFile(path.basename(target))
    ) {
      throw new Error(
        `Composition cannot own protected workspace path: ${target}`
      );
    }
  }
}

async function inventory(
  targetRoot: string,
  preservedFiles: ReadonlySet<string>,
  relative = ""
): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(path.join(targetRoot, relative), {
    withFileTypes: true,
  })) {
    const target = path.posix.join(relative, entry.name);
    // Workflow's Next plugin materializes these routes, not the workspace registry.
    if (/^apps\/[^/]+\/app\/\.well-known\/workflow\/v1$/u.test(target)) {
      continue;
    }
    if (workspaceNonSourceDirectories.has(entry.name)) {
      await assertDirectoryPath(path.join(targetRoot, target));
      continue;
    }
    if (
      isEnvironmentFile(entry.name) ||
      entry.name.endsWith(".tsbuildinfo") ||
      ["next-env.d.ts", "next.config.compiled.js"].includes(entry.name)
    ) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...(await inventory(targetRoot, preservedFiles, target)));
    } else if (!metadata.has(target) && !preservedFiles.has(target)) {
      files.push(target);
    }
  }
  return files;
}

/** Inspect the saved composition snapshot without rendering or adopting local edits. */
export async function inspectWorkspaceChanges(
  sourceRoot: string,
  targetRoot: string
): Promise<WorkspaceChanges> {
  await assertDirectoryPath(targetRoot);
  const state = await readMetadata(targetRoot, WORKSPACE_STATE);
  if (!state?.snapshot) {
    throw new Error(
      "No composition snapshot exists. Run compose <name> first; existing local edits will not be adopted automatically."
    );
  }
  if (state.pending) {
    throw new Error(
      "Workspace refresh was interrupted. Reconcile and retry composition before inspecting its composition snapshot."
    );
  }
  if (path.resolve(state.sourceRoot) !== path.resolve(sourceRoot)) {
    throw new Error("Workspace state belongs to a different source checkout.");
  }
  validateEntries(state.files);
  const owned = new Map(
    state.files
      .filter((file) => isWorkspaceSnapshotTarget(file.target))
      .map((file) => [file.target, file])
  );
  // Do not let Git read tracked files through redirected parent directories.
  for (const target of owned.keys()) {
    await assertDirectoryPath(path.dirname(path.join(targetRoot, target)));
  }
  const currentFiles = await inventory(targetRoot, new Set());
  const present = currentFiles.filter(
    (target) =>
      isWorkspaceSnapshotTarget(target) && !workspaceSettingKind(target)
  );
  const { changes, patch } = await diffWorkspaceSnapshot({
    commit: state.snapshot,
    sourceRoot,
    targetRoot,
  });
  const targets = [
    ...new Set([...owned.keys(), ...present, ...changes.keys()]),
  ].sort();
  return {
    files: targets.map((target) => {
      const file = owned.get(target);
      const change = changes.get(target);
      let status: WorkspaceChanges["files"][number]["status"] = "unchanged";
      if (change === "D") {
        status = "deleted";
      } else if (change) {
        status = "modified";
      } else if (!file) {
        status = "unregistered";
      }
      return { origin: file?.origin, owner: file?.owner, status, target };
    }),
    patch,
  };
}

async function snapshotWorkspace(
  sourceRoot: string,
  targetRoot: string,
  state: State
): Promise<string> {
  const files: WorkspaceSnapshotFile[] = [];
  for (const file of state.files) {
    if (!isWorkspaceSnapshotTarget(file.target)) {
      continue;
    }
    const current = await inspect(path.join(targetRoot, file.target));
    if (current?.kind !== "file" || !same(current, file.applied)) {
      throw new Error(
        `File changed before its composition snapshot was saved: ${file.target}. No new composition snapshot was published.`
      );
    }
    const content = await readFile(path.join(targetRoot, file.target));
    if (hashWorkspaceContent(content) !== current.hash) {
      throw new Error(
        `File changed while preparing its composition snapshot: ${file.target}. No new composition snapshot was published.`
      );
    }
    files.push({ content, mode: current.mode, target: file.target });
  }
  return await saveWorkspaceSnapshot({
    files,
    previous: state.snapshot,
    sourceRoot,
    targetRoot,
  });
}

async function atomicWrite(target: string, file: WorkspaceFile): Promise<void> {
  await assertDirectoryPath(path.dirname(target));
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, file.content, { flag: "wx", mode: file.mode });
    await chmod(temporary, file.mode);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function writeMetadata(
  targetRoot: string,
  name: string,
  value: StateDocument
): Promise<void> {
  await atomicWrite(path.join(targetRoot, name), {
    content: Buffer.from(`${JSON.stringify(value, null, 2)}\n`),
    mode: 0o600,
    owner: "workspace state",
    target: name,
  });
}

/** Recover only exact before/after fingerprints from an interrupted atomic-file update. */
async function readState(
  targetRoot: string,
  sourceRoot: string,
  preservedFiles: ReadonlySet<string>
): Promise<State> {
  const raw = await readMetadata(targetRoot, WORKSPACE_STATE);
  const empty: State = {
    dependencyHash: "",
    files: [],
    sourceRoot,
    version: 2,
  };
  const { pending, ...state } =
    raw === undefined
      ? { ...empty, pending: undefined }
      : stateDocumentSchema.parse(raw);
  validateEntries(state.files);
  if (pending === undefined) {
    return {
      ...state,
      files: state.files.filter((file) => !preservedFiles.has(file.target)),
    };
  }
  validateEntries(pending.files);
  const before = new Map(state.files.map((entry) => [entry.target, entry]));
  const after = new Map(pending.files.map((entry) => [entry.target, entry]));
  const recovered: Entry[] = [];
  for (const target of new Set([...before.keys(), ...after.keys()])) {
    if (preservedFiles.has(target)) {
      continue;
    }
    const current = await inspect(path.join(targetRoot, target));
    const previous = before.get(target);
    const next = after.get(target);
    if (same(current, next?.applied)) {
      if (next) {
        recovered.push(next);
      }
    } else if (same(current, previous?.applied)) {
      if (previous) {
        recovered.push(previous);
      }
    } else {
      throw new Error(
        `Local change after an interrupted update: ${target}. Preserve and reconcile it before retrying.`
      );
    }
  }
  return { ...state, files: recovered, installedDependencies: undefined };
}

async function inspectPreservedSettings(
  targetRoot: string,
  preservedFiles: ReadonlySet<string>,
  files: readonly WorkspaceFile[]
): Promise<Map<string, Fingerprint>> {
  const settings = new Map<string, Fingerprint>();
  for (const target of preservedFiles) {
    workspaceFilePathSchema.parse(target);
    const setting = workspaceSettingKind(target);
    if (!setting) {
      throw new Error(`Not a workspace setting: ${target}`);
    }
    const current = await inspect(path.join(targetRoot, target));
    if (
      (target === ".gitignore" || setting === "tasks") &&
      current?.kind !== "file"
    ) {
      throw new Error(`Workspace settings must be regular files: ${target}`);
    }
    if (!current) {
      throw new Error(`Workspace settings must be regular files: ${target}`);
    }
    settings.set(target, current);
  }
  for (const { target } of files) {
    if (preservedFiles.has(target)) {
      throw new Error(
        `Composition cannot overwrite workspace-owned settings: ${target}`
      );
    }
  }
  return settings;
}

/** Detach only unchanged, previously owned links; never follow an unowned settings link. */
async function prepareSettingsMigration(
  settings: ReadonlyMap<string, Fingerprint>,
  previous: State,
  sourceRoot: string
): Promise<WorkspaceFile[]> {
  const files: WorkspaceFile[] = [];
  for (const [target, current] of settings) {
    if (current.kind !== "link") {
      continue;
    }
    const owned = previous.files.find((file) => file.target === target);
    if (!same(current, owned?.applied)) {
      throw new Error(
        `Cannot replace unowned or redirected workspace settings: ${target}`
      );
    }
    workspaceFilePathSchema.parse(path.relative(sourceRoot, current.source));
    const source = await inspect(current.source);
    if (source?.kind !== "file") {
      throw new Error(
        `Workspace settings source must be a regular file: ${target}`
      );
    }
    files.push({
      content: await readFile(current.source),
      mode: source.mode,
      owner: "workspace settings",
      target,
    });
  }
  return files;
}

/** The caller holds the workspace lock. Preparation and preflight do not change app/source files. */
export async function updateWorkspaceFiles(options: {
  sourceRoot: string;
  targetRoot: string;
  files: WorkspaceFile[];
  dependencyHash: string;
  dependencyDirectories?: string[];
  check?: boolean;
  rejectUnowned?: boolean;
  preservedFiles?: readonly string[];
  install?: (cwd: string) => Promise<void>;
  snapshot?: boolean;
}): Promise<WorkspaceUpdateResult> {
  const { targetRoot, sourceRoot } = options;
  const preservedFiles = new Set(options.preservedFiles);
  const settings = await inspectPreservedSettings(
    targetRoot,
    preservedFiles,
    options.files
  );
  await assertDirectoryPath(targetRoot);
  // Physical settings are already workspace-owned; links still need their recorded ownership.
  const physicalSettings = new Set(
    [...settings]
      .filter(([, value]) => value.kind === "file")
      .map(([target]) => target)
  );
  const previous = await readState(targetRoot, sourceRoot, physicalSettings);
  const files = [
    ...options.files,
    ...(await prepareSettingsMigration(settings, previous, sourceRoot)),
  ];
  const desired = new Map(files.map((file) => [file.target, file]));
  const entries = files.map(
    (file): Entry => ({
      applied: desiredFingerprint(file),
      desired: desiredFingerprint(file),
      origin: file.origin,
      owner: file.owner,
      target: file.target,
    })
  );
  validateEntries(entries);
  const prior = new Map(previous.files.map((file) => [file.target, file]));
  const next: State = {
    dependencyHash: options.dependencyHash,
    files: [],
    installedDependencies: previous.installedDependencies,
    snapshot: options.snapshot ? previous.snapshot : undefined,
    sourceRoot,
    version: 2,
  };
  const writes: WorkspaceFile[] = [];
  const removals: string[] = [];
  const conflicts: string[] = [];
  const observed = new Map<string, Fingerprint | undefined>();
  for (const file of entries) {
    const old = prior.get(file.target);
    const current = await inspect(path.join(targetRoot, file.target));
    observed.set(file.target, current);
    // The lockfile may be normalized by pnpm. Compare its input and applied fingerprints separately.
    const unchanged = old && same(old.desired, file.desired);
    const applied = unchanged ? old.applied : file.desired;
    next.files.push({ ...file, applied });
    if (old && !same(current, old.applied) && !same(current, applied)) {
      conflicts.push(`${file.target} (locally modified or deleted)`);
    } else if (!old && current) {
      conflicts.push(`${file.target} (unowned existing file)`);
    } else if (!same(current, applied)) {
      const planned = desired.get(file.target);
      if (planned) {
        writes.push(planned);
      }
    }
  }
  for (const old of previous.files) {
    if (desired.has(old.target)) {
      continue;
    }
    const current = await inspect(path.join(targetRoot, old.target));
    observed.set(old.target, current);
    if (current && !same(current, old.applied)) {
      conflicts.push(`${old.target} (locally modified; would be removed)`);
    } else if (current) {
      removals.push(old.target);
    }
  }
  const presentFiles = await inventory(targetRoot, preservedFiles);
  const unowned = presentFiles
    .filter((target) => !prior.has(target) && !desired.has(target))
    .sort();
  let dependenciesPresent = true;
  for (const directory of options.dependencyDirectories ?? ["."]) {
    if (directory !== ".") {
      workspaceFilePathSchema.parse(directory);
    }
    // Package-level dependencies also matter. Never install through a redirected directory.
    const present = await assertDirectoryPath(
      path.join(targetRoot, directory, "node_modules")
    );
    dependenciesPresent &&= present;
  }
  const needsInstall =
    previous.installedDependencies !== options.dependencyHash ||
    !dependenciesPresent;
  const result = {
    changed: writes.length,
    conflicts,
    needsInstall,
    origins: [
      ...new Map(
        [...previous.files, ...entries].map((entry) => [
          entry.target,
          {
            origin: entry.origin,
            owner: entry.owner,
            target: entry.target,
          },
        ])
      ).values(),
    ],
    removed: removals.length,
    unowned,
  };
  if (options.check) {
    return result;
  }
  if (options.rejectUnowned && unowned.length) {
    throw new Error(
      `Workspace refresh blocked by unregistered files; nothing was replaced:\n${unowned.join("\n")}`
    );
  }
  if (conflicts.length) {
    throw new Error(
      `Workspace refresh blocked; no application files changed:\n${conflicts.map((item) => `  ${describeWorkspaceFile(item, result.origins, sourceRoot)}`).join("\n")}\nMove intended changes into canonical source/templates or preserve them separately, then reconcile these paths. No force overwrite is supported.`
    );
  }
  // One atomic state document contains both sides, including after recovery from an interrupted update.
  await writeMetadata(targetRoot, WORKSPACE_STATE, {
    ...previous,
    pending: next,
  });
  for (const target of [...removals, ...writes.map((file) => file.target)]) {
    if (
      !same(await inspect(path.join(targetRoot, target)), observed.get(target))
    ) {
      throw new Error(
        `File changed during refresh: ${target}. Update stopped; retry after reconciling local edits.`
      );
    }
    const file = desired.get(target);
    await (file
      ? atomicWrite(path.join(targetRoot, target), file)
      : unlink(path.join(targetRoot, target)));
  }
  // Pending state above includes detachment writes for interruption recovery. Release them only after writing.
  next.files = next.files.filter((file) => !preservedFiles.has(file.target));
  await writeMetadata(targetRoot, WORKSPACE_STATE, next);
  if (needsInstall && options.install) {
    // Installation owns lockfile normalization; a failed install is safely retryable.
    next.installedDependencies = undefined;
    await writeMetadata(targetRoot, WORKSPACE_STATE, next);
    let installError: Error | undefined;
    try {
      await options.install(targetRoot);
      next.installedDependencies = options.dependencyHash;
      result.needsInstall = false;
    } catch (error) {
      installError =
        error instanceof Error
          ? error
          : new Error("Dependency installation failed.", { cause: error });
    }
    try {
      const lock = next.files.find(
        (entry) => entry.target === "pnpm-lock.yaml"
      );
      if (lock) {
        const current = await inspect(path.join(targetRoot, lock.target));
        if (current?.kind !== "file") {
          throw new Error(
            "Dependency installation removed or replaced the workspace lockfile with a link."
          );
        }
        lock.applied = current;
      }
      await writeMetadata(targetRoot, WORKSPACE_STATE, next);
    } catch (error) {
      if (installError) {
        // oxlint-disable-next-line preserve-caught-error -- AggregateError preserves both failures and accepts cause in its third argument.
        throw new AggregateError(
          [installError, error],
          "Dependency installation failed and its resulting state needs inspection.",
          { cause: error }
        );
      }
      throw error;
    }
    if (installError) {
      throw installError;
    }
  }
  if (options.snapshot) {
    next.snapshot = await snapshotWorkspace(sourceRoot, targetRoot, next);
    await writeMetadata(targetRoot, WORKSPACE_STATE, next);
  }
  return result;
}
