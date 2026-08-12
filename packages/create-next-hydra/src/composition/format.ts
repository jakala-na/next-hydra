import type { CompositionPlan } from "./types.js";

export function formatCompositionPlan(plan: CompositionPlan): string {
  const lines = [
    "Providers:",
    ...Object.entries(plan.selection.providers).map(
      ([slot, provider]) => `  ${slot}: ${provider}`
    ),
    `Add-ons: ${plan.selection.addOns.length > 0 ? plan.selection.addOns.join(", ") : "none"}`,
    "Install units:",
    ...plan.installUnits.map((unit) => `  ${unit.item} in ${unit.cwd}`),
    "Package entries:",
    ...plan.packageRequirements.map(
      (requirement) =>
        `  ${requirement.cwd}: ${requirement.name} = ${requirement.specifier}`
    ),
    "pnpm patches:",
    ...plan.pnpmPatches.map(
      (patch) => `  ${patch.dependency} -> ${patch.path}`
    ),
    "Generated routes:",
    ...plan.routes.map(
      (route) =>
        `  ${route.method} ${route.path} -> ${route.module}#${route.export}`
    ),
  ];

  return lines.join("\n");
}
