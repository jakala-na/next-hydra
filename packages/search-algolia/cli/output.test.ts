import { renderReport } from "@repo/cli-core/command-output";
import { describe, expect, it } from "vitest";

import { searchProvisioningReport } from "./output";
import { AlgoliaProvisioningReceipt } from "./provisioning/model";
import { searchRuntimeEnvironmentManifest } from "./provisioning/runtime-credentials";

const receipt = new AlgoliaProvisioningReceipt({
  connectors: 2,
  contentIndices: 1,
  indexPrefix: "demo",
  initialReindexes: 2,
  productPrimaries: 2,
  productReplicas: 4,
  querySuggestions: 2,
});
const handoff = {
  title: "Complete CMS indexing",
  tasks: [
    {
      id: "cms.initial-sync",
      title: "Run the initial content sync",
      where: "CMS > search app",
      detail: "Start the initial sync.",
      verify: "Published entries appear in Algolia.",
    },
  ],
};

describe(searchProvisioningReport, () => {
  it("combines real commerce and CMS results without presenting provisioning as finished indexing", () => {
    const report = searchProvisioningReport({
      receipt,
      publication: {
        destination: "local",
        mode: 0o600,
        path: "/tmp/search.env",
      },
      runtimeEnvironment: searchRuntimeEnvironmentManifest("demo", true),
      contentIndexNames: ["demo--content"],
      contentSearchApp: {
        status: "installed",
        installationUid: "app-123",
        indexName: "demo--content",
        environment: "production",
      },
      contentHandoff: handoff,
      hasCommerce: true,
    });
    const text = renderReport(report, { width: 80, color: false });
    expect(report.outcome).toBe("action-required");
    expect(report.tasks.map(({ id }) => id)).toEqual([
      "runtime.apply-local",
      "cms.initial-sync",
      "search.verify-products-and-content",
    ]);
    expect({
      where: report.tasks[0]?.where,
      source: report.tasks[0]?.detail?.includes("from /tmp/search.env"),
      restart: report.tasks[0]?.detail?.includes("restart or redeploy"),
    }).toEqual({ where: "apps/web", source: true, restart: true });
    for (const fragment of [
      "Initial reindexes completed: 2",
      "/tmp/search.env",
    ]) {
      expect(text).toContain(fragment);
    }
    expect(text.replaceAll(/\s+/gu, " ")).toContain(
      "CMS content sync was not started by this command"
    );
    expect(text.match(/Your next steps/gu)).toHaveLength(1);
  });

  it("puts Vercel redeployment before the CMS handoff and omits unselected Commerce", () => {
    const report = searchProvisioningReport({
      receipt,
      publication: {
        destination: "vercel",
        deploymentRequired: true,
        environments: ["preview"],
        projects: [
          {
            application: "web",
            organizationId: "org-123",
            projectId: "web-123",
            variables: ["ALGOLIA_SEARCH_API_KEY"],
          },
        ],
        publicationMode: "create",
      },
      runtimeEnvironment: searchRuntimeEnvironmentManifest("demo"),
      contentIndexNames: ["demo--content"],
      contentSearchApp: undefined,
      contentHandoff: handoff,
      hasCommerce: false,
    });
    expect(report.tasks.map(({ id }) => id)).toEqual([
      "runtime.redeploy",
      "cms.initial-sync",
    ]);
    expect(report.tasks[0]?.where).toContain("web-123");
    expect(report.sections.map(({ title }) => title)).not.toContain("Commerce");
  });
});
