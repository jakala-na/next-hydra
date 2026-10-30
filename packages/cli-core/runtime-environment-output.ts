import type { NextTask } from "./output-model";
import type {
  RuntimeEnvironmentPublicationReceipt,
  RuntimeEnvironmentVariable,
} from "./runtime-environment-model";

/** Follow-up work comes from the actual destination and the provider's manifest. */
export function runtimeEnvironmentNextTasks(
  receipt: RuntimeEnvironmentPublicationReceipt,
  manifest: readonly RuntimeEnvironmentVariable[]
): readonly NextTask[] {
  if (receipt.destination === "vercel")
    return [
      {
        id: "runtime.redeploy",
        title: "Redeploy the applications",
        where: `Vercel > ${receipt.projects.map(({ application, projectId }) => `${application}: ${projectId}`).join(", ")} > ${receipt.environments.join(", ")}`,
        detail:
          "Start new deployments so the applications use the published runtime variables.",
        verify:
          "The new deployments use the provider configuration just published.",
      },
    ];
  const applications = [
    ...new Set(manifest.flatMap((variable) => variable.applications)),
  ];
  return [
    {
      id: "runtime.apply-local",
      title: "Apply the runtime configuration",
      where: applications
        .map((application) => `apps/${application}`)
        .join(", "),
      detail: `Load the required runtime variables from ${receipt.path} into these applications' environments, then restart or redeploy them. A credential file written in apps/cli is not automatically loaded by the applications. Keep server credentials private.`,
      verify:
        "Each application starts with the generated provider configuration.",
    },
  ];
}
