import type { ConfigProvider, Effect as EffectType } from "effect";
import { Effect } from "effect";
import { CliError, Command } from "effect/unstable/cli";

export const createCmsCommand = <E, R>(
  _configProvider: EffectType.Effect<ConfigProvider.ConfigProvider, E, R>
) => {
  const provision = Command.make("provision", {}, () =>
    Effect.fail(
      new CliError.UserError({
        cause: new Error(
          "Contentful space provisioning is not implemented. Configure the CONTENTFUL_* variables in packages/cms-contentful/.env.example."
        ),
      })
    )
  ).pipe(
    Command.withDescription(
      "Provision a Contentful space (not implemented in this scaffold)"
    )
  );

  return Command.make("cms", {}, () => Effect.void).pipe(
    Command.withDescription("Contentful CMS administration commands"),
    Command.withSubcommands([provision])
  );
};
