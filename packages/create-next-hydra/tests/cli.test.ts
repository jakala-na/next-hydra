import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Stdio } from "effect";
import { TestConsole } from "effect/testing";
import { ChildProcessSpawner } from "effect/unstable/process";
import { describe } from "vitest";

import { runCommand } from "../src/commands.ts";
import { Workspaces } from "../src/workspaces.ts";
import { memoryWorkspace } from "./fixtures/memory-workspace.ts";
import { terminalInput } from "./fixtures/terminal.ts";

const noProcesses = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(() =>
    Effect.die("Inspection must not execute processes")
  )
);

it.effect(
  "accepts safe existing workspace host names and rejects names that cannot identify one folder",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const api = yield* Workspaces;
        yield* fs.makeDirectory("/source/workspaces/site--review");
        yield* fs.writeFile(
          "/source/workspaces/site--review/next-hydra.json",
          yield* fs.readFile(
            "/source/workspaces/configured-site/next-hydra.json"
          )
        );
        const workspace = yield* api.named({
          name: "site--review",
          sourceRoot: "/source",
        });
        expect(
          (yield* workspace.explain("apps/web/layout.tsx")).files[0]?.target
        ).toBe("apps/web/layout.tsx");
        for (const name of ["../outside", "not/a/name", "a".repeat(64)]) {
          expect(
            yield* api.named({ name, sourceRoot: "/source" }).pipe(Effect.flip)
          ).toMatchObject({ _tag: "InvalidComposition" });
        }
      }).pipe(Effect.provide(layer));
    })
);

describe.each([
  ["compose", "configured-site", "--explain=apps/web/layout.tsx"],
  ["compose", "--explain=apps/web/layout.tsx", "configured-site"],
  ["compose", "configured-site", "--explain", "apps/web/layout.tsx"],
  ["compose", "--all", "--explain=apps/web/layout.tsx"],
])("file explanation: %s", (...args) => {
  it.effect(
    "locates the requested file without materializing the application",
    () =>
      Effect.gen(function* () {
        const layer = yield* memoryWorkspace("application");
        yield* Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* runCommand("/source", args, "0.3.0");
          const output = (yield* TestConsole.logLines).join("\n");
          expect(output).toContain("/source/layout.tsx.template");
          expect(output).not.toContain("source: /source/controls.tsx");
          expect(
            yield* fs.exists(
              "/source/workspaces/configured-site/apps/web/layout.tsx"
            )
          ).toBeFalsy();
        }).pipe(
          Effect.provide([
            layer,
            noProcesses,
            terminalInput("cancel"),
            TestConsole.layer,
            Stdio.layerTest({}),
          ])
        );
      })
  );
});

it.effect(
  "finds the source checkout when Compose is invoked from a package directory",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory("/source/packages/tooling", {
          recursive: true,
        });
        yield* runCommand(
          "/source/packages/tooling",
          ["compose", "configured-site", "--explain", "apps/web/layout.tsx"],
          "0.3.0"
        );
        expect((yield* TestConsole.logLines).join("\n")).toContain(
          "/source/layout.tsx.template"
        );
        expect(
          yield* fs.exists(
            "/source/workspaces/configured-site/apps/web/layout.tsx"
          )
        ).toBeFalsy();
      }).pipe(
        Effect.provide([
          layer,
          noProcesses,
          terminalInput("cancel"),
          TestConsole.layer,
          Stdio.layerTest({}),
        ])
      );
    })
);

it.effect(
  "rejects credential-copy requests combined with read-only explanation",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        expect(
          yield* runCommand(
            "/source",
            ["compose", "configured-site", "--explain", "--copy-env"],
            "0.3.0"
          ).pipe(Effect.flip)
        ).toMatchObject({ _tag: "InvalidComposition" });
        expect(
          yield* fs.exists(
            "/source/workspaces/configured-site/apps/web/layout.tsx"
          )
        ).toBeFalsy();
      }).pipe(
        Effect.provide([
          layer,
          noProcesses,
          terminalInput("cancel"),
          TestConsole.layer,
          Stdio.layerTest({}),
        ])
      );
    })
);
