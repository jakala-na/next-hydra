import { createHash } from "node:crypto";
import { homedir } from "node:os";

import {
  Array as EffectArray,
  Config,
  Context,
  Effect,
  FileSystem,
  Layer,
  Order,
  Path,
  Schema,
  Stream,
} from "effect";
import type { PlatformError } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { parseDocument } from "yaml";

import {
  DependencyInstallationFailed,
  WorkspaceConflict,
  WorkspaceRecoveryRequired,
} from "./errors.ts";
import { relativeFile } from "./files.ts";
import type { PreparedFile } from "./model.ts";
import { confirmStopped, groupExists } from "./process-group.ts";
import { sameFingerprint } from "./workspace-state.ts";
import type {
  Fingerprint,
  WorkspaceStateError,
  WorkspaceWriteAccess,
  WorkspaceObservation,
} from "./workspace-state.ts";

export interface DependencyOptions {
  readonly install?: "install" | "skip";
  readonly offline?: boolean;
}
export type DependencyError =
  | DependencyInstallationFailed
  | WorkspaceConflict
  | PlatformError.PlatformError
  | WorkspaceStateError;
export interface DependencyOutcome {
  readonly dependencies: "pending" | "current";
  readonly dependencyReasons: readonly string[];
}

const fingerprint = (content: Uint8Array, mode: number): Fingerprint => ({
  hash: createHash("sha256").update(content).digest("hex"),
  mode,
});
const ManifestDependencies = Schema.Struct({
  dependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  devDependencies: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String)
  ),
  optionalDependencies: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.String)
  ),
});

// Hooks and local packages can read inputs outside the prepared manifest set.
// Delegate their reconciliation to pnpm instead of inventing a second resolver.
const hasUnboundedInputs = (value: Schema.Json): boolean => {
  if (Schema.is(Schema.String)(value)) {
    return /^(?:file|link|portal):/u.test(value);
  }
  if (Array.isArray(value)) {
    return value.some(hasUnboundedInputs);
  }
  if (Schema.is(Schema.JsonObject)(value)) {
    return Object.entries(value).some(
      ([key, entry]) =>
        ([
          "preinstall",
          "install",
          "postinstall",
          "prepare",
          "pnpm:devPreinstall",
          "pnpmfile",
          "globalPnpmfile",
        ].includes(key) &&
          Boolean(entry)) ||
        (["injected", "injectWorkspacePackages"].includes(key) &&
          entry === true) ||
        hasUnboundedInputs(entry)
    );
  }
  return false;
};

const inputsFor = (directory: string, files: readonly PreparedFile[]) =>
  Effect.gen(function* () {
    const settings = files.find(
      (file) => file.target === "pnpm-workspace.yaml"
    );
    const document = yield* Effect.try(() =>
      parseDocument(new TextDecoder().decode(settings?.content))
    );
    if (document.errors.length) {
      return yield* Effect.fail(document.errors[0]);
    }
    const decode = yield* Effect.try(() =>
      Schema.decodeUnknownEffect(Schema.JsonObject)(document.toJS())
    );
    const config = yield* decode;
    const patches = yield* Schema.decodeEffect(
      Schema.Struct({
        patchedDependencies: Schema.optionalKey(
          Schema.Record(Schema.String, Schema.String)
        ),
      })
    )(config);
    const targets = new Set(["pnpm-workspace.yaml", "pnpm-lock.yaml"]);
    const outputs: string[] = [];
    let unbounded = hasUnboundedInputs(config);
    for (const file of files) {
      if (
        file.target === "package.json" ||
        file.target.endsWith("/package.json")
      ) {
        targets.add(file.target);
        const manifest = yield* Schema.decodeEffect(
          Schema.fromJsonString(Schema.JsonObject)
        )(new TextDecoder().decode(file.content));
        unbounded ||= hasUnboundedInputs(manifest);
        const dependencies =
          yield* Schema.decodeEffect(ManifestDependencies)(manifest);
        const parent = file.target.slice(0, -"package.json".length);
        for (const name of Object.keys({
          ...dependencies.dependencies,
          ...dependencies.devDependencies,
        })) {
          if (!Object.hasOwn(dependencies.optionalDependencies ?? {}, name)) {
            outputs.push(
              `${parent}node_modules/${yield* relativeFile(name)}/package.json`
            );
          }
        }
      }
    }
    for (const target of Object.values(patches.patchedDependencies ?? {})) {
      targets.add(yield* relativeFile(target));
    }
    const ordered = EffectArray.sort([...targets], Order.String);
    const selected: PreparedFile[] = [];
    for (const target of ordered) {
      const file = files.find((candidate) => candidate.target === target);
      if (!file) {
        return yield* new DependencyInstallationFailed({
          directory,
          phase: "inputs",
        });
      }
      selected.push(file);
    }
    const hash = createHash("sha256");
    for (const file of selected) {
      hash
        .update(file.target)
        .update("\0")
        .update(String(file.mode))
        .update("\0")
        .update(String(file.content.length))
        .update("\0")
        .update(file.content);
    }
    return { files: selected, key: hash.digest("hex"), outputs, unbounded };
  });

export class WorkspaceDependencies extends Context.Service<
  WorkspaceDependencies,
  {
    readonly install: (
      directory: string
    ) => Effect.Effect<void, DependencyInstallationFailed>;
    readonly recover: (
      access: WorkspaceWriteAccess
    ) => Effect.Effect<void, DependencyError>;
    readonly inspect: (
      observation: Pick<
        WorkspaceObservation,
        "directory" | "entries" | "installation"
      >,
      files: readonly PreparedFile[],
      options: Pick<DependencyOptions, "offline">
    ) => Effect.Effect<DependencyOutcome, DependencyError>;
    readonly reconcile: (
      directory: string,
      files: readonly PreparedFile[],
      options: DependencyOptions,
      access?: WorkspaceWriteAccess
    ) => Effect.Effect<DependencyOutcome, DependencyError>;
  }
>()("create-next-hydra/WorkspaceDependencies") {
  static readonly layer = Layer.effect(
    WorkspaceDependencies,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const runInstall = <E = never>(
        directory: string,
        offline: boolean,
        lifecycle?: {
          readonly starting: Effect.Effect<void, E>;
          readonly stopped: Effect.Effect<void, E>;
        }
      ) =>
        Effect.scoped(
          Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              const failure = (phase: "launch" | "exit" | "stop") =>
                new DependencyInstallationFailed({ directory, phase });
              yield* lifecycle?.starting ?? Effect.void;
              const handle = yield* spawner
                .spawn(
                  ChildProcess.make(
                    "pnpm",
                    [
                      "install",
                      ...(offline ? ["--offline"] : []),
                      "--no-frozen-lockfile",
                    ],
                    {
                      cwd: directory,
                      forceKillAfter: "100 millis",
                      stderr: "inherit",
                      stdin: "ignore",
                      stdout: "inherit",
                    }
                  )
                )
                .pipe(
                  Effect.mapError(() => failure("launch")),
                  Effect.tapError(() => lifecycle?.stopped ?? Effect.void)
                );
              return yield* restore(
                handle.exitCode.pipe(Effect.mapError(() => failure("exit")))
              ).pipe(
                Effect.tap(() =>
                  groupExists(handle.pid).pipe(
                    Effect.mapError(() => failure("stop")),
                    Effect.flatMap((exists) =>
                      exists ? Effect.fail(failure("stop")) : Effect.void
                    )
                  )
                ),
                Effect.onExit(() =>
                  confirmStopped(handle).pipe(
                    Effect.mapError(() => failure("stop")),
                    Effect.andThen(lifecycle?.stopped ?? Effect.void),
                    Effect.onExit(() =>
                      handle.unref.pipe(
                        Effect.mapError(() => failure("stop")),
                        Effect.asVoid
                      )
                    )
                  )
                )
              );
            })
          )
        );
      const install = Effect.fn("WorkspaceDependencies.install")(function* (
        directory: string
      ) {
        const code = yield* runInstall(directory, false);
        if (code !== 0) {
          return yield* new DependencyInstallationFailed({
            directory,
            phase: "exit",
          });
        }
      });
      const observe = (file: string) =>
        Effect.gen(function* () {
          const stat = yield* fs.stat(file);
          return fingerprint(yield* fs.readFile(file), stat.mode % 0o1000);
        });
      const optionalObservation = (file: string) =>
        observe(file).pipe(Effect.orElseSucceed(() => null));
      const manifestPresent = (file: string) =>
        fs.stat(file).pipe(
          Effect.map((stat) => stat.type === "File"),
          Effect.orElseSucceed(() => false)
        );
      const recover = Effect.fn("WorkspaceDependencies.recover")(function* (
        access: WorkspaceWriteAccess
      ) {
        const observation = yield* access.observation;
        if (observation.pending?.kind !== "installation") {
          return;
        }
        if (!observation.pending.stopped) {
          return yield* new WorkspaceRecoveryRequired({
            directory: access.directory,
          });
        }
        const conflicts: string[] = [];
        for (const entry of observation.entries) {
          if (
            !sameFingerprint(
              yield* optionalObservation(
                path.join(access.directory, entry.target)
              ),
              entry.applied
            )
          ) {
            conflicts.push(entry.target);
          }
        }
        if (conflicts.length > 0) {
          return yield* new WorkspaceConflict({ paths: conflicts });
        }
        // An interrupted lockfile rewrite is not proven pnpm normalization.
        // Preserve all source and installed output; a later reconcile may retry.
        yield* access.recoverInstall(observation.revision);
      });
      const externalConfiguration = (directory: string) =>
        Effect.gen(function* () {
          const roots = new Set([homedir()]);
          let parent = directory;
          while (!roots.has(parent)) {
            roots.add(parent);
            const next = path.dirname(parent);
            if (next === parent) {
              break;
            }
            parent = next;
          }
          for (const root of roots) {
            if (yield* fs.exists(path.join(root, ".pnpmfile.cjs"))) {
              return true;
            }
            const npmrc = path.join(root, ".npmrc");
            if (yield* fs.exists(npmrc)) {
              // Login credentials do not change an already installed graph. Accept
              // only literal auth assignments/comments; unknown INI syntax and all
              // other settings still require pnpm. Never hash or retain values.
              const content = yield* fs.readFileString(npmrc);
              if (
                content.split(/\r?\n/u).some((line) => {
                  const setting = line.trim();
                  return (
                    setting !== "" &&
                    !/^[#;]/u.test(setting) &&
                    !/^(?:\/\/[^\s=]+:)?(?:_authToken|_auth|username|_password)\s*=/u.test(
                      setting
                    )
                  );
                })
              ) {
                return true;
              }
            }
          }
          // Invocation metadata does not affect installation. Other npm configuration
          // and PNPM_* settings may; keep values out of both hashes and diagnostics.
          const metadata = new Set([
            "npm_config_user_agent",
            "npm_config_recursive",
            "npm_config_manage_package_manager_versions",
            "npm_config_verify_deps_before_run",
          ]);
          return Object.keys(process.env).some(
            (name) =>
              (name.toLowerCase().startsWith("npm_config_") &&
                !metadata.has(name.toLowerCase())) ||
              (name.startsWith("PNPM_") &&
                !["PNPM_HOME", "PNPM_PACKAGE_NAME"].includes(name))
          );
        });
      const inspect = Effect.fn("WorkspaceDependencies.inspect")(function* (
        observation: Pick<
          WorkspaceObservation,
          "directory" | "entries" | "installation"
        >,
        files: readonly PreparedFile[],
        options: Pick<DependencyOptions, "offline">
      ): Effect.fn.Return<DependencyOutcome, DependencyError> {
        const { directory, installation: previous } = observation;
        if (!previous) {
          return {
            dependencies: "pending",
            dependencyReasons: ["No successful installation recorded"],
          };
        }
        const failure = () =>
          new DependencyInstallationFailed({ directory, phase: "inputs" });
        const inputs = yield* inputsFor(directory, files).pipe(
          Effect.mapError(failure)
        );
        const reasons: string[] = [];
        if (inputs.key !== previous.inputs) {
          reasons.push("Installation inputs changed");
        }
        const applied = new Map(
          observation.entries.map((entry) => [entry.target, entry.applied])
        );
        for (const file of inputs.files) {
          const expected = applied.get(file.target);
          if (
            !expected ||
            !sameFingerprint(
              yield* optionalObservation(path.join(directory, file.target)),
              expected
            )
          ) {
            reasons.push(`Applied installation input changed: ${file.target}`);
          }
        }
        const environment = yield* Config.String("NODE_ENV").pipe(
          Config.withDefault("development"),
          Effect.mapError(failure)
        );
        // Check verifies recorded installation, not the executable a future install
        // might select. Never bootstrap a package manager during read-only inspection.
        if (
          !previous.toolchain.startsWith(
            `${process.version}/${process.platform}/${process.arch}/pnpm-`
          ) ||
          !previous.toolchain.endsWith(
            `/offline-${options.offline === true}/production-${environment === "production"}`
          )
        ) {
          reasons.push("Runtime or installation options changed");
        }
        if (inputs.unbounded || (yield* externalConfiguration(directory))) {
          reasons.push("External installation inputs require reconciliation");
        }
        for (const [target, expected] of [
          ["pnpm-lock.yaml", previous.lockfile],
          ["node_modules/.modules.yaml", previous.modules],
          ["node_modules/.pnpm/lock.yaml", previous.virtualLock],
        ] as const) {
          if (
            !sameFingerprint(
              yield* optionalObservation(path.join(directory, target)),
              expected
            )
          ) {
            reasons.push(`Installation output missing or changed: ${target}`);
          }
        }
        for (const target of inputs.outputs) {
          if (!(yield* manifestPresent(path.join(directory, target)))) {
            reasons.push(`Installed dependency missing: ${target}`);
          }
        }
        return {
          dependencies: reasons.length ? "pending" : "current",
          dependencyReasons: reasons,
        };
      });
      const reconcile = Effect.fn("WorkspaceDependencies.reconcile")(function* (
        directory: string,
        files: readonly PreparedFile[],
        options: DependencyOptions,
        access?: WorkspaceWriteAccess
      ): Effect.fn.Return<DependencyOutcome, DependencyError> {
        if (options.install === "skip") {
          return {
            dependencies: "pending",
            dependencyReasons: ["Installation skipped"],
          };
        }
        const failure = (phase: DependencyInstallationFailed["phase"]) =>
          new DependencyInstallationFailed({ directory, phase });
        if (process.platform === "win32") {
          return yield* failure("launch");
        }
        const inputs = yield* inputsFor(directory, files).pipe(
          Effect.mapError(() => failure("inputs"))
        );
        const expected = access
          ? new Map(
              (yield* access.appliedEntries).map((entry) => [
                entry.target,
                entry.applied,
              ])
            )
          : new Map(
              files.map((file) => [
                file.target,
                fingerprint(file.content, file.mode),
              ])
            );
        const verifyInputs = (includeLock: boolean) =>
          Effect.gen(function* () {
            for (const file of inputs.files) {
              if (!includeLock && file.target === "pnpm-lock.yaml") {
                continue;
              }
              const actual = yield* optionalObservation(
                path.join(directory, file.target)
              );
              if (!sameFingerprint(actual, expected.get(file.target) ?? null)) {
                return yield* failure("inputs");
              }
            }
          });
        yield* verifyInputs(true);
        // Version discovery uses the same executable and working directory as install.
        const version = yield* Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* spawner.spawn(
              ChildProcess.make("pnpm", ["--version"], {
                cwd: directory,
                stderr: "ignore",
                stdin: "ignore",
              })
            );
            const [output, code] = yield* Effect.all(
              [
                Stream.mkString(Stream.decodeText(handle.stdout)),
                handle.exitCode,
              ],
              { concurrency: "unbounded" }
            );
            if (
              code !== 0 ||
              !/^\d+\.\d+\.\d+(?:-[\w.-]+)?\s*$/u.test(output)
            ) {
              return yield* failure("version");
            }
            return output.trim();
          })
        ).pipe(Effect.mapError(() => failure("version")));
        yield* verifyInputs(true);
        const environment = yield* Config.String("NODE_ENV").pipe(
          Config.withDefault("development"),
          Effect.mapError(() => failure("inputs"))
        );
        const toolchain = `${process.version}/${process.platform}/${process.arch}/pnpm-${version}/offline-${options.offline === true}/production-${environment === "production"}`;
        const previous = access ? yield* access.installation : null;
        const modulesPath = path.join(directory, "node_modules/.modules.yaml");
        const virtualLockPath = path.join(
          directory,
          "node_modules/.pnpm/lock.yaml"
        );
        const lockPath = path.join(directory, "pnpm-lock.yaml");
        const outputsPresent = Effect.gen(function* () {
          for (const output of inputs.outputs) {
            if (!(yield* manifestPresent(path.join(directory, output)))) {
              return false;
            }
          }
          return true;
        });
        if (access && previous?.toolchain === toolchain) {
          const observed = yield* inspect(
            {
              directory,
              entries: yield* access.appliedEntries,
              installation: previous,
            },
            files,
            options
          );
          if (observed.dependencies === "current") {
            return observed;
          }
        }
        const code = yield* runInstall(
          directory,
          options.offline === true,
          access
            ? {
                starting: access.beginInstall(inputs.key),
                stopped: access.installStopped,
              }
            : undefined
        ).pipe(
          Effect.tapErrorTag("DependencyInstallationFailed", (error) =>
            Effect.gen(function* () {
              if (error.phase === "launch" && access) {
                yield* verifyInputs(true);
                yield* access.finishInstall(null, yield* observe(lockPath));
              }
            })
          )
        );
        yield* verifyInputs(false);
        const lockfile = yield* observe(lockPath).pipe(
          Effect.mapError(() => failure("outputs"))
        );
        if (code !== 0) {
          if (
            access &&
            sameFingerprint(lockfile, expected.get("pnpm-lock.yaml") ?? null)
          ) {
            yield* access.finishInstall(null, lockfile);
          }
          return yield* failure("exit");
        }
        const modules = yield* observe(modulesPath).pipe(
          Effect.mapError(() => failure("outputs"))
        );
        const virtualLock = yield* observe(virtualLockPath).pipe(
          Effect.mapError(() => failure("outputs"))
        );
        if (!(yield* outputsPresent)) {
          return yield* failure("outputs");
        }
        if (access) {
          yield* access.finishInstall(
            { inputs: inputs.key, lockfile, modules, toolchain, virtualLock },
            lockfile
          );
        }
        return { dependencies: "current", dependencyReasons: [] };
      });
      return WorkspaceDependencies.of({ inspect, install, reconcile, recover });
    })
  );
}
