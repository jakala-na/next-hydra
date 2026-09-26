import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { Context, Effect, FileSystem, Layer, Path, Redacted } from "effect";
import type { PlatformError } from "effect";

import {
  MaterializationFailed,
  WorkspaceConflict,
  WorkspaceRecoveryRequired,
} from "./errors.ts";
import { writeFile } from "./files.ts";
import type { FileChange, PreparedFile, PreparedWorkspace } from "./model.ts";
import { snapshotTarget } from "./workspace-snapshots.ts";
import { sameFingerprint as same } from "./workspace-state.ts";
import type {
  FileIntent,
  Fingerprint,
  WorkspaceWriteAccess,
  WorkspaceStateError,
  WorkspaceObservation,
} from "./workspace-state.ts";

const fingerprint = (content: Uint8Array, mode: number): Fingerprint => ({
  hash: createHash("sha256").update(content).digest("hex"),
  mode,
});

function compareFile(
  previous: WorkspaceObservation["entries"][number] | undefined,
  wanted: PreparedFile | undefined,
  before: Fingerprint | null
) {
  const desired = wanted ? fingerprint(wanted.content, wanted.mode) : null;
  const after =
    previous &&
    same(desired, previous.desired) &&
    same(before, previous.applied)
      ? previous.applied
      : desired;
  const conflict = previous
    ? !same(before, previous.applied) && !same(before, after)
    : before !== null;
  return { after, conflict, desired };
}

export type WorkspaceFileError =
  | WorkspaceConflict
  | MaterializationFailed
  | PlatformError.PlatformError;
export class WorkspaceFiles extends Context.Service<
  WorkspaceFiles,
  {
    readonly recover: (
      access: WorkspaceWriteAccess
    ) => Effect.Effect<void, WorkspaceFileError | WorkspaceStateError>;
    readonly capture: (
      directory: string,
      entries: WorkspaceObservation["entries"]
    ) => Effect.Effect<readonly PreparedFile[], WorkspaceFileError>;
    readonly read: (
      directory: string,
      targets: readonly string[]
    ) => Effect.Effect<
      {
        readonly files: readonly PreparedFile[];
        readonly conflicts: readonly string[];
      },
      WorkspaceFileError
    >;
    readonly inspect: (
      observation: WorkspaceObservation,
      files: PreparedWorkspace["files"]
    ) => Effect.Effect<readonly FileChange[], WorkspaceFileError>;
    readonly apply: (
      access: WorkspaceWriteAccess,
      files: PreparedWorkspace["files"],
      initialization: readonly string[]
    ) => Effect.Effect<
      {
        readonly removedFiles: readonly string[];
        readonly complete: Effect.Effect<
          void,
          WorkspaceFileError | WorkspaceStateError
        >;
      },
      WorkspaceFileError | WorkspaceStateError
    >;
  }
>()("create-next-hydra/WorkspaceFiles") {
  static readonly layer = Layer.effect(
    WorkspaceFiles,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const observe = (directory: string, target: string) =>
        Effect.gen(function* () {
          const absolute = path.join(directory, target);
          if (!(yield* fs.exists(absolute))) {
            return null;
          }
          const stat = yield* fs.stat(absolute);
          if (stat.type !== "File") {
            return yield* new WorkspaceConflict({ paths: [target] });
          }
          return fingerprint(yield* fs.readFile(absolute), stat.mode % 0o1000);
        }).pipe(Effect.uninterruptible);
      const blockingAncestor = (
        directory: string,
        target: string,
        targets: ReadonlySet<string>
      ) =>
        Effect.gen(function* () {
          const parts = target.split("/");
          for (let end = 1; end < parts.length; end += 1) {
            const ancestor = parts.slice(0, end).join("/");
            if (
              targets.has(ancestor) ||
              ((yield* fs.exists(path.join(directory, ancestor))) &&
                (yield* fs.stat(path.join(directory, ancestor))).type !==
                  "Directory")
            ) {
              return ancestor;
            }
          }
          return null;
        });
      const read = Effect.fn("WorkspaceFiles.read")(function* (
        directory: string,
        targets: readonly string[]
      ) {
        const files: PreparedFile[] = [];
        const conflicts = new Set<string>();
        for (const target of targets.filter(snapshotTarget)) {
          const ancestor = yield* blockingAncestor(
            directory,
            target,
            new Set()
          );
          if (ancestor !== null) {
            conflicts.add(ancestor);
            continue;
          }
          const absolute = path.join(directory, target);
          if (!(yield* fs.exists(absolute))) {
            continue;
          }
          const stat = yield* fs.stat(absolute);
          if (stat.type !== "File") {
            conflicts.add(target);
            continue;
          }
          files.push({
            content: yield* fs.readFile(absolute),
            mode: stat.mode % 0o1000,
            target,
          });
        }
        return { conflicts: [...conflicts], files };
      });
      const capture = Effect.fn("WorkspaceFiles.capture")(function* (
        directory: string,
        entries: WorkspaceObservation["entries"]
      ) {
        const { files, conflicts } = yield* read(
          directory,
          entries.map((entry) => entry.target)
        );
        const observed = new Map(
          files.map((file) => [
            file.target,
            fingerprint(file.content, file.mode),
          ])
        );
        const changed = entries
          .filter(
            (entry) =>
              snapshotTarget(entry.target) &&
              !same(entry.applied, observed.get(entry.target) ?? null)
          )
          .map((entry) => entry.target);
        if (conflicts.length || changed.length) {
          return yield* new WorkspaceConflict({
            paths: [...new Set([...conflicts, ...changed])],
          });
        }
        return files;
      });
      const inspect = Effect.fn("WorkspaceFiles.inspect")(function* (
        observation: WorkspaceObservation,
        files: PreparedWorkspace["files"]
      ) {
        const desired = new Map(files.map((file) => [file.target, file]));
        const applied = new Map(
          observation.entries.map((entry) => [entry.target, entry])
        );
        const changes = new Map<string, FileChange>();
        const targets = new Set([...applied.keys(), ...desired.keys()]);
        for (const target of targets) {
          if (changes.get(target)?.kind === "conflict") {
            continue;
          }
          const ancestor = yield* blockingAncestor(
            observation.directory,
            target,
            targets
          );
          if (ancestor !== null) {
            changes.set(ancestor, { kind: "conflict", target: ancestor });
            continue;
          }
          const before = yield* observe(observation.directory, target).pipe(
            Effect.catchTag("WorkspaceConflict", () => Effect.void)
          );
          if (before === undefined) {
            changes.set(target, { kind: "conflict", target });
            continue;
          }
          const previous = applied.get(target);
          const {
            after,
            conflict,
            desired: wanted,
          } = compareFile(previous, desired.get(target), before);
          if (conflict) {
            changes.set(target, {
              kind: previous ? "conflict" : "unregistered",
              target,
            });
          } else if (!same(before, after)) {
            let kind: FileChange["kind"] = "update";
            if (after === null) {
              kind = "remove";
            } else if (before === null) {
              kind = "create";
            }
            changes.set(target, { kind, target });
          } else if (
            previous
              ? !same(previous.desired, wanted) ||
                !same(previous.applied, after) ||
                !isDeepStrictEqual(previous.origin, desired.get(target)?.origin)
              : wanted !== null
          ) {
            changes.set(target, { kind: "record", target });
          }
        }
        return [...changes.values()];
      });
      const recover = Effect.fn("WorkspaceFiles.recover")(function* (
        access: WorkspaceWriteAccess
      ) {
        const observation = yield* access.observation;
        const { pending } = observation;
        if (pending === null) {
          return;
        }
        if (pending.kind !== "files") {
          return yield* new WorkspaceRecoveryRequired({
            directory: access.directory,
          });
        }
        // Initial-only files become workspace-owned after creation. Never read or
        // fingerprint credentials, or mistake an existing partial write for success.
        for (const file of pending.initialization) {
          const ancestor = yield* blockingAncestor(
            access.directory,
            file.target,
            new Set()
          );
          if (ancestor !== null) {
            return yield* new WorkspaceConflict({ paths: [ancestor] });
          }
          const absolute = path.join(access.directory, file.target);
          if (!(yield* fs.exists(absolute))) {
            continue;
          }
          if (file.status === "started") {
            return yield* new WorkspaceRecoveryRequired({
              directory: access.directory,
              paths: [file.target],
            });
          }
          if ((yield* fs.stat(absolute)).type !== "File") {
            return yield* new WorkspaceConflict({ paths: [file.target] });
          }
        }
        const observed = new Map<string, Fingerprint | null>();
        const temporary = new Map<string, Fingerprint>();
        const conflicts: string[] = [];
        for (const file of pending.files) {
          const ancestor = yield* blockingAncestor(
            access.directory,
            file.target,
            new Set()
          );
          if (ancestor !== null) {
            conflicts.push(ancestor);
            continue;
          }
          const current = yield* observe(access.directory, file.target);
          observed.set(file.target, current);
          if (!same(current, file.before) && !same(current, file.after)) {
            conflicts.push(file.target);
          }
          if (file.temporary !== null) {
            const saved = yield* observe(access.directory, file.temporary);
            if (saved !== null) {
              if (same(saved, file.after)) {
                temporary.set(file.temporary, saved);
              } else {
                conflicts.push(file.temporary);
              }
            }
          }
        }
        if (conflicts.length > 0) {
          return yield* new WorkspaceConflict({
            paths: [...new Set(conflicts)],
          });
        }
        // No cleanup until every owned path and retained replacement is explained.
        // A retry can repeat this after cleanup fails; the receipt still has intent.
        for (const [target, expected] of temporary) {
          yield* Effect.gen(function* () {
            if (!same(yield* observe(access.directory, target), expected)) {
              return yield* new WorkspaceConflict({ paths: [target] });
            }
            yield* fs.remove(path.join(access.directory, target));
          }).pipe(Effect.uninterruptible);
        }
        for (const [target, expected] of observed) {
          if (!same(yield* observe(access.directory, target), expected)) {
            return yield* new WorkspaceConflict({ paths: [target] });
          }
        }
        yield* access.recoverFiles(observed, observation.revision);
      });
      const apply = Effect.fn("WorkspaceFiles.apply")(function* (
        access: WorkspaceWriteAccess,
        files: PreparedWorkspace["files"],
        initialization: readonly string[]
      ) {
        const desired = new Map(files.map((file) => [file.target, file]));
        const applied = new Map(
          (yield* access.appliedEntries).map((entry) => [entry.target, entry])
        );
        const targets = new Set([...applied.keys(), ...desired.keys()]);
        const operation = yield* Effect.sync(randomUUID);
        const intent: FileIntent[] = [];
        const conflicts: string[] = [];
        for (const target of targets) {
          // File-to-directory transitions require a separate, explicitly designed
          // operation. Never remove parents recursively during ordinary refresh.
          const ancestor = yield* blockingAncestor(
            access.directory,
            target,
            targets
          );
          if (ancestor !== null) {
            return yield* new WorkspaceConflict({ paths: [ancestor, target] });
          }
          const before = yield* observe(access.directory, target);
          const wanted = desired.get(target);
          const previous = applied.get(target);
          const {
            after,
            conflict,
            desired: desiredFingerprint,
          } = compareFile(previous, wanted, before);
          if (conflict) {
            conflicts.push(target);
          }
          const temporary =
            before !== null && after !== null && !same(before, after)
              ? `${target}.${operation}.pending`
              : null;
          if (
            temporary !== null &&
            (targets.has(temporary) ||
              (yield* fs.exists(path.join(access.directory, temporary))))
          ) {
            conflicts.push(temporary);
          }
          intent.push({
            after,
            before,
            desired: desiredFingerprint,
            origin: wanted?.origin ?? null,
            target,
            temporary,
          });
        }
        if (conflicts.length) {
          return yield* new WorkspaceConflict({ paths: conflicts });
        }
        // The entire before/after set, including unchanged files, is durable before
        // the first application write. A failure leaves that intent for inspection.
        yield* access.begin(intent, initialization);
        const completedFiles: string[] = [];
        const removedFiles: string[] = [];
        for (const item of intent) {
          if (same(item.before, item.after)) {
            continue;
          }
          yield* Effect.gen(function* () {
            const file = desired.get(item.target);
            if (file && item.temporary) {
              yield* writeFile(
                access.directory,
                { ...file, target: item.temporary },
                true
              );
            }
            if (
              !same(yield* observe(access.directory, item.target), item.before)
            ) {
              return yield* new WorkspaceConflict({ paths: [item.target] });
            }
            if (!file) {
              yield* fs.remove(path.join(access.directory, item.target));
              removedFiles.push(item.target);
            } else if (item.temporary) {
              yield* fs.rename(
                path.join(access.directory, item.temporary),
                path.join(access.directory, item.target)
              );
            } else {
              // Exclusive creation can leave a partial file on an I/O failure;
              // the pending receipt prevents a retry from adopting it as complete.
              yield* writeFile(access.directory, file, true);
            }
            completedFiles.push(item.target);
          }).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
            Effect.uninterruptible,
            Effect.mapError(
              (error) =>
                new MaterializationFailed({
                  completedFiles: [...completedFiles],
                  diagnostic: Redacted.make(error),
                  directory: access.directory,
                  failedFile: item.target,
                })
            )
          );
        }
        const complete = Effect.gen(function* () {
          const changed: string[] = [];
          for (const item of intent) {
            if (
              !same(yield* observe(access.directory, item.target), item.after)
            ) {
              changed.push(item.target);
            }
          }
          if (changed.length) {
            return yield* new WorkspaceConflict({ paths: changed });
          }
          yield* access.complete;
        });
        return { complete, removedFiles };
      });
      return WorkspaceFiles.of({ apply, capture, inspect, read, recover });
    })
  );
}
