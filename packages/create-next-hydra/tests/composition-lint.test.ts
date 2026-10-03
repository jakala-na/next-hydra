import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Sink, Stream } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";

import {
  affectedLintWorkspaces,
  lintCompositions,
} from "../src/composition-lint.ts";
import { Shadcn } from "../src/shadcn.ts";
import { SourceInventory } from "../src/source-inventory.ts";
import { Workspaces } from "../src/workspaces.ts";
import { liveWorkspace } from "./fixtures/live-workspace.ts";
import { fixture } from "./fixtures/workspace.ts";

const testRuntime = liveWorkspace.pipe(
  Layer.provideMerge(
    Shadcn.layer(new URL("../src/shadcn-worker.ts", import.meta.url))
  ),
  Layer.provideMerge(SourceInventory.layer),
  Layer.provideMerge(NodeServices.layer)
);

// Control lint/prepare output while exercising real registry ownership,
// materialization and cleanup. No package installation is needed by these tests.
const lintProcesses = (commands: string[][], lintErrors = false) =>
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) => {
      if (command._tag !== "StandardCommand") {
        return Effect.die("Expected a standard lint command");
      }
      commands.push([command.command, ...command.args]);
      const files = command.args.includes("--debug")
        ? command.args.slice(2)
        : command.args.slice(command.args.indexOf("json") + 1);
      let output = "";
      if (command.command !== "pnpm") {
        output = command.args.includes("--debug")
          ? files.join("\n")
          : JSON.stringify({
              diagnostics: lintErrors
                ? [
                    {
                      filename: files[0],
                      message: "Invalid import",
                      severity: "error",
                    },
                  ]
                : [],
              number_of_files: files.length,
            });
      }
      return Effect.succeed(
        ChildProcessSpawner.makeHandle({
          all: Stream.empty,
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          pid: ChildProcessSpawner.ProcessId(2_147_483_647),
          stderr: Stream.empty,
          stdin: Sink.drain,
          stdout: Stream.make(new TextEncoder().encode(output)),
          unref: Effect.succeed(Effect.void),
        })
      );
    })
  );

it.effect(
  "selects compositions before installation, including deleted provider files and shared dependencies",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* fixture("editorial");
        const fs = yield* FileSystem.FileSystem;
        const workspaces = yield* Workspaces;
        const [reference] = yield* workspaces.discover(source);
        if (reference === undefined) {
          return yield* Effect.die("Missing authored workspace");
        }
        yield* fs.makeDirectory(`${source}/workspaces/other-site`);
        yield* fs.writeFile(
          `${source}/workspaces/other-site/next-hydra.json`,
          yield* fs.readFile(
            `${source}/workspaces/${reference.name}/next-hydra.json`
          )
        );
        const inspection = Workspaces.of({
          ...workspaces,
          fresh: () =>
            Effect.die("Matrix selection must not install an application"),
          named: (request) =>
            workspaces.named(request).pipe(
              Effect.map((workspace) => ({
                ...workspace,
                explain: () =>
                  Effect.succeed({
                    destination: `${source}/workspaces/${request.name}`,
                    files: [
                      "packages/shared/helpers.ts",
                      request.name === reference.name
                        ? "packages/cms-one/component.ts"
                        : "packages/cms-two/component.ts",
                    ].map((file) => ({
                      origin: { kind: "source", owner: null, source: file },
                      target: file,
                    })),
                    sourceRoot: source,
                  }),
              }))
            ),
        });
        yield* Effect.gen(function* () {
          for (const documentation of ["README.md", "tools/oxlint/README.md"]) {
            expect(
              yield* affectedLintWorkspaces(source, [documentation])
            ).toEqual([]);
          }
          expect(
            yield* affectedLintWorkspaces(source, [
              "packages/cms-one/deleted.ts",
            ])
          ).toEqual([reference.name]);
          expect(
            yield* affectedLintWorkspaces(source, [
              "packages/shared/new-helper.ts",
            ])
          ).toEqual(expect.arrayContaining([reference.name, "other-site"]));
          expect(
            yield* affectedLintWorkspaces(source, [
              `workspaces/${reference.name}/next-hydra.json`,
            ])
          ).toEqual([reference.name]);
          for (const sharedInput of [
            "pnpm-lock.yaml",
            "tools/oxlint/anti-slop/index.ts",
            "tools/oxlint/anti-slop/effect/index.ts",
            "tools/oxlint/anti-slop/rules/no-object-parameters.ts",
          ]) {
            expect(
              yield* affectedLintWorkspaces(source, [sharedInput])
            ).toEqual(expect.arrayContaining([reference.name, "other-site"]));
          }
        }).pipe(Effect.provideService(Workspaces, inspection));
      })
    ).pipe(Effect.provide(testRuntime))
);

it.effect(
  "lints only the selected composition, including unchanged rendered templates, and cleans up after errors",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* fixture("editorial");
        const fs = yield* FileSystem.FileSystem;
        const workspaces = yield* Workspaces;
        const [reference] = yield* workspaces.discover(source);
        if (reference === undefined) {
          return yield* Effect.die("Missing authored workspace");
        }
        yield* fs.makeDirectory(`${source}/workspaces/other-site`);
        yield* fs.writeFile(
          `${source}/workspaces/other-site/next-hydra.json`,
          yield* fs.readFile(
            `${source}/workspaces/${reference.name}/next-hydra.json`
          )
        );
        const materialized: string[] = [];
        const commands: string[][] = [];
        const selected = Workspaces.of({
          ...workspaces,
          fresh: (request) =>
            workspaces.fresh(request).pipe(
              Effect.map((workspace) => ({
                materialize: (options) => {
                  materialized.push(request.name);
                  return workspace.materialize({
                    ...options,
                    git: "skip",
                    install: "skip",
                  });
                },
              }))
            ),
        });
        const error = yield* lintCompositions(source, ["article.ts"], {
          kind: "workspace",
          name: reference.name,
        }).pipe(
          Effect.provideService(Workspaces, selected),
          Effect.provide(lintProcesses(commands, true)),
          Effect.flip
        );
        expect(error).toMatchObject({ _tag: "InvalidComposition" });
        expect(materialized).toEqual([reference.name]);
        expect(
          commands.find((command) => command.includes("--type-check"))
        ).toEqual(
          expect.arrayContaining(["apps/web/article.ts", "apps/web/blocks.ts"])
        );
        expect(
          (yield* fs.readDirectory(`${source}/workspaces`)).filter((name) =>
            name.startsWith(".lint-")
          )
        ).toEqual([]);
      })
    ).pipe(Effect.provide(testRuntime))
);

it.effect(
  "checks source ownership without materializing any composition and still rejects uncovered application files",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* fixture("editorial");
        const workspaces = yield* Workspaces;
        const commands: string[][] = [];
        const inspection = Workspaces.of({
          ...workspaces,
          fresh: () =>
            Effect.die(
              "Source lint must not install or materialize an application"
            ),
        });
        const checks = Effect.gen(function* () {
          yield* lintCompositions(source, ["article.ts"], { kind: "source" });
          const error = yield* lintCompositions(
            source,
            ["apps/api/uncovered.ts"],
            {
              kind: "source",
            }
          ).pipe(Effect.flip);
          expect(error).toMatchObject({ _tag: "InvalidComposition" });
          expect(error.message).toContain("apps/api/uncovered.ts");
        });
        yield* checks.pipe(
          Effect.provideService(Workspaces, inspection),
          Effect.provide(lintProcesses(commands))
        );
        expect(commands.some((command) => command[0] === "pnpm")).toBeFalsy();
      })
    ).pipe(Effect.provide(testRuntime))
);

it.effect("rejects an unknown matrix workspace before materialization", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const { source } = yield* fixture("editorial");
      const error = yield* lintCompositions(source, [], {
        kind: "workspace",
        name: "missing-site",
      }).pipe(Effect.flip);
      expect(error).toMatchObject({
        _tag: "InvalidComposition",
        message: "Unknown lint workspace: missing-site",
      });
    })
  ).pipe(Effect.provide(testRuntime))
);
