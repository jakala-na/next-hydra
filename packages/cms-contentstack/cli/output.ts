import type { CommandReport, NextTask } from "@repo/cli-core/output-model";
import { runtimeEnvironmentReceiptDescription } from "@repo/cli-core/runtime-environment";
import { runtimeEnvironmentNextTasks } from "@repo/cli-core/runtime-environment-output";

import type { ContentstackProvisioningReceipt } from "./provisioning/model";
import type { ProvisionContentstackOptions } from "./provisioning/provision";
import { contentstackRuntimeEnvironmentManifest } from "./provisioning/runtime-credentials";

export const cmsSteps = {
  destination: {
    group: "CMS",
    title: "Check the credential destination",
    interactive: true,
  },
  access: { group: "CMS", title: "Check Contentstack CLI and stack access" },
  content: {
    group: "CMS",
    title: "Import the composed content model and entries",
    interactive: true,
  },
  migrations: {
    group: "CMS",
    title: "Apply pending content migrations",
    interactive: true,
  },
  credentials: {
    group: "CMS",
    title: "Collect runtime credentials",
    interactive: true,
  },
  publication: { group: "CMS", title: "Publish runtime credentials" },
} as const;

export function cmsProvisioningReport(
  receipt: ContentstackProvisioningReceipt,
  options: Pick<
    ProvisionContentstackOptions,
    "localUrl" | "productionUrl" | "managementTokenAlias" | "environment"
  >
): CommandReport {
  const tasks: NextTask[] = [];
  if (receipt.livePreviewConfigurationRequired)
    tasks.push({
      id: "cms.contentstack.live-preview",
      title: "Configure Live Preview",
      where: `Contentstack > stack ${receipt.apiKey} > Live Preview settings`,
      detail: `Set the stack-level local preview URL to ${options.localUrl} and the production preview URL to ${options.productionUrl}.`,
      verify:
        "Preview opens the intended application and displays draft changes.",
    });
  tasks.push(
    ...runtimeEnvironmentNextTasks(
      receipt.credentials,
      contentstackRuntimeEnvironmentManifest
    ),
    {
      id: "cms.contentstack.verify",
      title: "Verify CMS delivery",
      where: `Your application > content from ${options.environment}`,
      detail:
        "Publish an entry from the composed content model to the configured environment and open its application URL.",
      verify:
        "Published content loads in the application and draft changes appear through Live Preview when configured.",
    }
  );
  return {
    title: "CMS · Contentstack",
    outcome: "action-required",
    summary: "The stack is provisioned. Complete the application setup below.",
    sections: [
      {
        title: "Provisioned",
        facts: [
          { label: "Stack API Key", value: receipt.apiKey },
          { label: "Environments", value: receipt.environments.join(", ") },
          { label: "Region", value: receipt.region },
          {
            label: "Content import",
            value: receipt.imported ? "completed" : "not applied",
          },
          { label: "Recipe version", value: receipt.recipeVersion },
          {
            label: "Migrations applied",
            value: String(receipt.migrationsApplied),
          },
          {
            label: "Credentials",
            value: runtimeEnvironmentReceiptDescription(receipt.credentials),
          },
          {
            label: "Local Management Token alias",
            value: options.managementTokenAlias,
          },
        ],
      },
    ],
    tasks,
  };
}
