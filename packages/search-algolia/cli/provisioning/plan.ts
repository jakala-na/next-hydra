import type { ContentSearchProjection } from "@repo/search/content-search-projection";
import { Effect } from "effect";

import { createAlgoliaIndexGraph } from "../../index-graph";
import type { StoreConfiguration } from "../../index-graph";

export const formatAlgoliaProvisioningPlan = (
  indexPrefix: string | undefined,
  locales: readonly string[],
  contentProjection: ContentSearchProjection,
  storefronts?: StoreConfiguration
) =>
  createAlgoliaIndexGraph(
    indexPrefix,
    locales,
    contentProjection,
    storefronts
  ).pipe(
    Effect.map((graph) => {
      const lines = [
        graph.prefix === undefined
          ? "Algolia provisioning plan without an index prefix"
          : `Algolia provisioning plan for "${graph.prefix}"`,
      ];

      for (const primary of graph.productPrimaries) {
        lines.push(
          `  Product primary: ${primary.indexName}`,
          `    Native commerce connector: ${primary.storeKey} -> ${primary.indexName}`
        );
        for (const replica of primary.replicas) {
          lines.push(
            `    ${replica.sort}: ${replica.indexName} (${replica.currency})`
          );
        }
      }
      for (const content of graph.contentIndices) {
        lines.push(
          `  Content index: ${content.indexName} (${content.locales.join(", ")})`
        );
      }
      for (const suggestions of graph.querySuggestions) {
        lines.push(
          `  Query Suggestions: ${suggestions.indexName} <- ${suggestions.sources.map(({ indexName }) => indexName).join(", ")}`
        );
      }
      lines.push(
        `  Restricted Content write key: ${graph.contentIndices.length} Content indices (sensitive)`,
        `  Restricted runtime key: ${graph.queryableIndexNames.length} queryable indices`
      );
      if (graph.productPrimaries.length > 0) {
        lines.push(
          `  Restricted connector key: ${graph.productPrimaries.length} Product primaries`,
          "  Managed commerce API Client: connector read and subscription scopes",
          `  Initial full reindexes: ${graph.productPrimaries.length} Store connectors`
        );
      }

      return lines.join("\n");
    })
  );
