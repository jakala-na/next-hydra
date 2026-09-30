import { Effect, Redacted, Schema } from "effect";

import type {
  AlgoliaAdministration,
  ConfiguredCommercetoolsAuthentication,
} from "./administration";
import type { AlgoliaIngestionResourceCatalog } from "./administration-ingestion-catalog-live";
import type { AlgoliaAdministrationClients } from "./administration-live-clients";
import {
  namedResource,
  operationError,
  tryClient,
} from "./administration-live-shared";

type AuthenticationAdministration = Pick<
  AlgoliaAdministration["Service"],
  | "configureAlgoliaDestinationAuthentication"
  | "configureAlgoliaTransformationSecrets"
  | "configureCommercetoolsAuthentication"
  | "findCommercetoolsAuthentication"
>;

export const algoliaAuthenticationAdministration = (
  ingestion: AlgoliaAdministrationClients["ingestion"],
  catalog: AlgoliaIngestionResourceCatalog
): AuthenticationAdministration => ({
  configureAlgoliaDestinationAuthentication: Effect.fn(
    "AlgoliaAdministration.configureAlgoliaDestinationAuthentication"
  )(function* ({ apiKey, applicationId, legacyNames, name }) {
    const resources = yield* tryClient(
      "destination authentication lookup",
      catalog.listAuthentications
    );
    const existing = yield* namedResource(
      resources.filter(({ type }) => type === "algolia"),
      name,
      "destination authentication reconciliation",
      legacyNames
    );
    const input = {
      apiKey: Redacted.value(apiKey),
      appID: applicationId,
    };
    if (existing) {
      yield* tryClient(
        "destination authentication update",
        async () =>
          await ingestion.updateAuthentication({
            authenticationID: existing.authenticationID,
            authenticationUpdate: { input, name },
          })
      );
      return existing.authenticationID;
    }
    const created = yield* tryClient(
      "destination authentication creation",
      async () =>
        await ingestion.createAuthentication({ input, name, type: "algolia" })
    );
    return created.authenticationID;
  }),
  configureAlgoliaTransformationSecrets: Effect.fn(
    "AlgoliaAdministration.configureAlgoliaTransformationSecrets"
  )(function* ({ legacyNames, name, values }) {
    const resources = yield* tryClient(
      "transformation secrets authentication lookup",
      catalog.listAuthentications
    );
    const existing = yield* namedResource(
      resources.filter(({ type }) => type === "secrets"),
      name,
      "transformation secrets authentication reconciliation",
      legacyNames
    );
    const input = { ...values };
    if (existing) {
      yield* tryClient(
        "transformation secrets authentication update",
        async () =>
          await ingestion.updateAuthentication({
            authenticationID: existing.authenticationID,
            authenticationUpdate: { input, name },
          })
      );
      return existing.authenticationID;
    }
    const created = yield* tryClient(
      "transformation secrets authentication creation",
      async () =>
        await ingestion.createAuthentication({ input, name, type: "secrets" })
    );
    return created.authenticationID;
  }),
  configureCommercetoolsAuthentication: Effect.fn(
    "AlgoliaAdministration.configureCommercetoolsAuthentication"
  )(function* ({
    authenticationId,
    authUrl,
    clientId,
    clientSecret,
    name,
    scope,
  }) {
    const input = {
      client_id: clientId,
      client_secret: Redacted.value(clientSecret),
      scope,
      url: `${authUrl.replace(/\/$/u, "")}/oauth/token`,
    };
    if (authenticationId !== undefined) {
      const updated = yield* tryClient(
        "commercetools authentication update",
        async () =>
          await ingestion.updateAuthentication({
            authenticationID: authenticationId,
            authenticationUpdate: { input, name },
          })
      );
      return updated.authenticationID;
    }

    const created = yield* tryClient(
      "commercetools authentication creation",
      async () =>
        await ingestion.createAuthentication({
          input,
          name,
          platform: "commercetools",
          type: "oauth",
        })
    );
    return created.authenticationID;
  }),
  findCommercetoolsAuthentication: Effect.fn(
    "AlgoliaAdministration.findCommercetoolsAuthentication"
  )(function* ({ legacyNames, name }) {
    const resources = yield* tryClient(
      "commercetools authentication lookup",
      catalog.listAuthentications
    );
    const existing = yield* namedResource(
      resources.filter(
        ({ platform, type }) => platform === "commercetools" && type === "oauth"
      ),
      name,
      "commercetools authentication reconciliation",
      legacyNames
    );
    if (existing === undefined) {
      return undefined;
    }
    const input = yield* Schema.decodeUnknownEffect(
      Schema.Struct({
        client_id: Schema.optional(Schema.String),
        scope: Schema.optional(Schema.String),
      })
    )(existing.input).pipe(
      Effect.mapError((cause) =>
        operationError("commercetools authentication decoding", cause)
      )
    );
    const configured: ConfiguredCommercetoolsAuthentication = {
      authenticationId: existing.authenticationID,
    };
    if (input.client_id !== undefined) {
      configured.clientId = input.client_id;
    }
    if (input.scope !== undefined) {
      configured.scope = input.scope;
    }
    return configured;
  }),
});
