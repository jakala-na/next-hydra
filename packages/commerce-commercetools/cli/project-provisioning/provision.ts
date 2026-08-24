import { RuntimeEnvironmentPublisher } from "@repo/cli-core/runtime-environment";
import type { RuntimeEnvironmentDestination } from "@repo/cli-core/runtime-environment";
import { Effect, Random, Ref } from "effect";

import { CommercetoolsProjectAdministration } from "./administration";
import { BootstrapCommercetoolsConfig } from "./bootstrap-config";
import {
  commerceRuntimeEnvironment,
  commerceRuntimeEnvironmentManifest,
} from "./credential-handoff";
import { ProvisioningReceipt } from "./model";
import { RuntimeProjectSetup } from "./runtime-project-setup";
import { runtimeScopeFor } from "./scopes";

export interface ProvisionCommerceProjectOptions {
  readonly clientName?: string;
  readonly destination: RuntimeEnvironmentDestination;
}

export const provisionCommerceProject = Effect.fn("provisionCommerceProject")(
  function* (options: ProvisionCommerceProjectOptions) {
    const administration = yield* CommercetoolsProjectAdministration;
    const bootstrapConfig = yield* BootstrapCommercetoolsConfig;
    const publisher = yield* RuntimeEnvironmentPublisher;
    const runtimeSetup = yield* RuntimeProjectSetup;
    const preparedDestination = yield* publisher.prepare({
      destination: options.destination,
      manifest: commerceRuntimeEnvironmentManifest,
    });
    const clientName =
      options.clientName ??
      `Next Hydra runtime (${Math.abs(yield* Random.nextInt)})`;
    const project = yield* administration.prepareProject;
    const scope = runtimeScopeFor(bootstrapConfig.projectKey);
    const credentials = yield* administration.createRuntimeClient({
      name: clientName,
      scope,
    });
    const committed = yield* Ref.make(false);

    const finishProvisioning = Effect.gen(function* () {
      const seed = yield* runtimeSetup.setup(credentials);
      const publishedCredentials = yield* publisher
        .publish(preparedDestination, commerceRuntimeEnvironment(credentials))
        .pipe(
          Effect.tapErrorTag(
            [
              "RuntimeEnvironmentPublicationIncomplete",
              "RuntimeEnvironmentPublicationOutcomeUnknown",
            ],
            () => Ref.set(committed, true)
          ),
          Effect.tap(() => Ref.set(committed, true)),
          Effect.uninterruptible
        );
      yield* administration.deleteApiClient(bootstrapConfig.clientId);

      return new ProvisioningReceipt({
        bootstrapClientRevoked: true,
        credentials: publishedCredentials,
        project,
        runtimeClientId: credentials.clientId,
        scope: credentials.scope,
        seed,
      });
    });

    return yield* finishProvisioning.pipe(
      Effect.onExit(() =>
        Ref.get(committed).pipe(
          Effect.flatMap((isCommitted) =>
            isCommitted
              ? Effect.void
              : administration.deleteApiClient(credentials.clientId)
          )
        )
      )
    );
  }
);
