import { Effect, FileSystem, Schema, Sink, Stream } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";

// Outputs of a successful controlled installer for the authored application example.
export const installedApplication = (directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(`${directory}/node_modules/.pnpm`, {
      recursive: true,
    });
    yield* fs.writeFileString(
      `${directory}/node_modules/.modules.yaml`,
      "layoutVersion: 5\n"
    );
    yield* fs.writeFile(
      `${directory}/node_modules/.pnpm/lock.yaml`,
      yield* fs.readFile(`${directory}/pnpm-lock.yaml`)
    );
    for (const relative of ["package.json", "apps/web/package.json"]) {
      const manifest = yield* Schema.decodeEffect(
        Schema.fromJsonString(
          Schema.Struct({
            dependencies: Schema.optionalKey(
              Schema.Record(Schema.String, Schema.String)
            ),
            devDependencies: Schema.optionalKey(
              Schema.Record(Schema.String, Schema.String)
            ),
          })
        )
      )(yield* fs.readFileString(`${directory}/${relative}`));
      for (const dependency of Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
      })) {
        const packageRoot = `${directory}/${relative.slice(0, -"package.json".length)}node_modules/${dependency}`;
        yield* fs.makeDirectory(packageRoot, { recursive: true });
        yield* fs.writeFileString(`${packageRoot}/package.json`, "{}");
      }
    }
    return 0;
  }).pipe(Effect.orDie);

// Controlled external processes, not an alternate dependency reconciler.
export const packageManager = (
  install: (
    directory: string
  ) => Effect.Effect<number, never, FileSystem.FileSystem>
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return ChildProcessSpawner.make((command) =>
      Effect.succeed(
        ChildProcessSpawner.makeHandle({
          all: Stream.empty,
          exitCode:
            command._tag === "StandardCommand" &&
            command.args.includes("--version")
              ? Effect.succeed(ChildProcessSpawner.ExitCode(0))
              : Effect.suspend(() => {
                  if (
                    command._tag !== "StandardCommand" ||
                    !command.options.cwd
                  ) {
                    return Effect.die(
                      "Expected an installer working directory"
                    );
                  }
                  return install(command.options.cwd);
                }).pipe(
                  Effect.provideService(FileSystem.FileSystem, fs),
                  Effect.map(ChildProcessSpawner.ExitCode)
                ),
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          pid: ChildProcessSpawner.ProcessId(2_147_483_647),
          stderr: Stream.empty,
          stdin: Sink.drain,
          stdout: Stream.make(new TextEncoder().encode("10.11.0\n")),
          unref: Effect.succeed(Effect.void),
        })
      )
    );
  });
