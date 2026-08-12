import type { CompositionPlan } from "./types.js";

export function formatCompositionPlan(plan: CompositionPlan): string {
  const lines = [
    "Providers:",
    ...Object.entries(plan.selection.providers).map(
      ([slot, provider]) => `  ${slot}: ${provider}`
    ),
    `Add-ons: ${plan.selection.addOns.length > 0 ? plan.selection.addOns.join(", ") : "none"}`,
    "Registry items:",
    ...plan.registryItems.map((item) => `  ${item}`),
    "Package entries:",
    ...plan.packageRequirements.map(
      (requirement) =>
        `  ${requirement.cwd}: ${requirement.name} = ${requirement.specifier}`
    ),
    "pnpm patches:",
    ...plan.pnpmPatches.map(
      (patch) => `  ${patch.dependency} -> ${patch.path}`
    ),
    "Managed application files:",
    ...plan.managedTargets.map((target) => `  ${target}`),
  ];

  return lines.join("\n");
}
