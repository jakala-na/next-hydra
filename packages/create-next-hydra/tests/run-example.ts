import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { fixture } from "./fixtures/workspace.ts";

const main = Effect.scoped(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
    const example = yield* Schema.decodeUnknownEffect(
      Schema.Literals(["editorial", "conditional", "bindings", "application"])
    )(process.argv[2] ?? "editorial");
    const { source } = yield* fixture(example);
    const name = example === "application" ? "enhanced-site" : "editorial-site";
    const install = process.argv[3] === "--install";
    const destination = path.join(source, "workspaces", name);
    const cli = yield* path.fromFileUrl(
      new URL("../dist/cli.js", import.meta.url)
    );
    if (example === "application") {
      const explained = yield* processes.exitCode(
        ChildProcess.make(
          process.execPath,
          [cli, "compose", name, "--explain", "apps/web/layout.tsx"],
          { cwd: source, stderr: "inherit", stdout: "inherit" }
        )
      );
      if (
        explained !== 0 ||
        (yield* fs.exists(path.join(destination, "apps/web/layout.tsx"))) ||
        (yield* fs.exists(
          path.join(destination, ".workspace-composition.json")
        ))
      ) {
        return yield* Effect.die(
          new Error("Explain failed or changed the workspace")
        );
      }
      yield* Console.log(
        "Explain located the template and selected recipes before materialization."
      );
    }
    const handle = yield* processes.spawn(
      ChildProcess.make(
        process.execPath,
        [cli, "compose", name, ...(install ? [] : ["--no-install"])],
        { cwd: source, stderr: "inherit" }
      )
    );
    const [output, code] = yield* Effect.all(
      [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
      { concurrency: "unbounded" }
    );
    yield* Console.log(output.trim());
    if (code !== 0) {
      return yield* Effect.die(new Error("Initial composition failed"));
    }
    if (install) {
      const lockfile = yield* fs.readFileString(
        path.join(destination, "pnpm-lock.yaml")
      );
      const refreshed = yield* processes.exitCode(
        ChildProcess.make(process.execPath, [cli, "compose", name], {
          cwd: source,
          stderr: "inherit",
          stdout: "inherit",
        })
      );
      if (
        refreshed !== 0 ||
        (yield* fs.readFileString(path.join(destination, "pnpm-lock.yaml"))) !==
          lockfile
      ) {
        return yield* Effect.die(
          new Error("Installed output did not survive refresh")
        );
      }
      yield* Console.log(
        "An actual pnpm installation and refresh preserved the normalized lockfile."
      );
    }
    const filesByExample = {
      application: [
        "package.json",
        "apps/web/package.json",
        "apps/web/layout.tsx",
      ],
      bindings: ["apps/web/package.json", "apps/web/tsconfig.json"],
      conditional: ["apps/web/blocks.ts"],
      editorial: ["apps/web/blocks.ts"],
    };
    for (const file of filesByExample[example]) {
      yield* Console.log(
        yield* fs.readFileString(path.join(destination, file))
      );
    }
    if (example === "application") {
      const template = path.join(source, "layout.tsx.template");
      yield* fs.writeFileString(
        template,
        (yield* fs.readFileString(template)).replace("Hello", "Welcome")
      );
      const layout = path.join(destination, "apps/web/layout.tsx");
      const receipt = path.join(destination, ".workspace-composition.json");
      const originalLayout = yield* fs.readFileString(layout);
      const originalReceipt = yield* fs.readFileString(receipt);
      const checked = yield* processes.exitCode(
        ChildProcess.make(process.execPath, [cli, "compose", name, "--check"], {
          cwd: source,
          stderr: "inherit",
          stdout: "inherit",
        })
      );
      if (
        checked === 0 ||
        (yield* fs.readFileString(layout)) !== originalLayout ||
        (yield* fs.readFileString(receipt)) !== originalReceipt
      ) {
        return yield* Effect.die(
          new Error("Check did not fail read-only for stale output")
        );
      }
      yield* Console.log(
        "Check reported stale output without refreshing files or state."
      );
      const refreshed = yield* processes.exitCode(
        ChildProcess.make(
          process.execPath,
          [cli, "compose", name, "--no-install"],
          {
            cwd: source,
            stderr: "inherit",
            stdout: "inherit",
          }
        )
      );
      if (
        refreshed !== 0 ||
        !(yield* fs.readFileString(layout)).includes("Welcome")
      ) {
        return yield* Effect.die(
          new Error("The executable did not refresh the changed template")
        );
      }
      yield* Console.log("Another CLI process refreshed the changed template.");
      yield* fs.writeFileString(layout, "Local draft\n");
      const diffed = yield* processes.exitCode(
        ChildProcess.make(process.execPath, [cli, "compose", name, "--diff"], {
          cwd: source,
          stderr: "inherit",
          stdout: "inherit",
        })
      );
      if (
        diffed !== 0 ||
        (yield* fs.readFileString(layout)) !== "Local draft\n"
      ) {
        return yield* Effect.die(
          new Error("Diff did not inspect the local draft read-only")
        );
      }
      const blocked = yield* processes.exitCode(
        ChildProcess.make(
          process.execPath,
          [cli, "compose", name, "--no-install"],
          {
            cwd: source,
            stderr: "ignore",
            stdout: "ignore",
          }
        )
      );
      if (
        blocked === 0 ||
        (yield* fs.readFileString(layout)) !== "Local draft\n"
      ) {
        return yield* Effect.die(
          new Error("The executable did not protect the local draft")
        );
      }
      yield* Console.log(
        "A subsequent CLI process refused to overwrite a local edit."
      );
    }
    yield* Console.log(
      "The temporary example copy and its materialized output are removed when the command exits."
    );
  })
);

NodeRuntime.runMain(main.pipe(Effect.provide(NodeServices.layer)));
