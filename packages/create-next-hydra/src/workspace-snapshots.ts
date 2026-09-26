import { createHash } from "node:crypto";

import {
  Context,
  Effect,
  FileSystem,
  Layer,
  Path,
  Schema,
  Stream,
} from "effect";
import type { PlatformError } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { SnapshotFailed, SnapshotUnavailable } from "./errors.ts";
import { cacheDirectories, isEnvironmentFile } from "./file-policy.ts";
import { relativeFile, writeFile } from "./files.ts";
import type { PreparedFile } from "./model.ts";
import type { WorkspaceIdentity } from "./workspace-state.ts";

export const snapshotTarget = (target: string): boolean =>
  !target
    .split("/")
    .some(
      (part) =>
        cacheDirectories.has(part) ||
        isEnvironmentFile(part) ||
        [".git", ".npmrc", ".netrc", ".ssh", ".aws", ".azure"].includes(part) ||
        /\.(?:pem|key|p12|pfx|keystore|tsbuildinfo)$/iu.test(part) ||
        /^id_(?:rsa|ed25519|ecdsa)(?:\.|$)/u.test(part)
    );

export type SnapshotError =
  | SnapshotFailed
  | SnapshotUnavailable
  | PlatformError.PlatformError;
export interface SnapshotDiff {
  readonly changes: readonly {
    readonly target: string;
    readonly status: string;
  }[];
  readonly patch: string;
}

export class WorkspaceSnapshots extends Context.Service<
  WorkspaceSnapshots,
  {
    readonly capture: (
      identity: WorkspaceIdentity,
      files: readonly PreparedFile[],
      previous?: string
    ) => Effect.Effect<string, SnapshotError>;
    readonly diff: (
      identity: WorkspaceIdentity,
      commit: string,
      files: readonly PreparedFile[]
    ) => Effect.Effect<SnapshotDiff, SnapshotError>;
  }
>()("create-next-hydra/WorkspaceSnapshots") {
  static readonly layer = Layer.effect(
    WorkspaceSnapshots,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
      const directoryFor = (identity: WorkspaceIdentity) =>
        path.join(
          identity.sourceRoot,
          ".cache",
          "workspace-snapshots",
          `${createHash("sha256").update(path.resolve(identity.directory)).digest("hex")}.git`
        );
      const use = <A, E, R>(
        identity: WorkspaceIdentity,
        operation: "capture" | "diff",
        callback: (context: {
          readonly repository: string;
          readonly tree: string;
          readonly git: (
            args: readonly string[]
          ) => Effect.Effect<string, SnapshotError>;
        }) => Effect.Effect<A, E, R>
      ) =>
        Effect.scoped(
          Effect.gen(function* () {
            const temporary = yield* Effect.acquireRelease(
              fs.makeTempDirectory({ prefix: "composition-snapshot-" }),
              (directory) =>
                fs.remove(directory, { recursive: true }).pipe(Effect.orDie)
            );
            const tree = path.join(temporary, "tree");
            yield* fs.makeDirectory(tree).pipe(Effect.uninterruptible);
            const repository = directoryFor(identity);
            // Private Git commands must never inherit an index, object store or config
            // selected by the maintainer's shell/hooks. No live workspace is staged.
            const env = Object.fromEntries(
              Object.entries(process.env).filter(
                ([name]) => !name.startsWith("GIT_")
              )
            );
            Object.assign(env, {
              GIT_ATTR_NOSYSTEM: "1",
              GIT_CONFIG_GLOBAL: "/dev/null",
              GIT_CONFIG_NOSYSTEM: "1",
              GIT_INDEX_FILE: path.join(temporary, "index"),
              GIT_OPTIONAL_LOCKS: "0",
            });
            if (operation === "diff") {
              const objects = path.join(temporary, "objects");
              yield* fs.makeDirectory(objects).pipe(Effect.uninterruptible);
              // Intent-to-add may create an empty blob. Keep all inspection writes in
              // disposable storage; read saved objects through an explicit alternate.
              Object.assign(env, {
                GIT_ALTERNATE_OBJECT_DIRECTORIES: yield* Schema.encodeEffect(
                  Schema.fromJsonString(Schema.String)
                )(path.join(repository, "objects")).pipe(
                  Effect.mapError(
                    () =>
                      new SnapshotFailed({
                        directory: identity.directory,
                        operation,
                      })
                  )
                ),
                GIT_OBJECT_DIRECTORY: objects,
              });
            }
            const git = (args: readonly string[]) =>
              Effect.scoped(
                Effect.gen(function* () {
                  const handle = yield* processes.spawn(
                    ChildProcess.make(
                      "git",
                      [
                        `--git-dir=${repository}`,
                        ...(args[0] === "init" ? [] : [`--work-tree=${tree}`]),
                        "--literal-pathspecs",
                        "-c",
                        "core.hooksPath=/dev/null",
                        "-c",
                        "core.attributesFile=/dev/null",
                        "-c",
                        "core.autocrlf=false",
                        "-c",
                        "core.fileMode=true",
                        "-c",
                        "core.fsmonitor=false",
                        "-c",
                        "commit.gpgsign=false",
                        "-c",
                        "user.name=Workspace composition",
                        "-c",
                        "user.email=workspace@localhost",
                        ...args,
                      ],
                      { cwd: tree, env, stderr: "ignore", stdin: "ignore" }
                    )
                  );
                  const [output, code] = yield* Effect.all(
                    [
                      Stream.mkString(Stream.decodeText(handle.stdout)),
                      handle.exitCode,
                    ],
                    { concurrency: "unbounded" }
                  );
                  if (code !== 0) {
                    return yield* new SnapshotFailed({
                      directory: identity.directory,
                      operation,
                    });
                  }
                  return output;
                })
              ).pipe(
                Effect.mapError(
                  () =>
                    new SnapshotFailed({
                      directory: identity.directory,
                      operation: `${operation}:${args[0]}`,
                    })
                ),
                Effect.uninterruptible
              );
            return yield* callback({ git, repository, tree });
          })
        );
      const populate = (tree: string, files: readonly PreparedFile[]) =>
        Effect.gen(function* () {
          for (const file of files) {
            if (snapshotTarget(file.target)) {
              yield* writeFile(tree, file, true);
            }
          }
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path)
        );
      const capture = Effect.fn("WorkspaceSnapshots.capture")(function* (
        identity: WorkspaceIdentity,
        files: readonly PreparedFile[],
        previous?: string
      ) {
        return yield* use(identity, "capture", ({ git, repository, tree }) =>
          Effect.gen(function* () {
            yield* fs
              .makeDirectory(repository, { mode: 0o700, recursive: true })
              .pipe(Effect.uninterruptible);
            yield* git([
              "init",
              "--bare",
              "--template=",
              "--object-format=sha1",
              "--initial-branch=composition",
              repository,
            ]);
            yield* fs
              .makeDirectory(path.join(repository, "info"), { recursive: true })
              .pipe(Effect.uninterruptible);
            yield* fs
              .writeFileString(
                path.join(repository, "info/attributes"),
                "* -text -filter -ident -working-tree-encoding !diff\n"
              )
              .pipe(Effect.uninterruptible);
            yield* populate(tree, files).pipe(
              Effect.mapError(
                () =>
                  new SnapshotFailed({
                    directory: identity.directory,
                    operation: "capture",
                  })
              )
            );
            yield* git(["read-tree", "--empty"]);
            yield* git(["add", "--force", "--all", "--", "."]);
            const treeId = (yield* git(["write-tree"])).trim();
            const previousTree = previous
              ? yield* git([
                  "rev-parse",
                  "--verify",
                  `${previous}^{tree}`,
                ]).pipe(
                  Effect.map((value) => value.trim()),
                  Effect.orElseSucceed(() => null)
                )
              : null;
            const commit =
              previous && previousTree === treeId
                ? previous
                : (yield* git([
                    "commit-tree",
                    treeId,
                    "-m",
                    "Compose workspace",
                  ])).trim();
            if (!/^[a-f0-9]{40}$/u.test(commit)) {
              return yield* new SnapshotFailed({
                directory: identity.directory,
                operation: "capture",
              });
            }
            // Each checkpoint stays reachable, including the old receipt's commit
            // if publishing a newer receipt fails. HEAD is never baseline authority.
            yield* git(["update-ref", `refs/snapshots/${commit}`, commit]);
            return commit;
          })
        );
      });
      const diff = Effect.fn("WorkspaceSnapshots.diff")(function* (
        identity: WorkspaceIdentity,
        commit: string,
        files: readonly PreparedFile[]
      ) {
        if (!(yield* fs.exists(path.join(directoryFor(identity), "HEAD")))) {
          return yield* new SnapshotUnavailable({
            directory: identity.directory,
          });
        }
        return yield* use(identity, "diff", ({ git, tree }) =>
          Effect.gen(function* () {
            const saved = yield* git([
              "ls-tree",
              "--name-only",
              "-rz",
              commit,
            ]).pipe(
              Effect.mapError(
                () => new SnapshotUnavailable({ directory: identity.directory })
              )
            );
            const targets = new Set(saved.split("\0").filter(Boolean));
            for (const target of targets) {
              if (
                !snapshotTarget(target) ||
                (yield* relativeFile(target).pipe(
                  Effect.orElseSucceed(() => "")
                )) !== target
              ) {
                return yield* new SnapshotUnavailable({
                  directory: identity.directory,
                });
              }
            }
            yield* populate(tree, files).pipe(
              Effect.mapError(
                () =>
                  new SnapshotFailed({
                    directory: identity.directory,
                    operation: "diff",
                  })
              )
            );
            yield* git(["read-tree", commit]);
            for (const file of files) {
              if (snapshotTarget(file.target) && !targets.has(file.target)) {
                yield* git([
                  "add",
                  "--intent-to-add",
                  "--force",
                  "--",
                  file.target,
                ]);
              }
            }
            const flags = [
              "--no-ext-diff",
              "--no-textconv",
              "--no-renames",
              "--no-color",
              "--src-prefix=a/",
              "--dst-prefix=b/",
            ];
            const names = (yield* git([
              "diff",
              ...flags,
              "--name-status",
              "-z",
              commit,
              "--",
            ])).split("\0");
            const changes: { target: string; status: string }[] = [];
            for (let index = 0; index + 1 < names.length; index += 2) {
              const target = names[index + 1];
              const status = names[index];
              if (target && status) {
                changes.push({ status, target });
              }
            }
            return {
              changes,
              patch: yield* git(["diff", ...flags, commit, "--"]),
            };
          })
        );
      });
      return WorkspaceSnapshots.of({ capture, diff });
    })
  );
}
