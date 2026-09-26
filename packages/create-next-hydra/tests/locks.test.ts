import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, PlatformError, Stdio } from "effect";
import { TestConsole } from "effect/testing";
import { Command } from "effect/unstable/cli";
import { ChildProcessSpawner } from "effect/unstable/process";
import { describe } from "vitest";

import { command } from "../src/commands.ts";
import { Workspaces } from "../src/workspaces.ts";
import {
  memoryWorkspace,
  memoryWorkspaceServices,
} from "./fixtures/memory-workspace.ts";
import { terminalInput } from "./fixtures/terminal.ts";

const root = "/source/workspaces/configured-site";
const named = Workspaces.pipe(
  Effect.flatMap((workspaces) =>
    workspaces.named({ name: "configured-site", sourceRoot: "/source" })
  )
);

const noCommands = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(() => Effect.die("Unexpected command"))
);

it.effect(
  "Compose asks before breaking an uncertain lock and performs the approved recovery",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(`${root}/.workspace-composition.lock`);
        yield* Command.runWith(command("/source"), { version: "0.3.0" })([
          "compose",
          "configured-site",
          "--no-install",
        ]);
        expect(
          yield* fs.readFileString(`${root}/apps/web/layout.tsx`)
        ).toContain("Hello");
        expect(
          yield* fs.exists(`${root}/.workspace-composition.lock`)
        ).toBeFalsy();
        expect(
          yield* fs.readDirectory(`${root}/.workspace-composition.recovery`)
        ).toHaveLength(1);
      }).pipe(
        Effect.provide([
          layer,
          TestConsole.layer,
          terminalInput("yes"),
          noCommands,
          Stdio.layerTest({
            stdinIsTerminal: Effect.succeed(true),
            stdoutIsTerminal: Effect.succeed(true),
          }),
        ])
      );
    })
);

describe.each(["no", "cancel", "noninteractive"] as const)(
  "lock authorization: %s",
  (answer) => {
    it.effect("leaves the lock and workspace untouched without approval", () =>
      Effect.gen(function* () {
        const layer = yield* memoryWorkspace("application");
        let prompted = false;
        yield* Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          yield* fs.makeDirectory(`${root}/.workspace-composition.lock`);
          yield* fs.writeFileString(
            `${root}/.workspace-composition.lock/receipt.json`,
            "keep this evidence"
          );
          yield* Command.runWith(command("/source"), { version: "0.3.0" })([
            "compose",
            "configured-site",
            "--no-install",
          ]).pipe(Effect.exit);
          expect(prompted).toBe(answer !== "noninteractive");
          expect(
            yield* fs.readFileString(
              `${root}/.workspace-composition.lock/receipt.json`
            )
          ).toBe("keep this evidence");
          expect(yield* fs.exists(`${root}/apps/web/layout.tsx`)).toBeFalsy();
          expect(
            yield* fs.exists(`${root}/.workspace-composition.recovery`)
          ).toBeFalsy();
        }).pipe(
          Effect.provide([
            layer,
            TestConsole.layer,
            noCommands,
            terminalInput(
              answer === "noninteractive" ? "yes" : answer,
              Effect.sync(() => {
                prompted = true;
              })
            ),
            Stdio.layerTest({
              stdinIsTerminal: Effect.succeed(answer !== "noninteractive"),
              stdoutIsTerminal: Effect.succeed(answer !== "noninteractive"),
            }),
          ])
        );
      })
    );
  }
);

it.effect(
  "rejects an approval when the retained publication changes while the prompt is open",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* named;
        yield* fs.makeDirectory(`${root}/.workspace-composition.lock`);
        const candidate = `${root}/.workspace-composition.lock/receipt.json`;
        yield* fs.writeFileString(candidate, "first publication");
        const blocked = yield* workspace
          .sync({ install: "skip" })
          .pipe(Effect.flip);
        if (blocked._tag !== "WorkspaceLockAuthorizationRequired") {
          return yield* Effect.die("Expected lock authorization request");
        }
        yield* fs.writeFileString(candidate, "new publication");
        expect(
          yield* workspace
            .sync({ breakLock: blocked.token, install: "skip" })
            .pipe(Effect.flip)
        ).toMatchObject({ _tag: "WorkspaceLockChanged" });
        expect(yield* fs.readFileString(candidate)).toBe("new publication");
        expect(yield* fs.exists(`${root}/apps/web/layout.tsx`)).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "requires authorization to recover a lock left behind by failed cleanup",
  () =>
    Effect.gen(function* () {
      let failRelease = true;
      const layer = yield* memoryWorkspace("application", {
        fileSystem: (fs) => ({
          ...fs,
          remove: (file, options) => {
            if (file === `${root}/.workspace-composition.lock` && failRelease) {
              failRelease = false;
              return Effect.fail(
                PlatformError.systemError({
                  _tag: "PermissionDenied",
                  method: "remove",
                  module: "FileSystem",
                  pathOrDescriptor: file,
                })
              );
            }
            return fs.remove(file, options);
          },
        }),
      });
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* (yield* named).sync({ install: "skip" }).pipe(Effect.exit);
        const template = yield* fs.readFileString(
          "/source/layout.tsx.template"
        );
        yield* fs.writeFileString(
          "/source/layout.tsx.template",
          template.replace("Hello", "Recovered")
        );
        const report = yield* Effect.gen(function* () {
          const workspace = yield* named;
          const blocked = yield* workspace
            .sync({ install: "skip" })
            .pipe(Effect.flip);
          if (blocked._tag !== "WorkspaceLockAuthorizationRequired") {
            return yield* Effect.die("Expected lock authorization request");
          }
          return yield* workspace.sync({
            breakLock: blocked.token,
            install: "skip",
          });
        }).pipe(Effect.provide(memoryWorkspaceServices()));
        expect(
          yield* fs.readFileString(`${root}/apps/web/layout.tsx`)
        ).toContain("Recovered");
        expect(report.recoveryEvidence).not.toBeNull();
        expect(
          yield* fs.exists(`${root}/.workspace-composition.lock`)
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "does not reuse approval for a subsequent operation at the same workspace",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* named;
        yield* fs.makeDirectory(`${root}/.workspace-composition.lock`);
        const blocked = yield* workspace
          .sync({ install: "skip" })
          .pipe(Effect.flip);
        if (blocked._tag !== "WorkspaceLockAuthorizationRequired") {
          return yield* Effect.die("Expected lock authorization request");
        }
        yield* workspace.sync({ breakLock: blocked.token, install: "skip" });
        yield* fs.makeDirectory(`${root}/.workspace-composition.lock`);
        yield* fs.writeFileString(
          `${root}/.workspace-composition.lock/receipt.json`,
          "another operation"
        );
        expect(
          yield* workspace
            .sync({ breakLock: blocked.token, install: "skip" })
            .pipe(Effect.flip)
        ).toMatchObject({ _tag: "WorkspaceLockChanged" });
        expect(
          yield* fs.readFileString(
            `${root}/.workspace-composition.lock/receipt.json`
          )
        ).toBe("another operation");
      }).pipe(Effect.provide(layer));
    })
);

it.effect(
  "breaks only an authorized uncertain lock, retains evidence and still protects local edits",
  () =>
    Effect.gen(function* () {
      const layer = yield* memoryWorkspace("application");
      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* named;
        yield* workspace.sync({ install: "skip" });
        const local = "export const localDraft = true;\n";
        yield* fs.writeFileString(`${root}/apps/web/layout.tsx`, local);
        yield* fs.makeDirectory(`${root}/.workspace-composition.lock`);
        yield* fs.writeFileString(
          `${root}/.workspace-composition.lock/receipt.json`,
          "unpublished evidence"
        );
        const blocked = yield* workspace
          .sync({ install: "skip" })
          .pipe(Effect.flip);
        if (blocked._tag !== "WorkspaceLockAuthorizationRequired") {
          return yield* Effect.die("Expected lock authorization request");
        }
        expect(
          yield* fs.readFileString(
            `${root}/.workspace-composition.lock/receipt.json`
          )
        ).toBe("unpublished evidence");
        expect(
          yield* workspace
            .sync({ breakLock: blocked.token, install: "skip" })
            .pipe(Effect.flip)
        ).toMatchObject({
          _tag: "WorkspaceConflict",
          paths: ["apps/web/layout.tsx"],
        });
        expect(yield* fs.readFileString(`${root}/apps/web/layout.tsx`)).toBe(
          local
        );
        const archives = yield* fs.readDirectory(
          `${root}/.workspace-composition.recovery`
        );
        const retained: string[] = [];
        for (const archive of archives) {
          retained.push(
            yield* fs.readFileString(
              `${root}/.workspace-composition.recovery/${archive}/receipt.json`
            )
          );
        }
        expect(retained).toEqual(["unpublished evidence"]);
        expect(
          yield* fs.exists(`${root}/.workspace-composition.lock`)
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
);
