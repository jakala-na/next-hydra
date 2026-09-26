import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

export type Example =
  | "compiled"
  | "registry"
  | "application"
  | "editorial"
  | "packages"
  | "package-layout"
  | "included"
  | "conditional"
  | "bindings";

export const exampleFiles = (name: Example) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* path.fromFileUrl(
      new URL(`../examples/${name}/`, import.meta.url)
    );
    const pending = [""];
    const files = new Map<string, Uint8Array>();
    while (pending.length) {
      const directory = pending.pop();
      if (directory === undefined) {
        break;
      }
      for (const entry of yield* fs.readDirectory(path.join(root, directory))) {
        const relative = path.join(directory, entry);
        const absolute = path.join(root, relative);
        if ((yield* fs.stat(absolute)).type === "Directory") {
          pending.push(relative);
        } else {
          files.set(relative, yield* fs.readFile(absolute));
        }
      }
    }
    return files;
  }).pipe(Effect.provide(NodeServices.layer));

export const fixture = (name: Example = "editorial", worktree = false) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
    const root = yield* fs.makeTempDirectoryScoped({
      prefix: "composition-example-",
    });
    let source = path.join(root, "source");
    const destination = path.join(root, "application");
    yield* fs.makeDirectory(source);
    const exit = yield* processes.exitCode(
      ChildProcess.make("git", ["init", "-q"], { cwd: source })
    );
    if (exit !== 0) {
      return yield* Effect.die(
        new Error("Could not initialize example repository")
      );
    }
    if (worktree) {
      const linked = path.join(root, "linked-source");
      for (const args of [
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
          "--allow-empty",
          "-qm",
          "Example",
        ],
        ["worktree", "add", "--detach", "-q", linked],
      ]) {
        if (
          (yield* processes.exitCode(
            ChildProcess.make("git", args, { cwd: source })
          )) !== 0
        ) {
          return yield* Effect.die(
            new Error("Could not initialize example worktree")
          );
        }
      }
      source = linked;
    }
    for (const [relative, content] of yield* exampleFiles(name)) {
      const target = path.join(source, relative);
      yield* fs.makeDirectory(path.dirname(target), { recursive: true });
      yield* fs.writeFile(target, content);
    }
    return { destination, root, source };
  });
