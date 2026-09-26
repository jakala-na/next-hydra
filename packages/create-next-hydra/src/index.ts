import { Effect, FileSystem, Path, Schema } from "effect";

import { runCommand } from "./commands.ts";
import { runtime } from "./runtime.ts";

export const cliProgram = (argv: readonly string[] = process.argv) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const packagePath = yield* path.fromFileUrl(
      new URL("../package.json", import.meta.url)
    );
    const metadata = yield* fs
      .readFileString(packagePath)
      .pipe(
        Effect.flatMap(
          Schema.decodeEffect(
            Schema.fromJsonString(Schema.Struct({ version: Schema.String }))
          )
        )
      );
    yield* runCommand(process.cwd(), argv.slice(2), metadata.version);
  });

// The Promise boundary belongs to callers embedding the CLI. All commands share
// the same Effect program and Layer as the executable.
export const runCli = async (
  argv: readonly string[] = process.argv
): Promise<void> => {
  await Effect.runPromise(cliProgram(argv).pipe(Effect.provide(runtime)));
};

export type {
  CreateOptions,
  ResolvedCreateOptions,
  ScaffoldResult,
  StarterDefinition,
} from "./types.ts";
