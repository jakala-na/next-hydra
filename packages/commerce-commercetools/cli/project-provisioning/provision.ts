import { Console, Effect, Random, Ref } from "effect";

import { CommercetoolsProjectAdministration } from "./administration";
import { BootstrapCommercetoolsConfig } from "./bootstrap-config";
import { RuntimeCredentialHandoff } from "./credential-handoff";
import { BootstrapApiClientScopeError, ProvisioningReceipt } from "./model";
import { RuntimeProjectSetup } from "./runtime-project-setup";
import { missingBootstrapScopes, runtimeScopeFor } from "./scopes";

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
    const missingScopes = missingBootstrapScopes(
      bootstrapConfig.projectKey,
      bootstrapConfig.scopes
    );
    if (missingScopes.length > 0) {
      return yield* new BootstrapApiClientScopeError({
        message: `The bootstrap API Client is missing required scope(s): ${missingScopes.join(" ")}`,
        missingScopes,
      });
    }

    yield* Console.log("Preparing the Commercetools project...");
    const project = yield* administration.prepareProject;
    const scope = runtimeScopeFor(bootstrapConfig.projectKey);
    yield* Console.log(`Creating runtime API Client "${clientName}"...`);
    const credentials = yield* administration.createRuntimeClient({
      name: clientName,
      scope,
    });
    const committed = yield* Ref.make(false);

    const finishProvisioning = Effect.gen(function* () {
      yield* Console.log("Applying starter-kit migrations...");
      const seed = yield* runtimeSetup.setup(credentials);
      yield* Console.log(`Writing runtime credentials to ${options.output}...`);
      const credentialFile = yield* credentialHandoff
        .save(credentials, options.output)
        .pipe(
          Effect.tap(() => Ref.set(committed, true)),
          Effect.uninterruptible
        );
      yield* Console.log("Revoking the bootstrap API Client...");
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
