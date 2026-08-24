import { Console, Effect, FileSystem, Layer, Path, Terminal } from "effect";

import { PrivateDotEnvFile, privateDotEnvFileLayer } from "./private-dotenv";
import {
  LocalRuntimeEnvironmentPublicationReceipt,
  LocalRuntimeEnvironmentStore,
} from "./runtime-environment-model";
import {
  confirmRuntimeEnvironmentPublication,
  revealRuntimeEnvironmentValue,
  runtimeEnvironmentPreflightError,
  validateRuntimeEnvironmentValues,
} from "./runtime-environment-support";

export const localRuntimeEnvironmentStoreLayer = Layer.effect(
  LocalRuntimeEnvironmentStore,
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const privateDotEnvFile = yield* PrivateDotEnvFile;
    const terminal = yield* Terminal.Terminal;

    return LocalRuntimeEnvironmentStore.of({
      prepare: Effect.fn("LocalRuntimeEnvironmentStore.prepare")(
        function* (destination, manifest) {
          if (destination.publicationMode === "overwrite") {
            return yield* runtimeEnvironmentPreflightError(
              "local",
              "policy",
              "Overwrite is supported only for Vercel runtime configuration; choose a new local output file",
              new Error("Local runtime environment overwrite is unsupported")
            );
          }
          const absolutePath = path.resolve(destination.output);
          const exists = yield* fileSystem
            .exists(absolutePath)
            .pipe(
              Effect.mapError((cause) =>
                runtimeEnvironmentPreflightError(
                  "local",
                  "validation",
                  "Could not inspect the local credential destination",
                  cause
                )
              )
            );
          if (exists) {
            return yield* runtimeEnvironmentPreflightError(
              "local",
              "conflicts",
              `Credential file already exists: ${absolutePath}`,
              new Error("Local destination exists")
            );
          }
          yield* fileSystem
            .access(path.dirname(absolutePath), { writable: true })
            .pipe(
              Effect.mapError((cause) =>
                runtimeEnvironmentPreflightError(
                  "local",
                  "validation",
                  `The credential destination directory is not writable: ${path.dirname(
                    absolutePath
                  )}`,
                  cause
                )
              )
            );
          yield* Console.log(
            `Runtime environment destination: local file ${absolutePath}`
          );
          yield* Console.log(
            `Variables: ${manifest.map(({ key }) => key).join(", ")}`
          );
          yield* confirmRuntimeEnvironmentPublication(
            fileSystem,
            path,
            terminal,
            "Provision provider resources and write this new credential file?",
            destination.yes,
            "local"
          );
          return {
            destination: "local" as const,
            manifest,
            path: absolutePath,
          };
        }
      ),
      publish: Effect.fn("LocalRuntimeEnvironmentStore.publish")(
        function* (prepared, values) {
          yield* validateRuntimeEnvironmentValues(
            prepared.manifest,
            values,
            prepared.destination
          );
          const receipt = yield* privateDotEnvFile.publish(
            Object.fromEntries(
              Object.entries(values).map(([key, value]) => [
                key,
                revealRuntimeEnvironmentValue(value),
              ])
            ),
            prepared.path
          );
          return new LocalRuntimeEnvironmentPublicationReceipt({
            destination: "local",
            mode: receipt.mode,
            path: receipt.path,
          });
        }
      ),
    });
  })
).pipe(Layer.provide(privateDotEnvFileLayer));
