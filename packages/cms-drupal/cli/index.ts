/* oxlint-disable unicorn/throw-new-error -- Schema.TaggedError is the Effect error-class factory. */

import type { ConfigProvider, Effect as EffectType } from "effect";
import { Effect, Path, Schema } from "effect";
import { CliError, Command, Flag } from "effect/unstable/cli";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

class DrupalProvisioningError extends Schema.TaggedError<DrupalProvisioningError>()(
  "DrupalProvisioningError",
  {
    cause: Schema.Defect(),
    message: Schema.String,
  }
) {}

const provisionDrupal = Effect.fn("DrupalProvisioning.provision")(function* (
  appDirectory: string
) {
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const directory = path.resolve(process.cwd(), appDirectory);
  const exitCode = yield* spawner
    .exitCode(
      ChildProcess.make("ddev", ["install"], {
        cwd: directory,
        stderr: "inherit",
        stdin: "inherit",
        stdout: "inherit",
      })
    )
    .pipe(
      Effect.mapError(
        (cause) =>
          new DrupalProvisioningError({
            cause,
            message: "Could not run the Drupal DDEV installer",
          })
      )
    );

  if (exitCode !== 0) {
    return yield* new DrupalProvisioningError({
      cause: new Error(`ddev install exited with code ${exitCode}`),
      message: "The Drupal DDEV installer failed",
    });
  }

  return yield* Effect.void;
});

export const createCmsCommand = <E, R>(
  _configProvider: EffectType.Effect<ConfigProvider.ConfigProvider, E, R>
) => {
  const provision = Command.make(
    "provision",
    {
      appDirectory: Flag.string("app-directory").pipe(
        Flag.withDescription("Directory containing the Drupal DDEV project"),
        Flag.withDefault("apps/drupal")
      ),
    },
    ({ appDirectory }) =>
      provisionDrupal(appDirectory).pipe(
        Effect.mapError((cause) => new CliError.UserError({ cause }))
      )
  ).pipe(
    Command.withDescription("Install Drupal and apply the starter recipe")
  );

  return Command.make("cms", {}, () => Effect.void).pipe(
    Command.withDescription("Drupal CMS administration commands"),
    Command.withSubcommands([provision])
  );
};
