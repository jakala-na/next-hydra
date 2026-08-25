import { Effect, Random, Ref } from "effect";

import { CommercetoolsProjectAdministration } from "./administration";
import { BootstrapCommercetoolsConfig } from "./bootstrap-config";
import { RuntimeCredentialHandoff } from "./credential-handoff";
import { ProvisioningReceipt } from "./model";
import { RuntimeProjectSetup } from "./runtime-project-setup";
import { runtimeScopeFor } from "./scopes";

export interface ProvisionCommerceProjectOptions {
  readonly clientName?: string;
  readonly output: string;
}

export const provisionCommerceProject = Effect.fn("provisionCommerceProject")(
  function* (options: ProvisionCommerceProjectOptions) {
    const administration = yield* CommercetoolsProjectAdministration;
    const bootstrapConfig = yield* BootstrapCommercetoolsConfig;
    const credentialHandoff = yield* RuntimeCredentialHandoff;
    const runtimeSetup = yield* RuntimeProjectSetup;
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
      const credentialFile = yield* credentialHandoff
        .save(credentials, options.output)
        .pipe(
          Effect.tap(() => Ref.set(committed, true)),
          Effect.uninterruptible
        );
      yield* administration.deleteApiClient(bootstrapConfig.clientId);

      return new ProvisioningReceipt({
        bootstrapClientRevoked: true,
        credentialFile,
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
