import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";

import {
  PrivateDotEnvFile,
  PrivateDotEnvFileError,
  privateDotEnvFileLayer,
} from "./private-dotenv";

const TestLayer = privateDotEnvFileLayer.pipe(
  Layer.provideMerge(NodeServices.layer)
);

describe(PrivateDotEnvFile, () => {
  it.effect("publishes exact contents with private permissions", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const privateFile = yield* PrivateDotEnvFile;
        const path = yield* Path.Path;
        const directory = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "next-hydra-private-dotenv-",
        });
        const destination = path.join(directory, "runtime.env");

        const receipt = yield* privateFile.publish(
          { FIRST: "value", QUOTED: "line\nvalue" },
          destination
        );
        const contents = yield* fileSystem.readFileString(destination);
        const info = yield* fileSystem.stat(destination);

        expect(contents).toBe('FIRST="value"\nQUOTED="line\\nvalue"\n');
        expect(info.mode % 0o1000).toBe(0o600);
        expect(receipt).toMatchObject({ mode: 0o600, path: destination });
      }).pipe(Effect.provide(TestLayer))
    )
  );

  it.effect("does not overwrite an existing file", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const privateFile = yield* PrivateDotEnvFile;
        const path = yield* Path.Path;
        const directory = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "next-hydra-private-dotenv-",
        });
        const destination = path.join(directory, "runtime.env");
        yield* fileSystem.writeFileString(destination, "keep-me");

        const error = yield* privateFile
          .publish({ KEY: "replacement" }, destination)
          .pipe(Effect.flip);

        expect(Schema.is(PrivateDotEnvFileError)(error)).toBeTruthy();
        expect(error.cause).toBeDefined();
        expect(yield* fileSystem.readFileString(destination)).toBe("keep-me");
      }).pipe(Effect.provide(TestLayer))
    )
  );
});
