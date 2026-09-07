import type { CommerceSearchIndexingFailure } from "@repo/commerce/search-indexing";
import type { Effect, Redacted } from "effect";

export interface AlgoliaCommerceConnectorStore {
  readonly storeKey: string;
}

export interface AlgoliaCommerceConnectorContext {
  readonly apiUrl: string;
  readonly authUrl: string;
  readonly priceCustomerGroupIds: readonly string[];
  readonly projectKey: string;
  readonly stores: readonly AlgoliaCommerceConnectorStore[];
}

export type ReconciledManagedCommerceApiClient =
  | {
      readonly clientId: string;
      readonly scope: string;
      readonly status: "current";
    }
  | {
      readonly clientId: string;
      readonly clientSecret: Redacted.Redacted;
      readonly replacedClientId?: string;
      readonly scope: string;
      readonly status: "created";
    };

export interface ReconcileManagedCommerceApiClientInput {
  existingClientId?: string;
  existingScope?: string;
  readonly name: string;
  readonly scopeNames: readonly string[];
}

export interface AlgoliaCommerceConnectorSource {
  readonly deleteManagedApiClient: (
    clientId: string
  ) => Effect.Effect<void, CommerceSearchIndexingFailure>;
  readonly reconcileManagedApiClient: (
    input: ReconcileManagedCommerceApiClientInput
  ) => Effect.Effect<
    ReconciledManagedCommerceApiClient,
    CommerceSearchIndexingFailure
  >;
  readonly resolveContext: (input: {
    readonly priceCustomerGroupIds: readonly string[];
    readonly storeKeys: readonly string[];
  }) => Effect.Effect<
    AlgoliaCommerceConnectorContext,
    CommerceSearchIndexingFailure
  >;
}
