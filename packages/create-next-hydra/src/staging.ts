import { Effect, FileSystem, Path, Ref } from "effect";

import { StagingRetained } from "./errors.ts";

const writer = Symbol("staging writer");

export interface RegistryInstallation {
  readonly application: string;
  readonly registry: string;
  readonly control: string;
  readonly [writer]: Ref.Ref<boolean>;
}
export interface Staging extends RegistryInstallation {
  readonly root: string;
  readonly inputs: string;
}

// Only the adapter participates in this private lifetime protocol.
export const writing = (staging: RegistryInstallation) =>
  Ref.set(staging[writer], true);
export const stopped = (staging: RegistryInstallation) =>
  Ref.set(staging[writer], false);

const withStorage = <A, E, R>(
  use: (staging: Staging) => Effect.Effect<A, E, R>,
  application?: string
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* Effect.acquireUseRelease(
      Effect.gen(function* () {
        const root = yield* fs.makeTempDirectory({
          prefix: "hydra-preparation-",
        });
        return {
          application: application ?? path.join(root, "application"),
          control: path.join(root, "control"),
          inputs: path.join(root, "inputs"),
          registry: path.join(root, "registry"),
          root,
          [writer]: yield* Ref.make(false),
        };
      }),
      (staging) =>
        Effect.gen(function* () {
          for (const directory of [
            ...(application === undefined ? [staging.application] : []),
            staging.inputs,
            staging.registry,
            staging.control,
          ]) {
            yield* fs
              .makeDirectory(directory, { mode: 0o700 })
              .pipe(Effect.uninterruptible);
          }
          return yield* use(staging);
        }),
      (staging) =>
        Effect.gen(function* () {
          if (yield* Ref.get(staging[writer])) {
            return yield* new StagingRetained({ directory: staging.root });
          }
          yield* fs.remove(staging.root, { recursive: true });
        })
    );
  });

export const withStaging = <A, E, R>(
  use: (staging: Staging) => Effect.Effect<A, E, R>
) => withStorage(use);

export const withRegistryInstallation = <A, E, R>(
  application: string,
  use: (installation: RegistryInstallation) => Effect.Effect<A, E, R>
) => withStorage(use, application);
