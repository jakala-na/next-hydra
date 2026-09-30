import { ingestionClient } from "@algolia/ingestion";
import { algoliasearch } from "algoliasearch";
import { Effect, Layer, Redacted } from "effect";

import { AlgoliaAdministration } from "./administration";
import { algoliaApiKeyAdministration } from "./administration-api-keys-live";
import { algoliaAuthenticationAdministration } from "./administration-authentications-live";
import { algoliaCommercetoolsConnectorAdministration } from "./administration-commercetools-connector-live";
import { algoliaIndexAdministration } from "./administration-index-live";
import { algoliaIngestionResourceCatalog } from "./administration-ingestion-catalog-live";
import type { AlgoliaAdministrationClients } from "./administration-live-clients";
import { algoliaQuerySuggestionsAdministration } from "./administration-query-suggestions-live";
import { AlgoliaProvisioningConfig } from "./config";

export type { AlgoliaAdministrationClients } from "./administration-live-clients";

export const makeAlgoliaAdministration = (
  clients: AlgoliaAdministrationClients
): AlgoliaAdministration["Service"] => {
  const catalog = algoliaIngestionResourceCatalog(clients.ingestion);

  return AlgoliaAdministration.of({
    ...algoliaApiKeyAdministration(clients.search),
    ...algoliaAuthenticationAdministration(clients.ingestion, catalog),
    ...algoliaCommercetoolsConnectorAdministration(clients, catalog),
    ...algoliaIndexAdministration(clients.search),
    ...algoliaQuerySuggestionsAdministration(clients.querySuggestions),
  });
};

export const algoliaAdministrationLayer = Layer.effect(
  AlgoliaAdministration,
  Effect.gen(function* () {
    const config = yield* AlgoliaProvisioningConfig;
    const client = algoliasearch(
      config.applicationId,
      Redacted.value(config.adminApiKey)
    );
    return makeAlgoliaAdministration({
      ingestion: ingestionClient(
        config.applicationId,
        Redacted.value(config.adminApiKey),
        config.region
      ),
      querySuggestions: client.initQuerySuggestions({
        region: config.region,
      }),
      search: client,
    });
  })
);
