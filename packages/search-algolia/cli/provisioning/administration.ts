import type { IndexSettings } from "algoliasearch";
import type { Effect, Redacted } from "effect";
import { Context, Layer } from "effect";

import type { AlgoliaQuerySuggestionsSourceDefinition } from "../../index-graph";
import type { AlgoliaProvisioningError } from "./model";

export interface ConfigureAlgoliaIndexOptions {
  readonly indexName: string;
  readonly settings: IndexSettings;
}

export interface ConfigureAlgoliaQuerySuggestionsOptions {
  readonly indexName: string;
  readonly language: string;
  readonly sources: readonly [
    AlgoliaQuerySuggestionsSourceDefinition,
    ...AlgoliaQuerySuggestionsSourceDefinition[],
  ];
}

export interface ConfigureAlgoliaSearchKeyOptions {
  readonly description: string;
  readonly indexNames: readonly string[];
  readonly legacyDescriptions?: readonly string[];
}

export interface ConfigureAlgoliaConnectorKeyOptions {
  readonly description: string;
  readonly indexNames: readonly string[];
  readonly legacyDescriptions?: readonly string[];
}

export interface ConfigureAlgoliaDestinationAuthenticationOptions {
  readonly apiKey: Redacted.Redacted;
  readonly applicationId: string;
  readonly legacyNames?: readonly string[];
  readonly name: string;
}

export interface ConfigureAlgoliaTransformationSecretsOptions {
  readonly legacyNames?: readonly string[];
  readonly name: string;
  readonly values: Readonly<Record<string, string>>;
}

export interface ConfigureCommercetoolsAuthenticationOptions {
  authenticationId?: string;
  readonly authUrl: string;
  readonly clientId: string;
  readonly clientSecret: Redacted.Redacted;
  readonly name: string;
  readonly scope: string;
}

export interface ConfiguredCommercetoolsAuthentication {
  readonly authenticationId: string;
  clientId?: string;
  scope?: string;
}

export interface ConfigureCommercetoolsConnectorOptions {
  readonly algoliaAuthenticationId: string;
  readonly commercetoolsAuthenticationId: string;
  readonly indexName: string;
  readonly locales: readonly string[];
  readonly legacyNames?: readonly string[];
  readonly name: string;
  readonly projectKey: string;
  readonly storeKey: string;
  readonly transformationCode: string;
  readonly transformationAuthenticationIds: readonly string[];
  readonly url: string;
}

export interface ConfiguredCommercetoolsConnector {
  readonly destinationId: string;
  readonly runId: string;
  readonly sourceId: string;
  readonly taskId: string;
  readonly transformationId: string;
}

interface AlgoliaAdministrationValue {
  readonly configureAlgoliaDestinationAuthentication: (
    options: ConfigureAlgoliaDestinationAuthenticationOptions
  ) => Effect.Effect<string, AlgoliaProvisioningError>;
  readonly configureAlgoliaTransformationSecrets: (
    options: ConfigureAlgoliaTransformationSecretsOptions
  ) => Effect.Effect<string, AlgoliaProvisioningError>;
  readonly configureConnectorKey: (
    options: ConfigureAlgoliaConnectorKeyOptions
  ) => Effect.Effect<Redacted.Redacted, AlgoliaProvisioningError>;
  readonly configureCommercetoolsConnector: (
    options: ConfigureCommercetoolsConnectorOptions
  ) => Effect.Effect<
    ConfiguredCommercetoolsConnector,
    AlgoliaProvisioningError
  >;
  readonly configureIndex: (
    options: ConfigureAlgoliaIndexOptions
  ) => Effect.Effect<void, AlgoliaProvisioningError>;
  readonly configureQuerySuggestions: (
    options: ConfigureAlgoliaQuerySuggestionsOptions
  ) => Effect.Effect<void, AlgoliaProvisioningError>;
  readonly configureSearchKey: (
    options: ConfigureAlgoliaSearchKeyOptions
  ) => Effect.Effect<Redacted.Redacted, AlgoliaProvisioningError>;
  readonly configureCommercetoolsAuthentication: (
    options: ConfigureCommercetoolsAuthenticationOptions
  ) => Effect.Effect<string, AlgoliaProvisioningError>;
  readonly findCommercetoolsAuthentication: (options: {
    readonly legacyNames?: readonly string[];
    readonly name: string;
  }) => Effect.Effect<
    ConfiguredCommercetoolsAuthentication | undefined,
    AlgoliaProvisioningError
  >;
}

export class AlgoliaAdministration extends Context.Service<
  AlgoliaAdministration,
  AlgoliaAdministrationValue
>()("@repo/search-algolia/Administration") {
  static readonly layerFrom = (value: AlgoliaAdministrationValue) =>
    Layer.succeed(AlgoliaAdministration, AlgoliaAdministration.of(value));
}
