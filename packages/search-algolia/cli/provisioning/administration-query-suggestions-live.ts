import type { Configuration } from "algoliasearch";
import { Effect, Schema } from "effect";

import type { AlgoliaAdministration } from "./administration";
import type { AlgoliaAdministrationClients } from "./administration-live-clients";
import { tryClient } from "./administration-live-shared";

type QuerySuggestionsAdministration = Pick<
  AlgoliaAdministration["Service"],
  "configureQuerySuggestions"
>;

const QuerySuggestionsConfigurations = Schema.Array(
  Schema.Struct({ indexName: Schema.String })
);

export const algoliaQuerySuggestionsAdministration = (
  querySuggestions: AlgoliaAdministrationClients["querySuggestions"]
): QuerySuggestionsAdministration => {
  let configuredQuerySuggestions: Promise<Set<string>> | undefined;
  const querySuggestionsIndexNames = async () => {
    configuredQuerySuggestions ??= querySuggestions
      .getAllConfigs()
      .then((configurations) => {
        const decoded = Schema.decodeUnknownSync(
          QuerySuggestionsConfigurations
        )(configurations);
        return new Set(decoded.map(({ indexName }) => indexName));
      });
    return await configuredQuerySuggestions;
  };

  return {
    configureQuerySuggestions: Effect.fn(
      "AlgoliaAdministration.configureQuerySuggestions"
    )(function* ({ indexName, language, sources }) {
      const configuration = {
        languages: [language],
        sourceIndices: sources.map(
          ({ analyticsTags, indexName: sourceIndex }) => ({
            analyticsTags: [...analyticsTags],
            indexName: sourceIndex,
            minHits: 1,
            minLetters: 3,
            replicas: false,
          })
        ),
      } satisfies Configuration;
      const existing = yield* tryClient(
        "Query Suggestions lookup",
        querySuggestionsIndexNames
      );

      if (existing.has(indexName)) {
        yield* tryClient(
          "Query Suggestions update",
          async () =>
            await querySuggestions.updateConfig({ configuration, indexName })
        );
      } else {
        yield* tryClient(
          "Query Suggestions creation",
          async () =>
            await querySuggestions.createConfig({ ...configuration, indexName })
        );
        existing.add(indexName);
      }
    }),
  };
};
