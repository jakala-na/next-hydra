import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Layer } from "effect";

import { Workspaces } from "../../src/workspaces.ts";
import { liveWorkspace } from "./live-workspace.ts";

const [source, ready] = process.argv.slice(2);
if (!source || !ready) {
  throw new Error("Expected source and readiness paths");
}
const platform = Layer.effect(
  FileSystem.FileSystem,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return {
      ...fs,
      writeFile: (
        file: string,
        bytes: Uint8Array,
        options?: Parameters<FileSystem.FileSystem["writeFile"]>[2]
      ) =>
        Effect.gen(function* () {
          yield* fs.writeFile(file, bytes, options);
          if (
            file === `${source}/workspaces/configured-site/apps/web/layout.tsx`
          ) {
            yield* fs.writeFileString(ready, "ready");
            return yield* Effect.never;
          }
        }),
    };
  })
).pipe(Layer.provideMerge(NodeServices.layer));

NodeRuntime.runMain(
  Effect.gen(function* () {
    const workspace = yield* (yield* Workspaces).named({
      name: "configured-site",
      sourceRoot: source,
    });
    yield* workspace.sync({ install: "skip" });
  }).pipe(Effect.provide(liveWorkspace.pipe(Layer.provide(platform))))
);
