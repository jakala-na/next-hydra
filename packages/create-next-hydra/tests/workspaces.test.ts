import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, PlatformError, Schema } from "effect";
import { TestConsole } from "effect/testing";
import { Command } from "effect/unstable/cli";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { parse } from "jsonc-parser";
import { vi } from "vitest";
import { parse as parseYaml } from "yaml";

import { command } from "../src/commands.ts";
import { Composition } from "../src/composition.ts";
import { Shadcn } from "../src/shadcn.ts";
import { SourceChanges } from "../src/source-changes.ts";
import { SourceInventory } from "../src/source-inventory.ts";
import { WorkspaceDependencies } from "../src/workspace-dependencies.ts";
import { WorkspaceFiles } from "../src/workspace-files.ts";
import { WorkspaceSnapshots } from "../src/workspace-snapshots.ts";
import { WorkspaceSources } from "../src/workspace-sources.ts";
import { WorkspaceState } from "../src/workspace-state.ts";
import { Workspaces } from "../src/workspaces.ts";
import { packageManager } from "./fixtures/package-manager.ts";
import { fixture } from "./fixtures/workspace.ts";

const platform = NodeServices.layer;
const registry = Shadcn.layer(
  new URL("../src/shadcn-worker.ts", import.meta.url)
);
const composition = Composition.layer.pipe(
  Layer.provide(registry),
  Layer.provide(SourceInventory.layer),
  Layer.provide(platform)
);
const workspaceServices = Workspaces.layer.pipe(
  Layer.provide([
    registry,
    WorkspaceState.layer,
    SourceChanges.layer,
    WorkspaceSnapshots.layer,
    WorkspaceFiles.layer,
    WorkspaceDependencies.layer,
  ]),
  Layer.provide(composition),
  Layer.provide(WorkspaceSources.layer),
  Layer.provide(SourceInventory.layer)
);
const workspaces = workspaceServices.pipe(Layer.provide(platform));
const testLayer = Layer.merge(platform, workspaces);

it.live(
  "discovers visible workspace definitions without parsing them or reviving deleted files",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
      const { source } = yield* fixture("application");
      const staged = yield* processes.exitCode(
        ChildProcess.make(
          "git",
          ["add", "workspaces/configured-site/next-hydra.json"],
          { cwd: source }
        )
      );
      if (staged !== 0) {
        return yield* Effect.die("Could not track the workspace definition");
      }
      yield* fs.writeFileString(
        `${source}/.gitignore`,
        "/workspaces/configured-site/\n/workspaces/enhanced-site/\n"
      );
      yield* fs.writeFileString(
        `${source}/workspaces/editorial-site/next-hydra.json`,
        "unfinished edit"
      );
      const api = yield* Workspaces;
      // Tracked-but-ignored and untracked-visible definitions both participate.
      expect(yield* api.discover(source)).toEqual([
        { name: "configured-site", sourceRoot: source },
        { name: "editorial-site", sourceRoot: source },
      ]);
      yield* fs.remove(`${source}/workspaces/configured-site/next-hydra.json`);
      expect(yield* api.discover(source)).toEqual([
        { name: "editorial-site", sourceRoot: source },
      ]);
    }).pipe(Effect.provide(testLayer))
);

it.live(
  "isolates snapshots from the checkout index selected by the invoking shell",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
      const { source } = yield* fixture("application");
      const added = yield* processes.exitCode(
        ChildProcess.make("git", ["add", "layout.tsx.template"], {
          cwd: source,
        })
      );
      if (added !== 0) {
        return yield* Effect.die(
          new Error("Could not stage authored template")
        );
      }
      const indexPath = `${source}/.git/index`;
      const index = yield* fs.readFile(indexPath);
      vi.stubEnv("GIT_INDEX_FILE", indexPath);
      yield* Effect.addFinalizer(() => Effect.sync(() => vi.unstubAllEnvs()));
      const workspace = yield* (yield* Workspaces).named({
        name: "configured-site",
        sourceRoot: source,
      });
      yield* workspace.sync({ install: "skip" });
      const first = yield* workspace.diff;
      yield* workspace.sync({ install: "skip" });
      expect(yield* workspace.diff).toMatchObject({
        patch: "",
        snapshot: first.snapshot,
      });
      expect(yield* fs.readFile(indexPath)).toEqual(index);
    }).pipe(Effect.provide(testLayer)),
  // Two real ShadCN workers and Git snapshots run under the full suite's load.
  { timeout: 15_000 }
);

it.live(
  "preserves exact snapshot bytes despite application attributes and treats filenames literally",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source } = yield* fixture("packages");
      yield* fs.writeFileString(
        `${source}/packages/tokens/.gitattributes`,
        "* text eol=lf ident\n"
      );
      yield* fs.writeFileString(
        `${source}/packages/tokens/literal[1].txt`,
        "first\r\n$Id$\r\n"
      );
      const workspace = yield* (yield* Workspaces).named({
        name: "editorial-site",
        sourceRoot: source,
      });
      yield* workspace.sync({ install: "skip" });
      expect((yield* workspace.diff).patch).toBe("");
      const file = `${source}/workspaces/editorial-site/packages/tokens/literal[1].txt`;
      yield* fs.writeFileString(file, "first\n$Id$\n");
      yield* fs.chmod(file, 0o755);
      const report = yield* workspace.diff;
      expect(report.changes).toEqual([
        { status: "M", target: "packages/tokens/literal[1].txt" },
      ]);
      expect(report.patch).toContain("-first\r\n");
      expect(report.patch).toContain("new mode 100755");
    }).pipe(Effect.provide(testLayer))
);

it.live(
  "retains the previous snapshot when new owned files apply but installation fails",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const real = yield* ChildProcessSpawner.ChildProcessSpawner;
      const installer = yield* packageManager(() => Effect.succeed(13));
      const { source } = yield* fixture("application");
      const directory = `${source}/workspaces/configured-site`;
      const workspace = yield* (yield* Workspaces).named({
        name: "configured-site",
        sourceRoot: source,
      });
      yield* workspace.sync({ install: "skip" });
      const previous = yield* workspace.diff;
      yield* fs.writeFile(
        `${directory}/next-hydra.json`,
        yield* fs.readFile(`${source}/workspaces/enhanced-site/next-hydra.json`)
      );
      const processes = ChildProcessSpawner.make((execution) =>
        execution._tag === "StandardCommand" && execution.command === "pnpm"
          ? installer.spawn(execution)
          : real.spawn(execution)
      );
      const failure = yield* Workspaces.pipe(
        Effect.flatMap((api) =>
          api.named({ name: "configured-site", sourceRoot: source })
        ),
        Effect.flatMap((handle) => handle.sync({})),
        Effect.provide(
          workspaceServices.pipe(
            Layer.provide(
              Layer.merge(
                platform,
                Layer.succeed(
                  ChildProcessSpawner.ChildProcessSpawner,
                  processes
                )
              )
            ),
            Layer.fresh
          )
        ),
        Effect.flip
      );
      expect(failure).toMatchObject({
        _tag: "DependencyInstallationFailed",
        phase: "exit",
      });
      const report = yield* workspace.diff;
      expect(report).toMatchObject({
        incomplete: true,
        snapshot: previous.snapshot,
        unregisteredFiles: [],
      });
      expect(report.changes).toContainEqual({
        status: "A",
        target: "apps/web/controls.tsx",
      });
      yield* fs.writeFileString(
        `${directory}/apps/web/controls.tsx`,
        "Keep this edit to newly applied source\n"
      );
      expect(
        yield* workspace.sync({ install: "skip" }).pipe(Effect.flip)
      ).toMatchObject({ _tag: "WorkspaceConflict" });
    }).pipe(Effect.provide(testLayer))
);

it.live(
  "distinguishes missing ownership from a missing snapshot without resetting either",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source } = yield* fixture("application");
      const workspace = yield* (yield* Workspaces).named({
        name: "configured-site",
        sourceRoot: source,
      });
      expect(yield* workspace.diff.pipe(Effect.flip)).toMatchObject({
        _tag: "WorkspaceUninitialized",
      });
      yield* workspace.sync({ install: "skip" });
      const root = `${source}/workspaces/configured-site`;
      const receipt = yield* fs.readFile(`${root}/.workspace-composition.json`);
      yield* fs.remove(`${source}/.cache/workspace-snapshots`, {
        recursive: true,
      });
      expect(yield* workspace.diff.pipe(Effect.flip)).toMatchObject({
        _tag: "SnapshotUnavailable",
      });
      yield* fs.writeFileString(
        `${root}/apps/web/layout.tsx`,
        "Keep this local draft\n"
      );
      expect(
        yield* workspace.sync({ install: "skip" }).pipe(Effect.flip)
      ).toMatchObject({ _tag: "WorkspaceConflict" });
      expect(yield* fs.readFile(`${root}/.workspace-composition.json`)).toEqual(
        receipt
      );
    }).pipe(Effect.provide(testLayer))
);

it.live(
  "keeps the receipt-selected baseline when an edit prevents publication after Git capture",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const real = yield* ChildProcessSpawner.ChildProcessSpawner;
      const { source } = yield* fixture("application");
      const directory = `${source}/workspaces/configured-site`;
      const workspace = yield* (yield* Workspaces).named({
        name: "configured-site",
        sourceRoot: source,
      });
      yield* workspace.sync({ install: "skip" });
      const previous = yield* workspace.diff;
      yield* fs.writeFileString(
        `${source}/layout.tsx.template`,
        (yield* fs.readFileString(`${source}/layout.tsx.template`)).replace(
          "Hello",
          "Updated"
        )
      );
      const processes = ChildProcessSpawner.make((execution) =>
        Effect.gen(function* () {
          const handle = yield* real.spawn(execution);
          if (
            execution._tag !== "StandardCommand" ||
            execution.command !== "git" ||
            !execution.args.includes("update-ref")
          ) {
            return handle;
          }
          return ChildProcessSpawner.makeHandle({
            ...handle,
            exitCode: handle.exitCode.pipe(
              Effect.tap(() =>
                fs.writeFileString(
                  `${directory}/apps/web/layout.tsx`,
                  "Local edit during publication\n"
                )
              )
            ),
          });
        })
      );
      const failure = yield* Workspaces.pipe(
        Effect.flatMap((api) =>
          api.named({ name: "configured-site", sourceRoot: source })
        ),
        Effect.flatMap((handle) => handle.sync({ install: "skip" })),
        Effect.provide(
          workspaceServices.pipe(
            Layer.provide(
              Layer.merge(
                platform,
                Layer.succeed(
                  ChildProcessSpawner.ChildProcessSpawner,
                  processes
                )
              )
            ),
            Layer.fresh
          )
        ),
        Effect.flip
      );
      expect(failure).toMatchObject({ _tag: "WorkspaceConflict" });
      const report = yield* workspace.diff;
      expect(report).toMatchObject({
        incomplete: true,
        snapshot: previous.snapshot,
      });
      expect(report.patch).toContain("-  return <main>Hello</main>;");
      expect(report.patch).toContain("+Local edit during publication");
      expect(
        yield* workspace.sync({ install: "skip" }).pipe(Effect.flip)
      ).toMatchObject({ _tag: "WorkspaceConflict" });
    }).pipe(Effect.provide(testLayer))
);

it.live(
  "keeps Diff read-only and recovers a stopped refresh through the CLI",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source } = yield* fixture("application");
      const directory = `${source}/workspaces/configured-site`;
      const workspace = yield* (yield* Workspaces).named({
        name: "configured-site",
        sourceRoot: source,
      });
      yield* workspace.sync({ install: "skip" });
      const previous = yield* workspace.diff;
      const original = yield* fs.readFile(`${directory}/apps/web/layout.tsx`);
      yield* fs.writeFileString(
        `${source}/layout.tsx.template`,
        (yield* fs.readFileString(`${source}/layout.tsx.template`)).replace(
          "Hello",
          "Updated"
        )
      );
      const denied = {
        ...fs,
        rename: (from: string, to: string) =>
          to === `${directory}/apps/web/layout.tsx`
            ? Effect.fail(
                PlatformError.systemError({
                  _tag: "PermissionDenied",
                  method: "rename",
                  module: "FileSystem",
                  pathOrDescriptor: to,
                })
              )
            : fs.rename(from, to),
      };
      const failed = yield* Workspaces.pipe(
        Effect.flatMap((api) =>
          api.named({ name: "configured-site", sourceRoot: source })
        ),
        Effect.flatMap((handle) => handle.sync({ install: "skip" })),
        Effect.provide(
          workspaceServices.pipe(
            Layer.provide(
              Layer.merge(
                platform,
                Layer.succeed(FileSystem.FileSystem, denied)
              )
            ),
            Layer.fresh
          )
        ),
        Effect.flip
      );
      expect(failed).toMatchObject({ _tag: "MaterializationFailed" });
      yield* fs.writeFileString(
        `${directory}/apps/web/layout.tsx`,
        "Local edit after failed update\n"
      );
      const receipt = yield* fs.readFile(
        `${directory}/.workspace-composition.json`
      );
      const report = yield* workspace.diff;
      expect(report).toMatchObject({
        incomplete: true,
        snapshot: previous.snapshot,
        unregisteredFiles: [],
      });
      expect(report.patch).toContain("+Local edit after failed update");
      expect(
        yield* fs.readFile(`${directory}/.workspace-composition.json`)
      ).toEqual(receipt);
      // Restore this test's local draft before explicitly asking the CLI to sync.
      yield* fs.writeFile(`${directory}/apps/web/layout.tsx`, original);
      yield* Command.runWith(command(source), { version: "0.3.0" })([
        "compose",
        "configured-site",
        "--no-install",
      ]);
      expect({
        diff: yield* workspace.diff,
        layout: yield* fs.readFileString(`${directory}/apps/web/layout.tsx`),
      }).toMatchObject({
        diff: { changes: [], incomplete: false, patch: "" },
        layout:
          "export function Layout() {\n  return <main>Updated</main>;\n}\n",
      });
    }).pipe(Effect.provide(testLayer))
);

it.live("shows a patch through the CLI without synchronizing", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { source } = yield* fixture("application");
    const run = Command.runWith(command(source), { version: "0.3.0" });
    yield* run(["compose", "configured-site", "--no-install"]);
    const file = `${source}/workspaces/configured-site/apps/web/layout.tsx`;
    yield* fs.writeFileString(file, "export const localDraft = true;\n");
    yield* run(["compose", "configured-site", "--diff"]);
    expect((yield* TestConsole.logLines).join("\n")).toContain(
      "+export const localDraft = true;"
    );
    expect(yield* fs.readFileString(file)).toBe(
      "export const localDraft = true;\n"
    );
  }).pipe(Effect.provide(Layer.merge(testLayer, TestConsole.layer)))
);

it.live(
  "compares local edits with the saved composition without requiring a valid definition",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source } = yield* fixture("application");
      const root = `${source}/workspaces/configured-site`;
      const workspace = yield* (yield* Workspaces).named({
        name: "configured-site",
        sourceRoot: source,
      });
      yield* workspace.sync({ install: "skip" });
      yield* fs.writeFileString(
        `${root}/apps/web/new-component.tsx`,
        "Do not store this unregistered draft\n"
      );
      yield* workspace.sync({ install: "skip" });
      yield* fs.writeFileString(
        `${root}/apps/web/layout.tsx`,
        "export const localDraft = true;\n"
      );
      yield* fs.writeFileString(
        `${root}/apps/web/.env.local`,
        "SECRET=never-snapshot-this\n"
      );
      yield* fs.writeFileString(
        `${root}/next-hydra.json`,
        "{broken definition"
      );
      const receipt = yield* fs.readFile(`${root}/.workspace-composition.json`);
      const report = yield* workspace.diff;
      expect(report.patch).toContain("+export const localDraft = true;");
      expect(report.patch).not.toMatch(
        /never-snapshot-this|unregistered draft/u
      );
      expect(report.unregisteredFiles).toEqual(["apps/web/new-component.tsx"]);
      expect(report.incomplete).toBeFalsy();
      expect(yield* fs.readFile(`${root}/.workspace-composition.json`)).toEqual(
        receipt
      );
    }).pipe(Effect.provide(testLayer))
);

it.live(
  "fails Check with actionable findings without refreshing the application",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source } = yield* fixture("application");
      const root = `${source}/workspaces/configured-site`;
      const run = Command.runWith(command(source), { version: "0.3.0" });
      yield* run(["compose", "configured-site", "--no-install"]);
      const receipt = yield* fs.readFile(`${root}/.workspace-composition.json`);
      const layout = yield* fs.readFile(`${root}/apps/web/layout.tsx`);
      yield* fs.writeFileString(
        `${source}/layout.tsx.template`,
        (yield* fs.readFileString(`${source}/layout.tsx.template`)).replace(
          "Hello",
          "Welcome"
        )
      );
      expect(
        yield* run(["compose", "configured-site", "--check"]).pipe(Effect.flip)
      ).toMatchObject({ _tag: "WorkspaceNotCurrent" });
      expect((yield* TestConsole.logLines).join("\n")).toContain(
        "update: apps/web/layout.tsx"
      );
      expect(yield* fs.readFile(`${root}/apps/web/layout.tsx`)).toEqual(layout);
      expect(yield* fs.readFile(`${root}/.workspace-composition.json`)).toEqual(
        receipt
      );
    }).pipe(Effect.provide(Layer.merge(testLayer, TestConsole.layer)))
);

it.live("locates the canonical source resolved by an included registry", () =>
  Effect.gen(function* () {
    const { source } = yield* fixture("included");
    const workspace = yield* (yield* Workspaces).named({
      name: "editorial-site",
      sourceRoot: source,
    });
    const report = yield* workspace.explain("apps/web/article.ts");
    expect(report.files).toEqual([
      {
        origin: {
          kind: "source",
          owner: "article",
          source: "editorial/article.ts",
        },
        target: "apps/web/article.ts",
      },
    ]);
    expect(
      yield* (yield* FileSystem.FileSystem).exists(
        `${source}/workspaces/editorial-site/apps/web/article.ts`
      )
    ).toBeFalsy();
  }).pipe(Effect.provide(testLayer))
);

it.live("lists selected origins when the command omits an Explain file", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { source } = yield* fixture("application");
    yield* Command.runWith(command(source), { version: "0.3.0" })([
      "compose",
      "--explain",
      "configured-site",
    ]);
    const output = (yield* TestConsole.logLines).join("\n");
    expect(output).toContain(
      `apps/web/layout.tsx\n  template: ${source}/layout.tsx.template (app-web)`
    );
    expect(output).toContain(
      `apps/web/package.json\n  source: ${source}/apps/web/package.json (app-web)`
    );
    expect(output).not.toContain("apps/web/controls.tsx");
    expect(
      yield* fs.exists(
        `${source}/workspaces/configured-site/apps/web/layout.tsx`
      )
    ).toBeFalsy();
  }).pipe(Effect.provide(Layer.merge(testLayer, TestConsole.layer)))
);

it.live("explains one file through the command without composing it", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const { source } = yield* fixture("application");
    yield* Command.runWith(command(source), { version: "0.3.0" })([
      "compose",
      "configured-site",
      "--explain",
      "apps/web/layout.tsx",
    ]);
    const output = (yield* TestConsole.logLines).join("\n");
    expect(output).toContain(
      `apps/web/layout.tsx\n  template: ${source}/layout.tsx.template (app-web)`
    );
    expect(output).not.toContain("apps/web/package.json");
    expect(
      yield* fs.exists(
        `${source}/workspaces/configured-site/apps/web/layout.tsx`
      )
    ).toBeFalsy();
    expect(
      yield* fs.exists(
        `${source}/workspaces/configured-site/.workspace-composition.json`
      )
    ).toBeFalsy();
  }).pipe(Effect.provide(Layer.merge(testLayer, TestConsole.layer)))
);

it.live(
  "copies ignored environment files through the command with checkout precedence and primary-worktree fallback",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
      const { source, root } = yield* fixture("application");
      const primary = yield* fs.readFile(
        `${source}/local-environment/primary.env.example`
      );
      const checkout = yield* fs.readFile(
        `${source}/local-environment/checkout.env.example`
      );
      const git = (args: readonly string[]) =>
        processes
          .exitCode(
            ChildProcess.make("git", args, { cwd: source, stderr: "ignore" })
          )
          .pipe(
            Effect.flatMap((code) =>
              code === 0
                ? Effect.void
                : Effect.die(new Error(`Example Git setup failed: ${code}`))
            )
          );
      yield* fs.writeFileString(
        `${source}/.gitignore`,
        ".env\n.env.*\n!.env.example\n"
      );
      yield* fs.writeFile(`${source}/apps/web/.env.production.local`, primary);
      yield* git(["add", "."]);
      yield* git(["add", "-f", "apps/web/.env.production.local"]);
      yield* git([
        "-c",
        "user.name=Example",
        "-c",
        "user.email=example@example.com",
        "-c",
        "commit.gpgsign=false",
        "commit",
        "-qm",
        "Authored example",
      ]);
      const secondary = `${root}/secondary`;
      yield* git(["worktree", "add", "--detach", secondary]);
      yield* fs.writeFile(`${source}/.env`, primary);
      yield* fs.writeFile(`${source}/apps/web/.env.local`, primary);
      yield* fs.writeFile(`${secondary}/apps/web/.env.local`, checkout);
      yield* fs.writeFile(`${secondary}/apps/web/.env.sample`, primary);
      yield* fs.makeDirectory(`${secondary}/apps/web/.next/cache`, {
        recursive: true,
      });
      yield* fs.writeFile(
        `${secondary}/apps/web/.next/cache/.env.local`,
        primary
      );
      yield* Command.runWith(command(secondary), { version: "0.3.0" })([
        "compose",
        "editorial-site",
        "--no-install",
        "--copy-env",
      ]);
      const destination = `${secondary}/workspaces/editorial-site`;
      expect(yield* fs.readFile(`${destination}/apps/web/.env.local`)).toEqual(
        checkout
      );
      expect(yield* fs.readFile(`${destination}/.env`)).toEqual(primary);
      expect(
        (yield* fs.stat(`${destination}/apps/web/.env.local`)).mode % 0o1000
      ).toBe(0o600);
      expect(
        yield* Effect.all([
          fs.exists(`${destination}/apps/web/.env.production.local`),
          fs.exists(`${destination}/apps/web/.env.sample`),
          fs.exists(`${destination}/apps/web/.next`),
        ])
      ).toEqual([false, false, false]);
    }).pipe(Effect.provide(testLayer))
);

it.live(
  "composes beside committed settings through the live command without replacing them",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source } = yield* fixture("application");
      const root = `${source}/workspaces/configured-site`;
      const deployment = yield* fs.readFile(`${root}/apps/web/vercel.json`);
      yield* Command.runWith(command(source), { version: "0.3.0" })([
        "compose",
        "configured-site",
        "--no-install",
      ]);
      expect(yield* fs.readFile(`${root}/apps/web/vercel.json`)).toEqual(
        deployment
      );
      expect(yield* fs.readFileString(`${root}/.gitignore`)).toBe("");
      expect(yield* fs.readFileString(`${root}/apps/web/layout.tsx`)).toBe(
        "export function Layout() {\n  return <main>Hello</main>;\n}\n"
      );
    }).pipe(Effect.provide(testLayer))
);

it.live(
  "gives fresh projects Git defaults that track application source but exclude local environment and build files",
  () =>
    Effect.gen(function* () {
      const { source, destination } = yield* fixture("application");
      const workspace = yield* (yield* Workspaces).fresh({
        destination,
        name: "garden-site",
        selection: { addOns: [], providers: {} },
        source: { kind: "working-tree", root: source },
      });
      yield* workspace.materialize({ install: "skip" });
      const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
      yield* processes.string(
        ChildProcess.make("git", ["init", "-q"], { cwd: destination })
      );
      const ignored = yield* processes.string(
        ChildProcess.make(
          "git",
          [
            "check-ignore",
            "--no-index",
            "--",
            "package.json",
            "pnpm-lock.yaml",
            "apps/web/layout.tsx",
            "apps/web/.env.example",
            ".env.local",
            ".turbo/build",
            "node_modules/library/index.js",
          ],
          { cwd: destination }
        )
      );
      expect(ignored.trim().split("\n")).toEqual([
        ".env.local",
        ".turbo/build",
        "node_modules/library/index.js",
      ]);
    }).pipe(Effect.provide(testLayer))
);

it.live(
  "seeds Git visibility that exposes workspace settings and hides materialized source",
  () =>
    Effect.gen(function* () {
      const { source } = yield* fixture("application");
      yield* Command.runWith(command(source), { version: "0.3.0" })([
        "compose",
        "editorial-site",
        "--no-install",
      ]);
      const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
      const ignored = yield* processes.string(
        ChildProcess.make(
          "git",
          [
            "check-ignore",
            "--no-index",
            "--",
            "workspaces/editorial-site/package.json",
            "workspaces/editorial-site/apps/web/layout.tsx",
            "workspaces/editorial-site/next-hydra.json",
            "workspaces/editorial-site/.gitignore",
            "workspaces/editorial-site/apps/web/vercel.json",
          ],
          { cwd: source }
        )
      );
      expect(ignored.trim().split("\n")).toEqual([
        "workspaces/editorial-site/package.json",
        "workspaces/editorial-site/apps/web/layout.tsx",
      ]);
    }).pipe(Effect.provide(testLayer))
);

it.live(
  "initializes an application with layout, configuration and content bindings through the live CLI command",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source } = yield* fixture("application");
      yield* Command.runWith(command(source), { version: "0.3.0" })([
        "compose",
        "enhanced-site",
        "--no-install",
      ]);
      const root = `${source}/workspaces/enhanced-site`;
      expect(
        yield* fs.readFileString(`${root}/apps/web/configuration.ts`)
      ).toBe(
        'import { configure } from "./configuration-support";\nimport { keys } from "./configuration-support";\n\nexport const config = configure({ features: [keys()] });\n'
      );
      expect(yield* fs.readFileString(`${root}/apps/web/query.ts`)).toBe(
        'import { HeroFields as HeroDocument } from "./hero-fragment";\n\nexport const document = `query Content { content { ...HeroFields } }`;\nexport const fragments = [HeroDocument];\n'
      );
      expect(yield* fs.readFileString(`${root}/apps/web/controls.tsx`)).toBe(
        yield* fs.readFileString(`${source}/controls.tsx`)
      );
      expect(yield* fs.readFileString(`${root}/apps/web/.env.example`)).toBe(
        "NEXT_PUBLIC_SITE_URL=http://web.enhanced-site.localhost:1355\nNEXT_PUBLIC_OTHER_URL=http://other-web.localhost:1355\n"
      );
      const settings: unknown = parseYaml(
        yield* fs.readFileString(`${root}/pnpm-workspace.yaml`)
      );
      expect({
        asset: yield* fs.readFile(`${root}/apps/web/public/brand.svg`),
        patch: yield* fs.readFile(`${root}/patches/client.patch`),
        settings,
        tracking: yield* fs.readFileString(`${root}/apps/web/tracking.ts`),
      }).toMatchObject({
        asset: yield* fs.readFile(`${source}/brand.svg`),
        patch: yield* fs.readFile(`${source}/client.patch`),
        settings: {
          patchedDependencies: {
            "example-client@1.0.0": "patches/client.patch",
          },
        },
        tracking: 'export const tracking = "enabled";\n',
      });
    }).pipe(Effect.provide(testLayer))
);

it.live(
  "materializes provider package and TypeScript bindings through the live CLI command",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source } = yield* fixture("bindings");
      yield* Command.runWith(command(source), { version: "0.3.0" })([
        "compose",
        "editorial-site",
        "--no-install",
      ]);
      const root = `${source}/workspaces/editorial-site`;
      const manifest = yield* fs
        .readFileString(`${root}/apps/web/package.json`)
        .pipe(
          Effect.flatMap(
            Schema.decodeEffect(
              Schema.fromJsonString(
                Schema.Struct({
                  dependencies: Schema.Record(Schema.String, Schema.String),
                })
              )
            )
          )
        );
      expect(manifest.dependencies).toEqual({
        "@repo/cms": "workspace:@example/editorial@*",
        next: "16.3.1",
      });
      const config: unknown = parse(
        yield* fs.readFileString(`${root}/apps/web/tsconfig.json`)
      );
      expect(config).toMatchObject({
        compilerOptions: {
          paths: {
            "@repo/cms": ["../../packages/editorial"],
            "@repo/cms/*": ["../../packages/editorial/*"],
          },
        },
      });
      expect(yield* fs.readFileString(`${root}/packages/tokens/index.ts`)).toBe(
        'export const color = "blue";\n'
      );
      expect(yield* fs.exists(`${root}/packages/archive`)).toBeFalsy();
    }).pipe(Effect.provide(testLayer))
);

it.live(
  "composes conditional and nested recipe files through the live registry adapter",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source } = yield* fixture("conditional");
      yield* Command.runWith(command(source), { version: "0.3.0" })([
        "compose",
        "editorial-site",
        "--no-install",
      ]);
      const output = `${source}/workspaces/editorial-site/apps/web`;
      expect(yield* fs.readFileString(`${output}/product-collection.ts`)).toBe(
        'export const productCollection = "Product collection";\n'
      );
      expect(yield* fs.readFileString(`${output}/account-catalog.ts`)).toBe(
        'export const accountCatalog = "Account catalog";\n'
      );
      expect(yield* fs.readFileString(`${output}/blocks.ts`)).toBe(
        'import { article } from "./article";\nimport { productCollection } from "./product-collection";\n\nexport const blocks = [article, productCollection];\n'
      );
    }).pipe(Effect.provide(testLayer))
);

it.live(
  "includes transitive internal packages required by a selected application",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { source, destination } = yield* fixture("packages");
      const api = yield* Workspaces;
      const workspace = yield* api.fresh({
        destination,
        name: "tokens-example",
        selection: { addOns: [], providers: {} },
        source: { kind: "working-tree", root: source },
      });
      yield* workspace.materialize({ install: "skip" });
      expect(
        yield* fs.readFileString(
          path.join(destination, "packages/colors/index.ts")
        )
      ).toBe('export const primary = "blue";\n');
      expect(
        yield* fs.exists(path.join(destination, "packages/tokens/package.json"))
      ).toBeTruthy();
      expect(
        yield* fs.exists(path.join(destination, "packages/colors/.env.local"))
      ).toBeFalsy();
    }).pipe(Effect.provide(testLayer))
);

it.live(
  "initializes a definition through compose without installing dependencies",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { source } = yield* fixture();
      const destination = path.join(source, "workspaces", "editorial-site");
      const definition = yield* fs.readFileString(
        path.join(destination, "next-hydra.json")
      );
      yield* Command.runWith(command(source), { version: "0.3.0" })([
        "compose",
        "editorial-site",
        "--no-install",
      ]);
      expect(
        yield* fs.readFileString(path.join(destination, "apps/web/article.ts"))
      ).toBe('export const article = "Article";\n');
      expect(
        yield* fs.readFileString(path.join(destination, "next-hydra.json"))
      ).toBe(definition);
      expect(
        yield* fs.exists(path.join(destination, "node_modules"))
      ).toBeFalsy();
    }).pipe(Effect.provide(testLayer))
);

it.live(
  "preserves an existing destination when initialization is refused",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source, destination } = yield* fixture();
      yield* fs.makeDirectory(destination);
      yield* fs.writeFileString(`${destination}/notes.md`, "Keep my work");
      const api = yield* Workspaces;
      const workspace = yield* api.fresh({
        destination,
        name: "example",
        selection: { addOns: [], providers: {} },
        source: { kind: "working-tree", root: source },
      });
      const error = yield* workspace
        .materialize({ install: "skip" })
        .pipe(Effect.flip);
      expect(error._tag).toBe("DestinationNotEmpty");
      expect(yield* fs.readDirectory(destination)).toEqual(["notes.md"]);
      expect(yield* fs.readFileString(`${destination}/notes.md`)).toBe(
        "Keep my work"
      );
    }).pipe(Effect.provide(testLayer))
);

it.live(
  "does not publish output when a selected source changes during preparation",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source, destination } = yield* fixture();
      const changingRegistry = Layer.effect(
        Shadcn,
        Effect.gen(function* () {
          const live = yield* Shadcn;
          return Shadcn.of({
            ...live,
            loadRegistryItem: (name, options) =>
              Effect.gen(function* () {
                yield* fs
                  .writeFileString(
                    `${source}/article.ts`,
                    'export const article = "Edited";\n'
                  )
                  .pipe(Effect.orDie);
                return yield* live.loadRegistryItem(name, options);
              }),
          });
        })
      ).pipe(
        Layer.provide(
          Shadcn.layer(new URL("../src/shadcn-worker.ts", import.meta.url))
        ),
        Layer.provide(platform)
      );
      const changedComposition = Composition.layer.pipe(
        Layer.provide(changingRegistry),
        Layer.provide(SourceInventory.layer),
        Layer.provide(platform)
      );
      const changedWorkspaces = Workspaces.layer.pipe(
        Layer.provide([
          registry,
          WorkspaceState.layer,
          SourceChanges.layer,
          WorkspaceSnapshots.layer,
          WorkspaceFiles.layer,
          WorkspaceDependencies.layer,
        ]),
        Layer.provide(changedComposition),
        Layer.provide(WorkspaceSources.layer),
        Layer.provide(SourceInventory.layer),
        Layer.provide(platform)
      );
      const error = yield* Effect.gen(function* () {
        const api = yield* Workspaces;
        const workspace = yield* api.fresh({
          destination,
          name: "example",
          selection: {
            addOns: [],
            providers: { cms: "example/cms/editorial" },
          },
          source: { kind: "working-tree", root: source },
        });
        return yield* workspace
          .materialize({ install: "skip" })
          .pipe(Effect.flip);
      }).pipe(Effect.provide(changedWorkspaces));
      expect(error).toMatchObject({
        _tag: "SourceChanged",
        paths: ["article.ts"],
      });
      expect(yield* fs.exists(destination)).toBeFalsy();
      expect(yield* fs.readFileString(`${source}/article.ts`)).toBe(
        'export const article = "Edited";\n'
      );
    }).pipe(Effect.provide(platform))
);

it.live(
  "rejects selecting an ordinary recipe as a CMS provider before writing output",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source, destination } = yield* fixture();
      const api = yield* Workspaces;
      const workspace = yield* api.fresh({
        destination,
        name: "example",
        selection: { addOns: [], providers: { cms: "web" } },
        source: { kind: "working-tree", root: source },
      });
      const error = yield* workspace
        .materialize({ install: "skip" })
        .pipe(Effect.flip);
      expect(error._tag).toBe("InvalidComposition");
      expect(yield* fs.exists(destination)).toBeFalsy();
    }).pipe(Effect.provide(testLayer))
);

it.live(
  "leaves the destination absent when a selected registry source is missing",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source, destination } = yield* fixture();
      yield* fs.remove(`${source}/article.ts`);
      const api = yield* Workspaces;
      const workspace = yield* api.fresh({
        destination,
        name: "example",
        selection: { addOns: [], providers: { cms: "example/cms/editorial" } },
        source: { kind: "working-tree", root: source },
      });
      const error = yield* workspace
        .materialize({ install: "skip" })
        .pipe(Effect.flip);
      expect(error).toMatchObject({
        _tag: "PlatformError",
        reason: { _tag: "NotFound" },
      });
      expect(yield* fs.exists(destination)).toBeFalsy();
      expect(yield* fs.exists(`${source}/registry.json`)).toBeTruthy();
    }).pipe(Effect.provide(testLayer))
);

it.live(
  "reports a destination write failure without claiming complete materialization",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source, destination } = yield* fixture();
      const deniedFile = `${destination}/apps/web/article.ts`;
      const destinationFs = Layer.succeed(FileSystem.FileSystem, {
        ...fs,
        writeFile: (file, data, options) =>
          file === deniedFile
            ? Effect.fail(
                PlatformError.systemError({
                  _tag: "PermissionDenied",
                  method: "writeFile",
                  module: "FileSystem",
                  pathOrDescriptor: file,
                })
              )
            : fs.writeFile(file, data, options),
      });
      const failedWorkspaces = Workspaces.layer.pipe(
        Layer.provide([
          registry,
          WorkspaceState.layer,
          SourceChanges.layer,
          WorkspaceSnapshots.layer,
          WorkspaceFiles.layer,
          WorkspaceDependencies.layer,
        ]),
        Layer.provide(composition),
        Layer.provide(WorkspaceSources.layer),
        Layer.provide(SourceInventory.layer),
        Layer.provide(destinationFs),
        Layer.provide(platform)
      );
      const error = yield* Effect.gen(function* () {
        const api = yield* Workspaces;
        const workspace = yield* api.fresh({
          destination,
          name: "example",
          selection: {
            addOns: [],
            providers: { cms: "example/cms/editorial" },
          },
          source: { kind: "working-tree", root: source },
        });
        return yield* workspace
          .materialize({ install: "skip" })
          .pipe(Effect.flip);
      }).pipe(Effect.provide(failedWorkspaces));
      expect(error).toMatchObject({
        _tag: "MaterializationFailed",
        directory: destination,
        failedFile: "apps/web/article.ts",
      });
      expect(yield* fs.exists(deniedFile)).toBeFalsy();
      expect(yield* fs.readFileString(`${source}/article.ts`)).toBe(
        'export const article = "Article";\n'
      );
    }).pipe(Effect.provide(platform))
);

it.live(
  "hydrates included registries from captured declaration-relative sources",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { source, destination } = yield* fixture("included");
      const api = yield* Workspaces;
      const workspace = yield* api.fresh({
        destination,
        name: "example",
        selection: { addOns: [], providers: {} },
        source: { kind: "working-tree", root: source },
      });
      yield* workspace.materialize({ install: "skip" });
      expect(
        yield* fs.readFileString(`${destination}/apps/web/article.ts`)
      ).toBe('export const title = "From an included registry";\n');
    }).pipe(Effect.provide(testLayer))
);

it.live(
  "materializes selected registry files and bound templates as ordinary source",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { source, destination } = yield* fixture();
      const api = yield* Workspaces;
      const workspace = yield* api.fresh({
        destination,
        name: "editorial-site",
        selection: { addOns: [], providers: { cms: "example/cms/editorial" } },
        source: { kind: "working-tree", root: source },
      });
      const result = yield* workspace.materialize({ install: "skip" });

      expect(result.dependencies).toBe("pending");
      expect(
        yield* fs.readFileString(path.join(destination, "apps/web/blocks.ts"))
      ).toBe(
        'import { article } from "./article";\n\nexport const blocks = [article];\n'
      );
      expect(
        yield* fs.readFileString(path.join(destination, "apps/web/article.ts"))
      ).toBe('export const article = "Article";\n');
      expect(yield* fs.readFileString(path.join(source, "article.ts"))).toBe(
        'export const article = "Article";\n'
      );
    }).pipe(Effect.provide(testLayer))
);
