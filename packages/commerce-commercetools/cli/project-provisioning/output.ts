import type { CommandReport, NextTask } from "@repo/cli-core/output-model";
import { runtimeEnvironmentReceiptDescription } from "@repo/cli-core/runtime-environment";
import { runtimeEnvironmentNextTasks } from "@repo/cli-core/runtime-environment-output";

import { commerceRuntimeEnvironmentManifest } from "./credential-handoff";
import type { ProvisioningReceipt } from "./model";

export const commerceSteps = {
  destination: {
    group: "Commerce",
    title: "Check the credential destination",
    interactive: true,
  },
  project: { group: "Commerce", title: "Prepare the commerce project" },
  client: { group: "Commerce", title: "Create the runtime API Client" },
  migrations: {
    group: "Commerce",
    title: "Apply starter migrations",
    interactive: true,
  },
  publication: { group: "Commerce", title: "Publish runtime credentials" },
  revocation: { group: "Commerce", title: "Revoke the bootstrap API Client" },
} as const;

export function commerceProvisioningReport(
  receipt: ProvisioningReceipt
): CommandReport {
  const tasks: NextTask[] = [
    ...runtimeEnvironmentNextTasks(
      receipt.credentials,
      commerceRuntimeEnvironmentManifest
    ),
  ];
  if (!receipt.bootstrapClientRevoked)
    tasks.push({
      id: "commerce.revoke-bootstrap",
      title: "Revoke the bootstrap API Client",
      where: `commercetools > ${receipt.project.projectKey} > API Clients`,
      detail:
        "Confirm the applications use the generated runtime client, then revoke the bootstrap client used for provisioning.",
      verify:
        "The bootstrap client is revoked and the runtime client remains active.",
    });
  tasks.push({
    id: "commerce.verify",
    title: "Verify Commerce access",
    where: "Your storefront and API",
    detail: `Make a catalog request against project ${receipt.project.projectKey}. If the project has published products, open one in the storefront.`,
    verify:
      "The storefront and API use the generated runtime client without authentication errors.",
  });
  return {
    title: "Commerce · commercetools",
    outcome: "action-required",
    summary:
      "The project is provisioned. Complete the application setup below.",
    sections: [
      {
        title: "Provisioned",
        facts: [
          { label: "Project", value: receipt.project.projectKey },
          { label: "Runtime API Client", value: receipt.runtimeClientId },
          {
            label: "Product projection search",
            value: receipt.project.searchIndexingStatus,
          },
          {
            label: "Migrations applied",
            value: String(receipt.seed.migrationsApplied),
          },
          {
            label: "Credentials",
            value: runtimeEnvironmentReceiptDescription(receipt.credentials),
          },
          {
            label: "Bootstrap API Client",
            value: receipt.bootstrapClientRevoked
              ? "revoked"
              : "revocation required",
          },
        ],
      },
    ],
    tasks,
  };
}
