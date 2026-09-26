import { Console, Effect, Match, Option, Path, Stdio, Stream } from "effect";
import { Argument, Command, Flag, Prompt } from "effect/unstable/cli";

import { addCommand } from "./add-command.ts";
import { createCommand } from "./create-command.ts";
import {
  InvalidComposition,
  WorkspaceBatchFailed,
  WorkspaceNotCurrent,
} from "./errors.ts";
import type { FileExplanation, MaterializationReport } from "./model.ts";
import { findSourceRoot } from "./source-root.ts";
import { Workspaces } from "./workspaces.ts";
import type { NamedSyncOptions, NamedWorkspaceRef } from "./workspaces.ts";

function explainFile(
  file: FileExplanation,
  sourceRoot: string,
  path: Path.Path
): string {
  return Match.value(file.origin).pipe(
    Match.discriminator("kind")(
      "registry",
      (origin) =>
        `${file.target}\n  published registry artifact: ${origin.owner}`
    ),
    Match.discriminator("kind")(
      "workspace-setting",
      (origin) =>
        `${file.target}\n  workspace setting: ${path.join(sourceRoot, origin.source)}`
    ),
    Match.discriminator("kind")(
      "source",
      (origin) =>
        `${file.target}\n  source: ${path.join(sourceRoot, origin.source)}${origin.owner === null ? "" : ` (${origin.owner})`}`
    ),
    Match.discriminator("kind")("template", (origin) =>
      [
        `${file.target}\n  template: ${path.join(sourceRoot, origin.source)} (${origin.owner})`,
        ...origin.bindings.map(
          (binding) =>
            `  ${binding.slot}: ${binding.module}#${binding.export}${binding.as ? ` as ${binding.as}` : ""} (${binding.owner})`
        ),
      ].join("\n")
    ),
    Match.discriminator("kind")("policy", (origin) =>
      [
        `${file.target}\n  composition policy: ${origin.policy}`,
        ...origin.sources.map(
          (source) => `  input: ${path.join(sourceRoot, source)}`
        ),
      ].join("\n")
    ),
    Match.exhaustive
  );
}

function synchronizationResult(
  name: string,
  result: MaterializationReport
): string {
  return [
    result.recoveryEvidence
      ? `Broke the authorized lock; retained evidence at ${result.recoveryEvidence}.`
      : null,
    `${name}: materialized ${result.files.length} files; removed ${result.removedFiles.length} files; copied ${result.environmentFilesCreated.length} environment files. Dependencies ${result.dependencies}.${result.dependencyReasons.length ? ` ${result.dependencyReasons.join("; ")}.` : ""}`,
    ...result.instructions.map(({ item, text }) => `${item}:\n${text}`),
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function command(cwd: string) {
  return createCommand(cwd).pipe(
    Command.withSubcommands([
      addCommand(cwd),
      Command.make(
        "compose",
        {
          all: Flag.Boolean("all").pipe(
            Flag.withDefault(false),
            Flag.withDescription(
              "Select all Git-visible workspace definitions under workspaces/."
            )
          ),
          check: Flag.Boolean("check").pipe(
            Flag.withDefault(false),
            Flag.withDescription(
              "Check applied files and dependency evidence without changing the workspace."
            )
          ),
          copyEnv: Flag.Boolean("copy-env").pipe(
            Flag.withDefault(false),
            Flag.withDescription(
              "Copy missing ignored environment files from local source without replacing existing values."
            )
          ),
          diff: Flag.Boolean("diff").pipe(
            Flag.withDefault(false),
            Flag.withDescription(
              "Show local changes against the saved composition snapshot without updating."
            )
          ),
          explain: Flag.Boolean("explain").pipe(
            Flag.withDefault(false),
            Flag.withDescription(
              "Locate canonical sources and templates without changing the workspace."
            )
          ),
          install: Flag.Boolean("install").pipe(Flag.withDefault(true)),
          name: Argument.String("name").pipe(Argument.optional),
          offline: Flag.Boolean("offline").pipe(Flag.withDefault(false)),
          target: Argument.String("file").pipe(
            Argument.optional,
            Argument.withDescription(
              "Workspace-relative file to locate with --explain; omit to list all selected files."
            )
          ),
          watch: Flag.Boolean("watch").pipe(
            Flag.withDefault(false),
            Flag.withDescription(
              "Keep the workspace synchronized with canonical source changes. Run development tasks separately."
            )
          ),
        },
        ({
          name: nameOption,
          all,
          install,
          copyEnv,
          offline,
          explain,
          target,
          check,
          diff,
          watch,
        }) =>
          Effect.gen(function* () {
            const requestedName =
              all && explain ? Option.none<string>() : nameOption;
            const explainTarget = all && explain ? nameOption : target;
            if (all && Option.isSome(target)) {
              return yield* new InvalidComposition({
                message: "Provide at most one file with --all --explain",
              });
            }
            if (all === Option.isSome(requestedName)) {
              return yield* new InvalidComposition({
                message: "Choose one workspace name or --all",
              });
            }
            if ([check, explain, diff, watch].filter(Boolean).length > 1) {
              return yield* new InvalidComposition({
                message: "Choose one of --check, --explain, --diff or --watch",
              });
            }
            if ((explain || diff) && copyEnv) {
              return yield* new InvalidComposition({
                message:
                  "--explain and --diff are read-only; do not combine them with --copy-env.",
              });
            }
            if (!explain && Option.isSome(target)) {
              return yield* new InvalidComposition({
                message: "A file argument requires --explain",
              });
            }
            const workspaces = yield* Workspaces;
            const sourceRoot = yield* findSourceRoot(cwd);
            const references = Option.isSome(requestedName)
              ? [{ name: requestedName.value, sourceRoot }]
              : yield* workspaces.discover(sourceRoot);
            if (references.length === 0) {
              return yield* new InvalidComposition({
                message:
                  "No named workspace definitions found in workspaces/*/next-hydra.json",
              });
            }
            const options: NamedSyncOptions = {
              environment: copyEnv ? "copy-missing-local" : "preserve",
              install: install ? "install" : "skip",
              offline,
            };
            if (watch) {
              return yield* Stream.mergeAll(
                references.map((reference) =>
                  Stream.unwrap(
                    workspaces
                      .named(reference)
                      .pipe(Effect.map((workspace) => workspace.watch(options)))
                  ).pipe(
                    Stream.map((event) => ({ event, name: reference.name }))
                  )
                ),
                { concurrency: "unbounded" }
              ).pipe(
                Stream.runForEach(({ event, name: workspaceName }) =>
                  event._tag === "Synchronized"
                    ? Console.log(
                        synchronizationResult(workspaceName, event.result)
                      )
                    : Console.error(`${workspaceName}: ${event.error.message}`)
                )
              );
            }
            const run = Effect.fn("Compose.run")(function* (
              reference: NamedWorkspaceRef
            ) {
              const { name } = reference;
              const workspace = yield* workspaces.named(reference);
              if (diff) {
                const report = yield* workspace.diff;
                const path = yield* Path.Path;
                yield* Console.log(
                  [
                    `${name}: changes against saved composition ${report.snapshot}.`,
                    ...(report.incomplete
                      ? [
                          "Synchronization is incomplete; this patch may include tool-applied changes.",
                        ]
                      : []),
                    ...report.conflicts.map((file) => `conflict: ${file}`),
                    ...report.unregisteredFiles.map(
                      (file) => `unregistered: ${file}`
                    ),
                    ...(report.origins.length === 0
                      ? []
                      : [
                          "Sources recorded with the saved composition:",
                          ...report.origins.map((file) =>
                            explainFile(file, reference.sourceRoot, path)
                          ),
                        ]),
                    report.patch || "No owned-file changes.",
                  ].join("\n")
                );
                return;
              }
              if (check) {
                const report = yield* workspace.check({ offline });
                yield* Console.log(
                  [
                    `${name}: ${report.ready ? "current" : "needs attention"}.`,
                    ...(report.initialized
                      ? []
                      : ["Workspace has not been initialized."]),
                    ...report.changes.map(
                      (change) => `${change.kind}: ${change.target}`
                    ),
                    `Dependencies ${report.dependencies}.`,
                    ...report.dependencyReasons,
                  ].join("\n")
                );
                if (!report.ready) {
                  return yield* new WorkspaceNotCurrent({
                    directory: report.destination,
                  });
                }
                return;
              }
              if (explain) {
                const report = yield* workspace.explain(
                  Option.getOrUndefined(explainTarget)
                );
                const path = yield* Path.Path;
                yield* Console.log(
                  [
                    `${name}: ${report.files.length} selected source files (current definition, not applied state).`,
                    ...report.files.map((entry) =>
                      explainFile(entry, report.sourceRoot, path)
                    ),
                  ].join("\n")
                );
                return;
              }
              const result = yield* workspace.sync(options).pipe(
                Effect.catchTag("WorkspaceLockAuthorizationRequired", (error) =>
                  Effect.gen(function* () {
                    const stdio = yield* Stdio.Stdio;
                    if (
                      !(yield* stdio.stdinIsTerminal) ||
                      !(yield* stdio.stdoutIsTerminal)
                    ) {
                      return yield* error;
                    }
                    yield* Console.warn(
                      `${name}: ${error.reason}. Stop other Compose commands for this workspace before continuing. Breaking the lock does not stop processes. It preserves recovery evidence and does not override local-file conflicts or incomplete state.`
                    );
                    const approved = yield* Prompt.Confirm({
                      initial: false,
                      message: `Other Compose commands are stopped. Break the lock for ${name}?`,
                    });
                    if (!approved) {
                      return yield* error;
                    }
                    return yield* workspace.sync({
                      ...options,
                      breakLock: error.token,
                    });
                  })
                )
              );
              yield* Console.log(synchronizationResult(name, result));
            });
            if (Option.isSome(requestedName)) {
              return yield* run({ name: requestedName.value, sourceRoot });
            }
            const [failed] = yield* Effect.partition(
              references,
              (reference) =>
                run(reference).pipe(
                  Effect.tapError((error) =>
                    Console.error(`${reference.name}: ${error.message}`)
                  ),
                  Effect.mapError(() => reference.name)
                ),
              { concurrency: 1 }
            );
            if (failed.length > 0) {
              return yield* new WorkspaceBatchFailed({ names: failed });
            }
          })
      ),
    ])
  );
}

export const runCommand = (
  sourceRoot: string,
  args: readonly string[],
  version: string
) => {
  // Effect CLI has optional flags, but not optional flag values. Normalize only
  // this spelling; Effect owns parsing, validation, help and every other option.
  const targets: string[] = [];
  let literal = false;
  const normalized = args.map((arg) => {
    if (arg === "--") {
      literal = true;
    }
    if (args[0] === "compose" && !literal && arg.startsWith("--explain=")) {
      targets.push(arg.slice("--explain=".length));
      return "--explain";
    }
    return arg;
  });
  return Command.runWith(command(sourceRoot), { version })([
    ...normalized,
    ...targets,
  ]);
};
