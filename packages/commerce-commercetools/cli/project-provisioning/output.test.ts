import { renderReport } from "@repo/cli-core/command-output";
import { describe, expect, it } from "vitest";

import {
  ApiClientId,
  PreparedProject,
  ProjectKey,
  ProjectSeedReceipt,
  ProvisioningReceipt,
} from "./model";
import { commerceProvisioningReport } from "./output";

const receipt = new ProvisioningReceipt({
  bootstrapClientRevoked: true,
  credentials: {
    destination: "local",
    mode: 0o600,
    path: "/private/commerce.env",
  },
  project: new PreparedProject({
    projectKey: ProjectKey.make("catalog-project"),
    searchIndexingStatus: "Activated",
  }),
  runtimeClientId: ApiClientId.make("runtime-123"),
  scope: "view_products:catalog-project",
  seed: new ProjectSeedReceipt({ migrationsApplied: 2 }),
});

describe(commerceProvisioningReport, () => {
  it("reports committed results without repeating migrations or revocation as remaining tasks", () => {
    const report = commerceProvisioningReport(receipt);
    const text = renderReport(report, { color: false, width: 88 });
    expect(text).toContain("┌─ Commerce · commercetools");
    expect(text).toContain("Project: catalog-project");
    expect(text).toContain("Migrations applied: 2");
    expect(text).toContain("Bootstrap API Client: revoked");
    expect(report.tasks.map((task) => task.id)).toEqual([
      "runtime.apply-local",
      "commerce.verify",
    ]);
    expect(report.tasks[0]?.where).toBe("apps/web, apps/api");
  });

  it("uses the receipt's revocation state and actual Vercel publication targets", () => {
    const report = commerceProvisioningReport(
      new ProvisioningReceipt({
        ...receipt,
        bootstrapClientRevoked: false,
        credentials: {
          destination: "vercel",
          deploymentRequired: true,
          publicationMode: "create",
          environments: ["preview"],
          projects: [
            {
              application: "api",
              projectId: "api-project",
              organizationId: "org",
              variables: ["COMMERCETOOLS_CLIENT_SECRET"],
            },
          ],
        },
      })
    );
    expect(report.tasks.map((task) => task.id)).toEqual([
      "runtime.redeploy",
      "commerce.revoke-bootstrap",
      "commerce.verify",
    ]);
    expect(report.tasks[0]?.where).toContain("api-project");
    const text = renderReport(report, { color: false, width: 88 });
    expect(text).toContain("Bootstrap API Client: revocation required");
    expect(text).not.toContain("Bootstrap API Client: revoked");
  });
});
