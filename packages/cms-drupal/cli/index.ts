/* oxlint-disable unicorn/throw-new-error -- Schema.TaggedError is the Effect error-class factory. */

import {
  phase,
  renderReport,
  withCommandOutput,
} from "@repo/cli-core/command-output";
import type { ConfigProvider, Effect as EffectType } from "effect";
import { Console, Effect, Path, Schema } from "effect";
import { CliError, Command, Flag } from "effect/unstable/cli";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { drupalProvisioningReport } from "./output";

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

  return directory;
});

export const createCmsCommand = <E, R>(
  _configProvider: EffectType.Effect<ConfigProvider.ConfigProvider, E, R>
) => {
  const provision = Command.make(
    "provision",
    {
      appDirectory: Flag.String("app-directory").pipe(
        Flag.withDescription("Directory containing the Drupal DDEV project"),
        Flag.withDefault("apps/drupal")
      ),
    },
    ({ appDirectory }) =>
      withCommandOutput(
        {
          title: "Provision CMS",
          context: `Drupal · ${appDirectory}`,
          failureNote:
            "The installer may have applied part of the setup. Inspect its output before retrying.",
        },
        (style) =>
          phase(
            {
              group: "CMS",
              title: "Run the Drupal installer and selected recipes",
              interactive: true,
            },
            provisionDrupal(appDirectory)
          ).pipe(
            Effect.mapError((cause) => new CliError.UserError({ cause })),
            Effect.flatMap((directory) =>
              Console.log(
                renderReport(drupalProvisioningReport(directory), style)
              )
            )
          )
      )
  ).pipe(
    Command.withDescription("Install Drupal and apply the selected recipes")
  );

  return Command.make("cms", {}, () => Effect.void).pipe(
    Command.withDescription("Drupal CMS administration commands"),
    Command.withSubcommands([provision])
  );
};
