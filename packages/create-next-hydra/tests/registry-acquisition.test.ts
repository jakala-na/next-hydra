import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";

import { Workspaces } from "../src/workspaces.ts";
import { liveWorkspace } from "./fixtures/live-workspace.ts";
import { fixture } from "./fixtures/workspace.ts";

it.live(
  "installs a published artifact without reading its authoring path from the local source",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { source, destination } = yield* fixture();
      const reference = yield* path.fromFileUrl(
        new URL("examples/registry/banner.json", import.meta.url)
      );
      const workspace = yield* (yield* Workspaces).fresh({
        destination,
        name: "campaign-site",
        selection: { addOns: [reference], providers: {} },
        source: { kind: "working-tree", root: source },
      });
      yield* workspace.materialize({ install: "skip" });
      expect(
        yield* fs.readFileString(`${destination}/apps/web/banner.ts`)
      ).toBe("export const banner = 'Campaign';\n");
      expect(yield* fs.exists(`${source}/remote/banner.ts`)).toBeFalsy();
    }).pipe(
      Effect.provide(liveWorkspace.pipe(Layer.provideMerge(NodeServices.layer)))
    )
);
