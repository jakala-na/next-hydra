import { PROVIDER_SLOTS } from "./types.js";
import type { CompositionPlan } from "./types.js";

function formatProvider(provider: string | undefined): string {
  return provider ?? "none";
}

export function formatCompositionPlan(plan: CompositionPlan): string {
  const lines = [
    "Providers:",
    ...PROVIDER_SLOTS.map(
      (slot) => `  ${slot}: ${formatProvider(plan.selection.providers[slot])}`
    ),
    `Add-ons: ${plan.selection.addOns.length > 0 ? plan.selection.addOns.join(", ") : "none"}`,
    "Registry items:",
    ...plan.registryItems.map((item) => `  ${item}`),
    "Package entries:",
    ...plan.packageRequirements.map(
      (requirement) =>
        `  ${requirement.cwd}: ${requirement.name} = ${requirement.specifier}`
    ),
    "TypeScript paths:",
    ...plan.typeScriptPathAliases.map(
      (entry) => `  ${entry.cwd}: ${entry.alias} -> ${entry.sourcePath}`
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
