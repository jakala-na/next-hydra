import type { CommandReport, ReportSection } from "@repo/cli-core/output-model";
import type { ContentSearchProjection } from "@repo/search/content-search-projection";
import { Effect } from "effect";

import { createAlgoliaIndexGraph } from "../../index-graph";
import type { StoreConfiguration } from "../../index-graph";

export const createAlgoliaProvisioningPlan = (
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
    Effect.map((graph): CommandReport => {
      const sections: ReportSection[] = [
        {
          title: "CMS content indices",
          facts: graph.contentIndices.map(({ indexName, locales }) => ({
            label: indexName,
            value: locales.join(", "),
          })),
        },
      ];
      if (graph.productPrimaries.length) {
        sections.push({
          title: "Commerce product indices and connectors",
          facts: graph.productPrimaries.flatMap((primary) => [
            {
              label: primary.indexName,
              value: `Native connector for Store ${primary.storeKey}`,
            },
            ...primary.replicas.map((replica) => ({
              label: replica.indexName,
              value: `${replica.sort} (${replica.currency})`,
            })),
          ]),
        });
      }
      sections.push(
        {
          title: "Query Suggestions",
          facts: graph.querySuggestions.map((suggestions) => ({
            label: suggestions.indexName,
            value: suggestions.sources
              .map(({ indexName }) => indexName)
              .join(", "),
          })),
        },
        {
          title: "Scoped credentials",
          facts: [
            {
              label: "Content write key",
              value: `${graph.contentIndices.length} content indices`,
            },
            {
              label: "Runtime search key",
              value: `${graph.queryableIndexNames.length} queryable indices`,
            },
            ...(graph.productPrimaries.length
              ? [
                  {
                    label: "Connector key",
                    value: `${graph.productPrimaries.length} product primaries`,
                  },
                  {
                    label: "Managed commerce API Client",
                    value: "Connector read and subscription scopes",
                  },
                  {
                    label: "Initial full reindexes",
                    value: `${graph.productPrimaries.length} Store connectors`,
                  },
                ]
              : []),
          ],
        }
      );
      return {
        outcome: "plan",
        summary: "Plan only. No provider resources or credentials changed.",
        sections,
        tasks: [],
      };
    })
  );
