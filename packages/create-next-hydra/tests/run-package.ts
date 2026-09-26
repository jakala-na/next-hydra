import { strict as assert } from "node:assert";

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { applyEdits, modify } from "jsonc-parser";

import { fixture } from "./fixtures/workspace.ts";

// Run after building, packing and installing the tarball into an unrelated
// directory. Only this test harness imports from the checkout; all tooling
// processes load the supplied package and its own installed dependencies.
const main = Effect.scoped(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
    const [packageRoot] = process.argv.slice(2);
    if (!packageRoot || !path.isAbsolute(packageRoot)) {
      return yield* Effect.die(
        "Provide the absolute installed tarball package directory"
      );
    }
    const cli = path.join(packageRoot, "dist/cli.js");
    const run = (
      cwd: string,
      executable: string,
      args: readonly string[],
      success = true
    ) =>
      Effect.scoped(
        Effect.gen(function* () {
          const child = yield* processes.spawn(
            ChildProcess.make(executable, args, {
              cwd,
              env: process.env,
              stderr: "pipe",
              stdin: "ignore",
              stdout: "pipe",
            })
          );
          const [code, stdout, stderr] = yield* Effect.all(
            [
              child.exitCode,
              Stream.mkString(Stream.decodeText(child.stdout)),
              Stream.mkString(Stream.decodeText(child.stderr)),
            ],
            { concurrency: "unbounded" }
          );
          assert.equal(
            code === 0,
            success,
            `Unexpected exit ${code}: ${stdout}\n${stderr}`
          );
          return stdout;
        })
      );
    const { source, root, destination } = yield* fixture("compiled");
    yield* run(source, "git", ["add", "."]);
    yield* run(source, "git", [
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
    ]);
    yield* run(root, process.execPath, [cli, "--help"]);
    yield* run(
      root,
      process.execPath,
      [cli, "compose", "missing", "--unknown"],
      false
    );
    yield* run(root, process.execPath, [
      cli,
      destination,
      "--repo-url",
      source,
      "--preset",
      "example/preset/site",
      "--yes",
      "--skip-git",
    ]);
    assert.equal(
      yield* fs.exists(path.join(destination, ".workspace-composition.json")),
      false
    );
    assert.equal(yield* fs.exists(path.join(destination, ".git")), false);
    yield* run(destination, "pnpm", ["typecheck"]);
    yield* run(destination, "pnpm", ["build"]);
    const result = yield* run(destination, process.execPath, [
      "--input-type=module",
      "-e",
      'import { content } from "./apps/web/dist/page.js"; console.log(content[0]?.title)',
    ]);
    assert.equal(result.trim(), "An authored article");
    yield* Console.log(
      "Packed creation installed, typechecked, built and executed the composed application."
    );

    // Exercise maintainer callers with the installed, already-built package.
    // Application builds run from their own installed workspace root.
    const tooling = path.join(source, "packages/create-next-hydra");
    yield* fs.makeDirectory(tooling, { recursive: true });
    yield* fs.copy(path.join(packageRoot, "dist"), path.join(tooling, "dist"));
    let toolingManifest = yield* fs.readFileString(
      path.join(packageRoot, "package.json")
    );
    toolingManifest = applyEdits(
      toolingManifest,
      modify(toolingManifest, ["devDependencies"], {}, {})
    );
    toolingManifest = applyEdits(
      toolingManifest,
      modify(
        toolingManifest,
        ["scripts"],
        { build: "node --check dist/cli.js" },
        {}
      )
    );
    yield* fs.writeFileString(
      path.join(tooling, "package.json"),
      toolingManifest
    );
    yield* run(source, "pnpm", [
      "install",
      "--ignore-scripts",
      "--no-frozen-lockfile",
    ]);
    yield* run(source, process.execPath, [cli, "compose", "example-site"]);
    yield* run(source, process.execPath, [
      cli,
      "compose",
      "example-site",
      "--check",
    ]);
    const application = path.join(source, "workspaces/example-site");
    yield* run(application, "pnpm", [
      "exec",
      "turbo",
      "run",
      "build",
      "--filter=web",
    ]);
    const built = yield* run(application, process.execPath, [
      "--input-type=module",
      "-e",
      'import { content } from "./apps/web/dist/page.js"; console.log(content[0]?.title)',
    ]);
    assert.equal(built.trim(), "An authored article");
    const lint = path.join(tooling, "dist/lint-workspaces.js");
    const articleSource = "content/[locale]/[[...slug]]/article.ts";
    yield* run(source, process.execPath, [
      lint,
      articleSource,
      "unselected/example.ts.template",
    ]);
    const article = yield* fs.readFileString(path.join(source, articleSource));
    yield* fs.writeFileString(
      path.join(source, articleSource),
      `${article}\nexport function invoke(value: any) { value(); }\n`
    );
    yield* run(source, process.execPath, [lint, articleSource], false);
    const leftovers = (yield* fs.readDirectory(
      path.join(source, "workspaces")
    )).filter((name) => name.startsWith(".lint-"));
    assert.deepEqual(leftovers, []);
    yield* Console.log(
      "Packed composition and application-root builds succeeded; lint rejects unsafe code and releases its temporary copies."
    );

    const named = yield* fixture("application");
    const workspace = path.join(named.source, "workspaces/configured-site");
    const explanation = yield* run(
      path.join(named.source, "apps/web"),
      process.execPath,
      [cli, "compose", "configured-site", "--explain=apps/web/layout.tsx"]
    );
    assert.ok(
      explanation.includes(path.join(named.source, "layout.tsx.template"))
    );
    assert.equal(
      yield* fs.exists(path.join(workspace, "apps/web/layout.tsx")),
      false
    );
    yield* run(named.source, process.execPath, [
      cli,
      "compose",
      "configured-site",
      "--no-install",
    ]);
    yield* fs.writeFileString(
      path.join(workspace, "apps/web/layout.tsx"),
      "Local draft\n"
    );
    const diff = yield* run(named.source, process.execPath, [
      cli,
      "compose",
      "configured-site",
      "--diff",
    ]);
    assert.ok(diff.includes("+Local draft"));
    yield* run(
      named.source,
      process.execPath,
      [cli, "compose", "configured-site", "--no-install"],
      false
    );
    assert.equal(
      yield* fs.readFileString(path.join(workspace, "apps/web/layout.tsx")),
      "Local draft\n"
    );
    yield* Console.log(
      "Packed Compose, Explain and Diff preserve local changes across executable invocations."
    );

    const project = yield* fixture("registry");
    const entrypoint = (yield* path.toFileUrl(
      path.join(packageRoot, "dist/index.js")
    )).href;
    yield* run(project.source, process.execPath, [
      "--input-type=module",
      "-e",
      `import { runCli } from ${yield* Schema.encodeEffect(Schema.fromJsonString(Schema.String))(entrypoint)}; await runCli([process.execPath, 'cli', 'add', 'banner.json', '--yes']);`,
    ]);
    assert.equal(
      yield* fs.readFileString(path.join(project.source, "apps/web/banner.ts")),
      "export const banner = 'Campaign';\n"
    );
    assert.equal(
      yield* fs.exists(
        path.join(project.source, ".workspace-composition.json")
      ),
      false
    );
    yield* Console.log(
      "Packed programmatic addition runs its worker without checkout or application tooling dependencies."
    );
  })
);

NodeRuntime.runMain(main.pipe(Effect.provide(NodeServices.layer)));
