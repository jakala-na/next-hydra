import { renderReport } from "@repo/cli-core/command-output";
import { describe, expect, it } from "vitest";

import { authProvisioningReport } from "./output";
import {
  AuthProvisioningReceipt,
  authWebhookRuntimeEnvironment,
} from "./provisioning";

const receiptData = {
  action: "created",
  credentials: { destination: "local", mode: 0o600, path: "/private/auth.env" },
  endpointId: "endpoint-example",
  endpointUrl: "https://api.example.test/api/webhooks/clerk",
  events: ["user.created", "user.updated"],
  provider: "clerk",
} as const;
const receipt = new AuthProvisioningReceipt(receiptData);

describe(authProvisioningReport, () => {
  it("frames the actual endpoint, events and private output location with API-only follow-up work", () => {
    const report = authProvisioningReport(
      receipt,
      authWebhookRuntimeEnvironment("CLERK_WEBHOOK_SECRET")
    );
    const text = renderReport(report, { color: false, width: 88 });
    for (const fragment of [
      "┌─ Identity · Clerk",
      "Status: created",
      receipt.endpointUrl,
      "user.created, user.updated",
      "/private/auth.env",
    ]) {
      expect(text).toContain(fragment);
    }
    expect(report.tasks[0]?.where).toBe("apps/api");
    expect(report.tasks.map((task) => task.id)).toEqual([
      "runtime.apply-local",
      "auth.verify-webhook",
    ]);
  });

  it("reports an unchanged WorkOS endpoint and uses actual Vercel publication targets", () => {
    const report = authProvisioningReport(
      new AuthProvisioningReceipt({
        ...receiptData,
        action: "unchanged",
        provider: "workos",
        endpointUrl: "https://api.example.test/api/webhooks/workos",
        credentials: {
          destination: "vercel",
          deploymentRequired: true,
          publicationMode: "create",
          environments: ["preview:auth"],
          projects: [
            {
              application: "api",
              projectId: "api-project",
              organizationId: "org",
              variables: ["WORKOS_WEBHOOK_SECRET"],
            },
          ],
        },
      }),
      authWebhookRuntimeEnvironment("WORKOS_WEBHOOK_SECRET")
    );
    const text = renderReport(report, { color: false, width: 88 });
    for (const fragment of ["┌─ Identity · WorkOS", "Status: unchanged"]) {
      expect(text).toContain(fragment);
    }
    expect(report.tasks.map((task) => task.id)).toEqual([
      "runtime.redeploy",
      "auth.verify-webhook",
    ]);
    expect(report.tasks[0]?.where).toContain("api-project");
    expect(report.tasks[0]?.where).toContain("preview:auth");
    expect(report.tasks[0]?.where).not.toContain("web:");
    expect(report.summary).not.toContain("is registered");
  });
});
