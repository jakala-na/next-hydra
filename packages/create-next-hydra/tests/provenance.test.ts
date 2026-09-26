import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Stdio } from "effect";
import { TestConsole } from "effect/testing";
import { applyEdits, modify } from "jsonc-parser";

import { runCommand } from "../src/commands.ts";
import { Workspaces } from "../src/workspaces.ts";
import { liveWorkspace } from "./fixtures/live-workspace.ts";
import { terminalInput } from "./fixtures/terminal.ts";
import { fixture } from "./fixtures/workspace.ts";

it.live(
  "locates a local edit using its saved source attribution when today's registry cannot be read",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source } = yield* fixture("editorial");
      const workspace = yield* (yield* Workspaces).named({
        name: "editorial-site",
        sourceRoot: source,
      });
      yield* workspace.sync({ install: "skip" });
      yield* fs.remove(`${source}/registry.json`);
      yield* fs.writeFileString(
        `${source}/workspaces/editorial-site/apps/web/article.ts`,
        "export const article = 'Local draft';\n"
      );
      const diff = yield* workspace.diff;
      expect(diff.origins).toContainEqual({
        origin: { kind: "source", owner: "editorial", source: "article.ts" },
        target: "apps/web/article.ts",
      });
      expect(diff.patch).toContain("+export const article = 'Local draft';");
      // Source-root discovery still needs the marker; its contents may be invalid.
      yield* fs.writeFileString(`${source}/registry.json`, "unfinished edit");
      yield* runCommand(
        source,
        ["compose", "editorial-site", "--diff"],
        "0.3.0"
      );
      const output = (yield* TestConsole.logLines).join("\n");
      expect(output).toContain(`${source}/article.ts`);
      expect(output).not.toContain(`${source}/blocks.ts.template`);
    }).pipe(
      Effect.provide([
        liveWorkspace.pipe(Layer.provideMerge(NodeServices.layer)),
        TestConsole.layer,
        Stdio.layerTest({}),
        terminalInput("cancel"),
      ])
    )
);

it.live(
  "refuses unsafe saved source targets without repairing or rewriting the receipt",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source } = yield* fixture("editorial");
      const workspace = yield* (yield* Workspaces).named({
        name: "editorial-site",
        sourceRoot: source,
      });
      yield* workspace.sync({ install: "skip" });
      const receipt = `${source}/workspaces/editorial-site/.workspace-composition.json`;
      const original = yield* fs.readFileString(receipt);
      const corrupt = applyEdits(
        original,
        modify(
          original,
          ["snapshot", "origins", 0, "target"],
          "../outside.ts",
          {}
        )
      );
      yield* fs.writeFileString(receipt, corrupt);
      expect(yield* workspace.diff.pipe(Effect.flip)).toMatchObject({
        _tag: "WorkspaceStateInvalid",
      });
      expect(yield* fs.readFileString(receipt)).toBe(corrupt);
    }).pipe(
      Effect.provide(liveWorkspace.pipe(Layer.provideMerge(NodeServices.layer)))
    )
);
