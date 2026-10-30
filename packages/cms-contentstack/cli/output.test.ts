import { renderReport } from "@repo/cli-core/command-output";
import { describe, expect, it } from "vitest";

import { cmsProvisioningReport } from "./output";
import {
  ContentstackApiKey,
  ContentstackProvisioningReceipt,
} from "./provisioning/model";

const receiptData = {
  apiKey: ContentstackApiKey.make("stack-123"),
  credentials: { destination: "local", mode: 0o600, path: "/private/cms.env" },
  environments: ["development", "production"],
  region: "EU",
  imported: true,
  recipeVersion: "4",
  migrationsApplied: 3,
  livePreviewConfigurationRequired: true,
} as const;
const receipt = new ContentstackProvisioningReceipt(receiptData);
const options = {
  localUrl: "https://web.application.localhost",
  productionUrl: "https://shop.example.test",
  managementTokenAlias: "stack-bootstrap",
  environment: "production",
} as const;

describe(cmsProvisioningReport, () => {
  it("renders actual import/migration facts and exact preview URLs", () => {
    const report = cmsProvisioningReport(receipt, options);
    const text = renderReport(report, { color: false, width: 88 });
    for (const fragment of [
      "┌─ CMS · Contentstack",
      "Migrations applied: 3",
      "Recipe version: 4",
      options.localUrl,
      options.productionUrl,
      "/private/cms.env",
    ]) {
      expect(text).toContain(fragment);
    }
    expect(
      report.tasks.find((task) => task.id === "runtime.apply-local")?.where
    ).toBe("apps/web");
    expect(text).not.toContain("Landing Page");
    expect(text).not.toContain("Articles");
  });

  it("omits completed preview setup and targets actual published Vercel projects", () => {
    const report = cmsProvisioningReport(
      new ContentstackProvisioningReceipt({
        ...receiptData,
        livePreviewConfigurationRequired: false,
        credentials: {
          destination: "vercel",
          deploymentRequired: true,
          publicationMode: "create",
          environments: ["production"],
          projects: [
            {
              application: "web",
              projectId: "web-project",
              organizationId: "org",
              variables: ["CONTENTSTACK_API_KEY"],
            },
          ],
        },
      }),
      options
    );
    expect(report.tasks.map((task) => task.id)).not.toContain(
      "cms.contentstack.live-preview"
    );
    expect(report.tasks.map((task) => task.id)).not.toContain(
      "runtime.apply-local"
    );
    expect(
      report.tasks.find((task) => task.id === "runtime.redeploy")?.where
    ).toContain("web-project");
  });
});
