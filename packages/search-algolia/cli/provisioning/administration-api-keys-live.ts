import type { Acl, ApiKey } from "algoliasearch";
import { Effect, Redacted } from "effect";

import type { AlgoliaAdministration } from "./administration";
import type { SearchAdministrationClient } from "./administration-live-clients";
import { operationError, tryClient } from "./administration-live-shared";

type ApiKeyAdministration = Pick<
  AlgoliaAdministration["Service"],
  "configureConnectorKey" | "configureSearchKey"
>;

const connectorIndexScopes = (indexNames: readonly string[]) =>
  indexNames.flatMap((indexName) => [indexName, `${indexName}-temp-*`]);

export const algoliaApiKeyAdministration = (
  search: SearchAdministrationClient
): ApiKeyAdministration => {
  const configureApiKey = Effect.fn("AlgoliaAdministration.configureApiKey")(
    function* (options: {
      readonly acl: readonly Acl[];
      readonly description: string;
      readonly indexNames: readonly string[];
      readonly legacyDescriptions?: readonly string[];
    }) {
      const apiKey = {
        acl: [...options.acl],
        description: options.description,
        indexes: [...options.indexNames],
      } satisfies ApiKey;
      const { keys } = yield* tryClient(
        "API key lookup",
        async () => await search.listApiKeys()
      );
      const managedDescriptions = new Set([
        options.description,
        ...(options.legacyDescriptions ?? []),
      ]);
      const matchingKeys = keys.filter(
        (candidate) =>
          candidate.description !== undefined &&
          managedDescriptions.has(candidate.description)
      );
      if (matchingKeys.length > 1) {
        return yield* operationError(
          "API key reconciliation",
          new Error(
            `Found ${matchingKeys.length} API keys matching managed descriptions ${[...managedDescriptions].map((description) => `"${description}"`).join(", ")}`
          )
        );
      }
      const [existing] = matchingKeys;
      if (existing !== undefined) {
        yield* tryClient(
          "API key update",
          async () => await search.updateApiKey({ apiKey, key: existing.value })
        );
        yield* tryClient(
          "API key update task",
          async () =>
            await search.waitForApiKey({
              apiKey,
              key: existing.value,
              operation: "update",
            })
        );
        return Redacted.make(existing.value);
      }

      const created = yield* tryClient(
        "API key creation",
        async () => await search.addApiKey(apiKey)
      );
      yield* tryClient(
        "API key creation task",
        async () =>
          await search.waitForApiKey({ key: created.key, operation: "add" })
      );
      return Redacted.make(created.key);
    }
  );

  return {
    configureConnectorKey: ({ description, indexNames, legacyDescriptions }) =>
      configureApiKey({
        acl: [
          "addObject",
          "deleteObject",
          "deleteIndex",
          "editSettings",
          "listIndexes",
          "settings",
        ],
        description,
        indexNames: connectorIndexScopes(indexNames),
        legacyDescriptions,
      }),
    configureSearchKey: ({ description, indexNames, legacyDescriptions }) =>
      configureApiKey({
        acl: ["search"],
        description,
        indexNames,
        legacyDescriptions,
      }),
  };
};
