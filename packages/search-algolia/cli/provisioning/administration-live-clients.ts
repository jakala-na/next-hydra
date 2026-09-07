import type { IngestionClient } from "@algolia/ingestion";
import type { Algoliasearch } from "algoliasearch";

export type SearchAdministrationClient = Pick<
  Algoliasearch,
  | "addApiKey"
  | "getLogs"
  | "listApiKeys"
  | "setSettings"
  | "updateApiKey"
  | "waitForApiKey"
  | "waitForTask"
>;

type QuerySuggestionsClient = ReturnType<Algoliasearch["initQuerySuggestions"]>;

export interface AlgoliaAdministrationClients {
  readonly ingestion: Pick<
    IngestionClient,
    | "createAuthentication"
    | "createDestination"
    | "createSource"
    | "createTask"
    | "createTransformation"
    | "getRun"
    | "listAuthentications"
    | "listDestinations"
    | "listEvents"
    | "listSources"
    | "listTasks"
    | "listTransformations"
    | "replaceTask"
    | "runTask"
    | "tryTransformationBeforeUpdate"
    | "updateAuthentication"
    | "updateDestination"
    | "updateSource"
    | "updateTransformation"
  >;
  readonly querySuggestions: Pick<
    QuerySuggestionsClient,
    "createConfig" | "getAllConfigs" | "updateConfig"
  >;
  readonly search: SearchAdministrationClient;
}
