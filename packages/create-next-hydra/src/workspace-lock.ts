import { createHash, randomUUID } from "node:crypto";

import {
  Array as EffectArray,
  DateTime,
  Effect,
  FileSystem,
  Order,
  Path,
  Ref,
  Schema,
} from "effect";
import type { PlatformError } from "effect";

import {
  WorkspaceLockAuthorizationRequired,
  WorkspaceLockChanged,
  WorkspaceRecoveryRequired,
  WorkspaceStateInvalid,
} from "./errors.ts";

const LockOwner = Schema.fromJsonString(
  Schema.Struct({
    operation: Schema.Literal("sync"),
    pid: Schema.Int,
    startedAt: Schema.String,
    token: Schema.String,
  })
);
const LockObservation = Schema.fromJsonString(
  Schema.Struct({
    candidate: Schema.NullOr(Schema.String),
    directory: Schema.String,
    names: Schema.Array(Schema.String),
    ownerText: Schema.NullOr(Schema.String),
    stored: Schema.NullOr(Schema.String),
  })
);

export interface WriteLock {
  readonly writer: Ref.Ref<boolean>;
  readonly recoveryEvidence: string | null;
  readonly assertOwner: Effect.Effect<
    void,
    WorkspaceLockChanged | PlatformError.PlatformError
  >;
}

// Coordination only: acquiring this lock never creates a composition receipt.
export const withWriteLock = <A, E, R>(
  directory: string,
  use: (lock: WriteLock) => Effect.Effect<A, E, R>,
  options?: { readonly breakLock?: string }
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const lock = path.join(directory, ".workspace-composition.lock");
    const ownerPath = path.join(lock, "owner.json");
    const receiptPath = path.join(directory, ".workspace-composition.json");
    const invalid = () => new WorkspaceStateInvalid({ directory });
    const inspectLock = Effect.gen(function* () {
      if (!(yield* fs.exists(lock))) {
        return yield* new WorkspaceLockChanged({ directory });
      }
      const names = EffectArray.sort(
        yield* fs.readDirectory(lock),
        Order.String
      );
      const ownerText =
        names.includes("owner.json") &&
        (yield* fs.stat(ownerPath)).type === "File"
          ? yield* fs.readFileString(ownerPath)
          : null;
      const owner =
        ownerText === null
          ? null
          : yield* Schema.decodeEffect(LockOwner)(ownerText).pipe(
              Effect.orElseSucceed(() => null)
            );
      const stored = (yield* fs.exists(receiptPath))
        ? yield* fs.readFileString(receiptPath)
        : null;
      const candidatePath = path.join(lock, "receipt.json");
      const candidate =
        names.includes("receipt.json") &&
        (yield* fs.stat(candidatePath)).type === "File"
          ? yield* fs.readFileString(candidatePath)
          : null;
      const token = createHash("sha256")
        .update(
          yield* Schema.encodeEffect(LockObservation)({
            candidate,
            directory,
            names,
            ownerText,
            stored,
          }).pipe(Effect.mapError(invalid))
        )
        .digest("hex");
      return new WorkspaceLockAuthorizationRequired({
        directory,
        reason:
          owner === null
            ? "another operation may be running; the lock has no readable owner"
            : `process ${owner.pid} started ${owner.operation} at ${owner.startedAt} and may still be running`,
        token,
      });
    });
    const assertOwner = (owner: string) =>
      Effect.gen(function* () {
        const current = yield* fs.readFileString(ownerPath).pipe(
          Effect.catchIf(
            (error) => error.reason._tag === "NotFound",
            () => Effect.succeed(null)
          )
        );
        if (current !== owner) {
          return yield* new WorkspaceLockChanged({ directory });
        }
      });
    return yield* Effect.acquireUseRelease(
      Effect.gen(function* () {
        let recoveryEvidence: string | null = null;
        if (options?.breakLock !== undefined) {
          const observed = yield* inspectLock;
          if (observed.token !== options.breakLock) {
            return yield* new WorkspaceLockChanged({ directory });
          }
          const archive = path.join(
            directory,
            ".workspace-composition.recovery"
          );
          yield* fs.makeDirectory(archive, { mode: 0o700, recursive: true });
          recoveryEvidence = path.join(archive, randomUUID());
          yield* fs.rename(lock, recoveryEvidence);
        }
        yield* fs.makeDirectory(lock, { mode: 0o700 }).pipe(
          Effect.catchIf(
            (error) => error.reason._tag === "AlreadyExists",
            () => inspectLock.pipe(Effect.flatMap(Effect.fail))
          )
        );
        const owner = yield* Schema.encodeEffect(LockOwner)({
          operation: "sync",
          pid: process.pid,
          startedAt: DateTime.formatIso(yield* DateTime.now),
          token: randomUUID(),
        }).pipe(Effect.mapError(invalid));
        yield* fs.writeFileString(ownerPath, owner, {
          flag: "wx",
          mode: 0o600,
        });
        return { owner, recoveryEvidence, writer: yield* Ref.make(false) };
      }),
      (held) =>
        use({
          assertOwner: assertOwner(held.owner),
          recoveryEvidence: held.recoveryEvidence,
          writer: held.writer,
        }),
      (held) =>
        Effect.gen(function* () {
          yield* assertOwner(held.owner);
          if (
            (yield* Ref.get(held.writer)) ||
            (yield* fs.readDirectory(lock)).some(
              (name) => name !== "owner.json"
            )
          ) {
            return yield* new WorkspaceRecoveryRequired({ directory });
          }
          yield* fs.remove(lock, { recursive: true });
        })
    );
  });
