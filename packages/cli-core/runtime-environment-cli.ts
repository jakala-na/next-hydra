import { Flag } from "effect/unstable/cli";

import type {
  RuntimeEnvironmentDestination,
  VercelEnvironmentSelector,
} from "./runtime-environment";

const DESTINATIONS = ["local", "vercel"] as const;

export const runtimeEnvironmentDestinationFlags = () => ({
  environment: Flag.string("environment").pipe(
    Flag.withDescription(
      "Vercel production, preview, preview:<branch>, or custom environment; repeat as needed"
    ),
    Flag.atLeast(0)
  ),
  output: Flag.string("output").pipe(
    Flag.withDescription("New local dotenv file for runtime configuration"),
    Flag.withDefault(".env.local")
  ),
  overwrite: Flag.boolean("overwrite").pipe(
    Flag.withDescription(
      "Replace exact provider-owned variables in selected Vercel environments"
    )
  ),
  store: Flag.choice("store", DESTINATIONS).pipe(
    Flag.withDescription("Runtime configuration store"),
    Flag.withDefault("local")
  ),
  yes: Flag.boolean("yes").pipe(
    Flag.withDescription("Skip the provisioning confirmation")
  ),
});

export interface RuntimeEnvironmentDestinationFlagValues {
  readonly environment: readonly VercelEnvironmentSelector[];
  readonly output: string;
  readonly overwrite: boolean;
  readonly store: "local" | "vercel";
  readonly yes: boolean;
}

export const runtimeEnvironmentDestinationFromFlags = (
  flags: RuntimeEnvironmentDestinationFlagValues
): RuntimeEnvironmentDestination =>
  flags.store === "local"
    ? {
        destination: "local",
        output: flags.output,
        publicationMode: flags.overwrite ? "overwrite" : "create",
        yes: flags.yes,
      }
    : {
        destination: "vercel",
        environments: flags.environment,
        publicationMode: flags.overwrite ? "overwrite" : "create",
        yes: flags.yes,
      };
