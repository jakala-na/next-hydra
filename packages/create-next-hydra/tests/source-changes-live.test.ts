import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import {
  Config,
  ConfigProvider,
  Effect,
  FileSystem,
  Layer,
  Option,
  Stream,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { SourceChanges } from "../src/source-changes.ts";
import { SourceInventory } from "../src/source-inventory.ts";
import { fixture } from "./fixtures/workspace.ts";

const observation = SourceChanges.layer.pipe(
  Layer.provide(SourceInventory.layer),
  Layer.provideMerge(NodeServices.layer)
);

it.live(
  "source observation retains a configured include while it is missing or empty",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
      const { root, source } = yield* fixture("packages");
      yield* fs.copyFile(
        `${source}/packages/colors/index.ts`,
        `${source}/packages/colors/palette.ts`
      );
      yield* fs.writeFileString(
        `${root}/ignore`,
        "/packages/colors/palette.ts\n"
      );
      // Git resolves include paths relative to the containing configuration.
      expect(
        yield* processes.exitCode(
          ChildProcess.make(
            "git",
            ["config", "include.path", "../../included-config"],
            { cwd: source }
          )
        )
      ).toBe(0);
      const subscription = yield* (yield* SourceChanges).open({
        files: [],
        inputs: {
          excluded: [],
          files: [],
          packagePatterns: ["packages/*"],
          packages: ["packages/colors"],
        },
        root: source,
      });
      const next = Stream.runHead(subscription.invalidations).pipe(
        Effect.timeout("3 seconds")
      );
      const configuration = `[core]\n\texcludesFile = ${root}/ignore\n`;
      yield* fs.writeFileString(`${root}/included-config`, configuration);
      expect(Option.isSome(yield* next)).toBeTruthy();
      yield* fs.writeFileString(`${root}/included-config`, "");
      expect(Option.isSome(yield* next)).toBeTruthy();
      yield* fs.writeFileString(`${root}/included-config`, configuration);
      expect(Option.isSome(yield* next)).toBeTruthy();
    }).pipe(Effect.provide(observation)),
  { timeout: 15_000 }
);

it.live(
  "source observation follows default ignore rules and newly created global Git configuration",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
      const { root, source } = yield* fixture("packages");
      yield* fs.copyFile(
        `${source}/packages/colors/index.ts`,
        `${source}/packages/colors/palette.ts`
      );
      const environment = {
        GIT_CONFIG_GLOBAL: `${root}/global-config`,
        GIT_CONFIG_NOSYSTEM: "1",
        PATH: yield* Config.String("PATH").pipe(Config.withDefault("")),
        XDG_CONFIG_HOME: `${root}/config`,
      };
      const isolated = Layer.succeed(
        ChildProcessSpawner.ChildProcessSpawner,
        ChildProcessSpawner.make((command) =>
          processes.spawn(command.pipe(ChildProcess.setEnv(environment)))
        )
      );
      yield* Effect.gen(function* () {
        const subscription = yield* (yield* SourceChanges).open({
          files: [],
          inputs: {
            excluded: [],
            files: [],
            packagePatterns: ["packages/*"],
            packages: ["packages/colors"],
          },
          root: source,
        });
        const next = Stream.runHead(subscription.invalidations).pipe(
          Effect.timeout("3 seconds")
        );
        yield* fs.makeDirectory(`${root}/config/git`, { recursive: true });
        yield* fs.writeFileString(
          `${root}/config/git/ignore`,
          "/packages/colors/palette.ts\n"
        );
        expect(Option.isSome(yield* next)).toBeTruthy();

        // A config switch with identical visibility must replace observation
        // without inventing a source change.
        yield* fs.writeFileString(
          `${root}/replacement-ignore`,
          "/packages/colors/palette.ts\n"
        );
        yield* fs.writeFileString(
          environment.GIT_CONFIG_GLOBAL,
          `[core]\n\texcludesFile = ${root}/replacement-ignore\n`
        );
        expect(
          Option.isNone(
            yield* Stream.runHead(subscription.invalidations).pipe(
              Effect.timeoutOption("350 millis")
            )
          )
        ).toBeTruthy();
        yield* fs.writeFileString(`${root}/replacement-ignore`, "");
        expect(Option.isSome(yield* next)).toBeTruthy();
      }).pipe(
        Effect.provide(
          SourceChanges.layer.pipe(
            Layer.provide(SourceInventory.layer),
            Layer.provide(isolated),
            Layer.provide(
              ConfigProvider.layer(ConfigProvider.fromEnv({ env: environment }))
            )
          )
        )
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  { timeout: 15_000 }
);

it.live(
  "source observation discovers nested additions and their later edits",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source } = yield* fixture("application");
      const subscription = yield* (yield* SourceChanges).open({
        files: ["layout.tsx.template"],
        inputs: null,
        root: source,
      });
      const next = Stream.runHead(subscription.invalidations).pipe(
        Effect.timeout("3 seconds")
      );
      yield* fs.copy(`${source}/apps`, `${source}/new-feature`);
      expect(Option.isSome(yield* next)).toBeTruthy();
      const file = `${source}/new-feature/web/package.json`;
      const original = yield* fs.readFileString(file);
      yield* fs.writeFileString(
        file,
        original.replace('"private": true', '"private": false')
      );
      expect(Option.isSome(yield* next)).toBeTruthy();
    }).pipe(Effect.provide(observation))
);

it.live(
  "source observation excludes materialized output and credentials but retains definition edits",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source } = yield* fixture("application");
      const definition = "workspaces/configured-site/next-hydra.json";
      const subscription = yield* (yield* SourceChanges).open({
        files: ["layout.tsx.template", definition],
        inputs: null,
        root: source,
      });
      const next = Stream.runHead(subscription.invalidations);
      yield* fs.writeFileString(
        `${source}/apps/web/.env.local`,
        "EXAMPLE_VALUE=local-only"
      );
      yield* fs.copyFile(
        `${source}/layout.tsx.template`,
        `${source}/workspaces/configured-site/apps/web/page.tsx`
      );
      expect(
        Option.isNone(yield* next.pipe(Effect.timeoutOption("350 millis")))
      ).toBeTruthy();
      const original = yield* fs.readFileString(`${source}/${definition}`);
      // Change before consuming: open must already be observing and buffering.
      yield* fs.writeFileString(`${source}/${definition}`, `${original}\n`);
      expect(
        Option.isSome(yield* next.pipe(Effect.timeout("3 seconds")))
      ).toBeTruthy();
    }).pipe(Effect.provide(observation))
);

it.live(
  "source observation reports an unavailable source root as a connection failure",
  () =>
    Effect.gen(function* () {
      const { root } = yield* fixture("application");
      const error = yield* (yield* SourceChanges)
        .open({
          files: [],
          inputs: null,
          root: `${root}/missing-source`,
        })
        .pipe(Effect.flip);
      expect(error).toMatchObject({
        _tag: "SourceWatchFailure",
        phase: "connect",
      });
    }).pipe(Effect.provide(observation))
);
