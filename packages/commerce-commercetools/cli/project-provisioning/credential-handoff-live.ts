import {
  PrivateDotEnvFile,
  privateDotEnvFileLayer,
} from "@repo/cli-core/private-dotenv";
import { Effect, Layer, Redacted } from "effect";

import { RuntimeCredentialHandoff } from "./credential-handoff";
import type { RuntimeCredentials } from "./model";

const runtimeEnvironment = (credentials: RuntimeCredentials) => ({
  COMMERCETOOLS_CLIENT_ID: credentials.clientId,
  COMMERCETOOLS_CLIENT_SECRET: Redacted.value(credentials.clientSecret),
  COMMERCETOOLS_PROJECT_KEY: credentials.projectKey,
  COMMERCETOOLS_REGION: credentials.region,
  COMMERCETOOLS_SCOPE: credentials.scope,
});

export const runtimeCredentialHandoffLayer = Layer.effect(
  RuntimeCredentialHandoff,
  Effect.gen(function* () {
    const privateDotEnvFile = yield* PrivateDotEnvFile;

    return RuntimeCredentialHandoff.of({
      save: Effect.fn("CredentialHandoff.save")(
        function* (credentials, destination) {
          return yield* privateDotEnvFile.publish(
            runtimeEnvironment(credentials),
            destination
          );
        }
      ),
    });
  })
).pipe(Layer.provide(privateDotEnvFileLayer));
