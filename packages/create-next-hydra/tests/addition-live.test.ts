import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer } from "effect";
import { Command } from "effect/unstable/cli";
import { applyEdits, modify } from "jsonc-parser";

import { command } from "../src/commands.ts";
import { Workspaces } from "../src/workspaces.ts";
import { liveWorkspace } from "./fixtures/live-workspace.ts";
import { fixture } from "./fixtures/workspace.ts";

it.live(
  "discloses native environment additions without exposing values and preserves existing values",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source } = yield* fixture("registry");
      const item = yield* fs.readFileString(`${source}/banner.json`);
      yield* fs.writeFileString(
        `${source}/banner.json`,
        applyEdits(
          item,
          modify(
            item,
            ["envVars"],
            {
              CAMPAIGN_HOST: "campaign.example",
              CAMPAIGN_TOKEN: "private-registry-value",
            },
            {}
          )
        )
      );
      yield* fs.writeFileString(
        `${source}/.env.local`,
        "CAMPAIGN_TOKEN=existing-private-value\n"
      );
      const workspace = yield* (yield* Workspaces).existing({ root: source });
      const inspection = yield* workspace.inspectAdd({
        reference: "banner.json",
      });
      expect(inspection).toHaveProperty("environment", [
        "CAMPAIGN_HOST",
        "CAMPAIGN_TOKEN",
      ]);
      expect(JSON.stringify(inspection)).not.toContain("private-value");
      expect(JSON.stringify(inspection)).not.toContain(
        "private-registry-value"
      );
      yield* workspace.add({
        expected: inspection.precondition,
        overwrite: false,
        reference: "banner.json",
      });
      const environment = yield* fs.readFileString(`${source}/.env.local`);
      expect(environment).toContain("CAMPAIGN_TOKEN=existing-private-value");
      expect(environment).toContain("CAMPAIGN_HOST=campaign.example");
    }).pipe(
      Effect.provide(liveWorkspace.pipe(Layer.provideMerge(NodeServices.layer)))
    )
);

it.live(
  "installs a local registry item through the CLI and real ShadCN worker into an ordinary project",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source } = yield* fixture("registry");
      const manifest = yield* fs.readFileString(`${source}/package.json`);
      yield* Command.runWith(command(source), { version: "0.3.0" })([
        "add",
        "banner.json",
        "--yes",
      ]);
      expect(yield* fs.readFileString(`${source}/apps/web/banner.ts`)).toBe(
        "export const banner = 'Campaign';\n"
      );
      expect(yield* fs.readFileString(`${source}/package.json`)).toBe(manifest);
      expect(
        yield* fs.exists(`${source}/.workspace-composition.json`)
      ).toBeFalsy();
      expect(
        yield* fs.exists(`${source}/.workspace-composition.lock`)
      ).toBeFalsy();
    }).pipe(
      Effect.provide(liveWorkspace.pipe(Layer.provideMerge(NodeServices.layer)))
    )
);
