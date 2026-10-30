import type { CommandReport } from "@repo/cli-core/output-model";
import { runtimeEnvironmentReceiptDescription } from "@repo/cli-core/runtime-environment";
import type { RuntimeEnvironmentVariable } from "@repo/cli-core/runtime-environment";
import { runtimeEnvironmentNextTasks } from "@repo/cli-core/runtime-environment-output";

import type { AuthProvisioningReceipt } from "./provisioning";

export const authSteps = {
  destination: {
    group: "Identity",
    title: "Check the signing-secret destination",
    interactive: true,
  },
  webhook: {
    group: "Identity",
    title: "Create or recover the customer webhook",
  },
  publication: {
    group: "Identity",
    title: "Publish the webhook signing secret",
  },
} as const;

const providerNames = { clerk: "Clerk", workos: "WorkOS" } as const;

export function authProvisioningReport(
  receipt: AuthProvisioningReceipt,
  manifest: readonly RuntimeEnvironmentVariable[]
): CommandReport {
  const provider = providerNames[receipt.provider];
  return {
    title: `Identity · ${provider}`,
    outcome: "action-required",
    summary:
      receipt.action === "created"
        ? "The customer webhook is registered. Complete the application setup below."
        : "The existing customer webhook is unchanged. Complete the application setup below.",
    sections: [
      {
        title: "Provisioned",
        facts: [
          { label: "Webhook", value: receipt.endpointUrl },
          { label: "Status", value: receipt.action },
          { label: "Endpoint ID", value: receipt.endpointId },
          { label: "Subscribed events", value: receipt.events.join(", ") },
          {
            label: "Signing secret",
            value: runtimeEnvironmentReceiptDescription(receipt.credentials),
          },
        ],
      },
    ],
    tasks: [
      ...runtimeEnvironmentNextTasks(receipt.credentials, manifest),
      {
        id: "auth.verify-webhook",
        title: "Verify webhook delivery",
        where: `${provider} > webhook ${receipt.endpointId} and your API logs`,
        detail: `Check delivery of a subscribed event to ${receipt.endpointUrl} after applying the generated configuration.`,
        verify:
          "The API accepts the signed event without a signature-validation error.",
      },
    ],
  };
}
