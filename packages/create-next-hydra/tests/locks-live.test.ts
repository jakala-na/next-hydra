import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { Workspaces } from "../src/workspaces.ts";
import { liveWorkspace } from "./fixtures/live-workspace.ts";
import { fixture } from "./fixtures/workspace.ts";

it.live(
  "blocks a second writer and requires authorization to recover after a hard crash",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
      const { source, root } = yield* fixture("application");
      const ready = `${root}/writer-ready`;
      const writer = yield* path.fromFileUrl(
        new URL("fixtures/workspace-writer.ts", import.meta.url)
      );
      const handle = yield* processes.spawn(
        ChildProcess.make(process.execPath, [writer, source, ready], {
          forceKillAfter: "100 millis",
          stderr: "inherit",
          stdout: "ignore",
        })
      );
      yield* Effect.gen(function* () {
        while (!(yield* fs.exists(ready))) {
          if (!(yield* handle.isRunning)) {
            return yield* Effect.die(
              "Writer exited before reaching application write"
            );
          }
          yield* Effect.sleep("10 millis");
        }
      }).pipe(Effect.timeout("10 seconds"));
      const workspace = yield* (yield* Workspaces).named({
        name: "configured-site",
        sourceRoot: source,
      });
      expect(
        yield* workspace.sync({ install: "skip" }).pipe(Effect.flip)
      ).toMatchObject({ _tag: "WorkspaceLockAuthorizationRequired" });
      yield* Effect.sync(() => {
        process.kill(handle.pid, "SIGKILL");
      });
      yield* handle.exitCode.pipe(Effect.exit);
      const blocked = yield* workspace
        .sync({ install: "skip" })
        .pipe(Effect.flip);
      expect(blocked).toMatchObject({
        _tag: "WorkspaceLockAuthorizationRequired",
      });
      if (blocked._tag !== "WorkspaceLockAuthorizationRequired") {
        return yield* Effect.die(
          "Expected recovery authorization after a crash"
        );
      }
      const result = yield* workspace.sync({
        breakLock: blocked.token,
        install: "skip",
      });
      expect(result.recoveryEvidence).not.toBeNull();
      expect(
        yield* fs.readFileString(
          `${source}/workspaces/configured-site/apps/web/layout.tsx`
        )
      ).toContain("Hello");
      expect((yield* workspace.diff).patch).toBe("");
    }).pipe(
      Effect.provide(liveWorkspace.pipe(Layer.provideMerge(NodeServices.layer)))
    ),
  // Includes independent Node startup, SIGKILL and another real synchronization.
  { timeout: 15_000 }
);
