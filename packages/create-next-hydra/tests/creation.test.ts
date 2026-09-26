import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer } from "effect";
import { TestConsole } from "effect/testing";
import { Command } from "effect/unstable/cli";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { command } from "../src/commands.ts";
import { Workspaces } from "../src/workspaces.ts";
import { liveWorkspace } from "./fixtures/live-workspace.ts";
import {
  installedApplication,
  packageManager,
} from "./fixtures/package-manager.ts";
import { fixture } from "./fixtures/workspace.ts";

const platform = Layer.effect(
  ChildProcessSpawner.ChildProcessSpawner,
  Effect.gen(function* () {
    const live = yield* ChildProcessSpawner.ChildProcessSpawner;
    const installer = yield* packageManager(installedApplication);
    return ChildProcessSpawner.make((process) =>
      process._tag === "StandardCommand" && process.command === "pnpm"
        ? installer.spawn(process)
        : live.spawn(process)
    );
  })
).pipe(Layer.provideMerge(NodeServices.layer));

it.live(
  "creates and installs from the caller's relative repository with a preset and Git opt-out",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
      const { source, destination } = yield* fixture("application");
      for (const args of [
        ["add", "."],
        [
          "-c",
          "user.name=Example",
          "-c",
          "user.email=example@localhost",
          "-c",
          "commit.gpgsign=false",
          "-c",
          "core.hooksPath=/dev/null",
          "commit",
          "-qm",
          "Authored source",
        ],
      ]) {
        if (
          (yield* processes.exitCode(
            ChildProcess.make("git", args, { cwd: source })
          )) !== 0
        ) {
          return yield* Effect.die("Cannot commit authored source");
        }
      }
      yield* Command.runWith(command(source), { version: "0.3.0" })([
        destination,
        "--yes",
        "--repo-url",
        ".",
        "--preset",
        "example/preset/site",
        "--skip-git",
      ]);
      expect(
        yield* fs.exists(`${destination}/apps/web/public/brand.svg`)
      ).toBeTruthy();
      expect(
        yield* fs.exists(
          `${destination}/apps/web/node_modules/next/package.json`
        )
      ).toBeTruthy();
      expect({
        definition: yield* fs.exists(`${destination}/next-hydra.json`),
        git: yield* fs.exists(`${destination}/.git`),
      }).toEqual({ definition: false, git: false });
      const output = (yield* TestConsole.logLines).join("\n");
      expect(yield* TestConsole.logLines).toEqual(
        expect.arrayContaining([
          "branding:\nUpload the brand assets before publishing.",
          "app-web:\nConfigure the site URL before starting the application.",
        ])
      );
      expect(output).not.toContain(
        "Configure the privacy policy before publishing."
      );
    }).pipe(
      Effect.provide([
        liveWorkspace.pipe(Layer.provideMerge(platform)),
        TestConsole.layer,
      ])
    )
);

it.live(
  "creates from a committed repository revision without consuming or changing its dirty working tree",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
      const { source, destination } = yield* fixture();
      for (const args of [
        ["add", "."],
        [
          "-c",
          "user.name=Example",
          "-c",
          "user.email=example@localhost",
          "-c",
          "commit.gpgsign=false",
          "-c",
          "core.hooksPath=/dev/null",
          "commit",
          "-qm",
          "Authored source",
        ],
      ]) {
        if (
          (yield* processes.exitCode(
            ChildProcess.make("git", args, { cwd: source })
          )) !== 0
        ) {
          return yield* Effect.die("Cannot commit authored source");
        }
      }
      yield* fs.writeFileString(
        `${source}/article.ts`,
        'export const article = "Uncommitted";\n'
      );
      const workspace = yield* (yield* Workspaces).fresh({
        destination,
        name: "revision-site",
        selection: { addOns: [], providers: { cms: "example/cms/editorial" } },
        source: { kind: "repository", ref: "HEAD", repository: source },
      });
      yield* workspace.materialize({ install: "skip" });
      expect(
        yield* fs.readFileString(`${destination}/apps/web/article.ts`)
      ).toBe('export const article = "Article";\n');
      expect(yield* fs.readFileString(`${source}/article.ts`)).toBe(
        'export const article = "Uncommitted";\n'
      );
      expect(
        yield* fs.exists(`${destination}/.workspace-composition.json`)
      ).toBeFalsy();
    }).pipe(
      Effect.provide(liveWorkspace.pipe(Layer.provideMerge(NodeServices.layer)))
    )
);

it.live("initializes application Git without committing when requested", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
    const { source, destination } = yield* fixture();
    const workspace = yield* (yield* Workspaces).fresh({
      destination,
      name: "git-site",
      selection: { addOns: [], providers: {} },
      source: { kind: "working-tree", root: source },
    });
    yield* workspace.materialize({ git: "initialize", install: "skip" });
    expect(yield* fs.exists(`${destination}/.git`)).toBeTruthy();
    expect(
      yield* processes.exitCode(
        ChildProcess.make("git", ["rev-parse", "--verify", "HEAD"], {
          cwd: destination,
          stderr: "ignore",
          stdout: "ignore",
        })
      )
    ).not.toBe(0);
    expect(
      yield* fs.exists(`${destination}/.workspace-composition.json`)
    ).toBeFalsy();
  }).pipe(
    Effect.provide(liveWorkspace.pipe(Layer.provideMerge(NodeServices.layer)))
  )
);
