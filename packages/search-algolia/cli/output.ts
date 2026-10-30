import type { CommandReport, ReportSection } from "@repo/cli-core/output-model";
import { runtimeEnvironmentReceiptDescription } from "@repo/cli-core/runtime-environment";
import type {
  RuntimeEnvironmentPublicationReceipt,
  RuntimeEnvironmentVariable,
} from "@repo/cli-core/runtime-environment";
import { runtimeEnvironmentNextTasks } from "@repo/cli-core/runtime-environment-output";
import type { InstalledContentSearchApp } from "@repo/search/content-search-app";

import type { ContentIndexingHandoff } from "./content-indexing-handoff";
import type { AlgoliaProvisioningReceipt } from "./provisioning/model";

export const searchOutput = {
  title: "Set up search",
  failureNote:
    "Earlier provider changes may remain. No automatic rollback was performed; inspect the reported phase before retrying.",
  projection: { group: "CMS", title: "Resolve the content search projection" },
  commerce: {
    group: "Commerce",
    title: "Prepare product indexing configuration",
  },
  app: { group: "CMS", title: "Install and configure the content search app" },
} as const;

export function searchProvisioningReport(options: {
  readonly receipt: AlgoliaProvisioningReceipt;
  readonly publication: RuntimeEnvironmentPublicationReceipt;
  readonly runtimeEnvironment: readonly RuntimeEnvironmentVariable[];
  readonly contentIndexNames: readonly string[];
  readonly contentSearchApp: InstalledContentSearchApp | undefined;
  readonly contentHandoff: ContentIndexingHandoff;
  readonly hasCommerce: boolean;
}): CommandReport {
  const { receipt, publication, contentSearchApp } = options;
  const sections: ReportSection[] = [
    {
      title: "Search",
      facts: [
        { label: "Index prefix", value: receipt.indexPrefix ?? "none" },
        {
          label: "Content indices",
          value: options.contentIndexNames.join(", "),
        },
        { label: "Query Suggestions", value: String(receipt.querySuggestions) },
        {
          label: "Credentials",
          value: runtimeEnvironmentReceiptDescription(publication),
        },
      ],
    },
  ];
  if (options.hasCommerce) {
    sections.push({
      title: "Commerce",
      facts: [
        {
          label: "Product indices",
          value: `${receipt.productPrimaries} ${receipt.productPrimaries === 1 ? "primary" : "primaries"}, ${receipt.productReplicas} ${receipt.productReplicas === 1 ? "replica" : "replicas"}`,
        },
        { label: "Connectors", value: String(receipt.connectors) },
        {
          label: "Initial reindexes completed",
          value: String(receipt.initialReindexes),
        },
      ],
    });
  }
  if (contentSearchApp) {
    sections.push({
      title: "CMS",
      facts: [
        {
          label: "Content search app",
          value: `${contentSearchApp.status} (${contentSearchApp.installationUid})`,
        },
        {
          label: "Index / environment",
          value: `${contentSearchApp.indexName} / ${contentSearchApp.environment}`,
        },
        ...(contentSearchApp.configuredMappings === undefined
          ? []
          : [
              {
                label: "Content mappings applied",
                value:
                  contentSearchApp.configuredMappings
                    .map(({ contentTypeUid }) => contentTypeUid)
                    .join(", ") || "none",
              },
            ]),
      ],
    });
  }
  const tasks = [
    ...runtimeEnvironmentNextTasks(publication, options.runtimeEnvironment),
    ...options.contentHandoff.tasks,
  ];
  if (options.hasCommerce) {
    tasks.push({
      id: "search.verify-products-and-content",
      title: "Verify product and content search together",
      where: "Your application > search",
      detail:
        "After the CMS indexing tasks, search for a known product and a published content entry in each deployment locale.",
      verify:
        "Both sources return the expected results in the same search experience.",
    });
  }
  return {
    outcome: tasks.length ? "action-required" : "ready",
    summary: tasks.length
      ? "Search resources are provisioned. Complete the remaining indexing and deployment tasks below."
      : "Search resources are provisioned.",
    sections,
    tasks,
    notes: [
      "Credential values are never printed. CMS content sync was not started by this command.",
    ],
  };
}
