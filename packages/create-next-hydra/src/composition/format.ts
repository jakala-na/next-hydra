import { PROVIDER_SLOTS } from "./types.js";
import type { CompositionPlan, WorkspaceSelection } from "./types.js";

const NO_ADD_ONS = "none";

function formatAddOns(addOns: readonly string[]): string {
  return addOns.length > 0 ? [...addOns].sort().join(", ") : NO_ADD_ONS;
}

function sameAddOns(
  current: readonly string[],
  proposed: readonly string[]
): boolean {
  return formatAddOns(current) === formatAddOns(proposed);
}

function formatTransition(current: string, proposed: string): string {
  return current === proposed
    ? `${current} (unchanged)`
    : `${current} -> ${proposed}`;
}

function compositionChanges(
  current: WorkspaceSelection,
  proposed: WorkspaceSelection
): string[] {
  const providerChanges = PROVIDER_SLOTS.filter(
    (slot) => current.providers[slot] !== proposed.providers[slot]
  ).map(
    (slot) =>
      `${slot}: ${current.providers[slot]} -> ${proposed.providers[slot]}`
  );
  const addOnChanges = sameAddOns(current.addOns, proposed.addOns)
    ? []
    : [
        `add-ons: ${formatAddOns(current.addOns)} -> ${formatAddOns(proposed.addOns)}`,
      ];

  return [...providerChanges, ...addOnChanges];
}

export function hasCompositionChanges(
  current: WorkspaceSelection,
  proposed: WorkspaceSelection
): boolean {
  return compositionChanges(current, proposed).length > 0;
}

export function formatCompositionPreview(
  current: WorkspaceSelection,
  proposed: WorkspaceSelection
): string {
  const currentAddOns = formatAddOns(current.addOns);
  const proposedAddOns = formatAddOns(proposed.addOns);
  const lines = [
    "Maintainer workspace composition",
    "",
    "Current -> Proposed",
    "Providers:",
    ...PROVIDER_SLOTS.map(
      (slot) =>
        `  ${slot}: ${formatTransition(current.providers[slot], proposed.providers[slot])}`
    ),
    `Add-ons: ${currentAddOns === proposedAddOns ? `${currentAddOns} (unchanged)` : `${currentAddOns} -> ${proposedAddOns}`}`,
  ];

  if (hasCompositionChanges(current, proposed)) {
    lines.push(
      "",
      "Planned actions:",
      "  replace managed application files",
      "  install selected source",
      "  update package aliases",
      "  update TypeScript paths",
      "  update pnpm patches",
      "  run pnpm install"
    );
  }

  return lines.join("\n");
}

export function formatCompositionResult(
  current: WorkspaceSelection,
  proposed: WorkspaceSelection
): string {
  const changes = compositionChanges(current, proposed);
  return changes.length > 0
    ? `Maintainer workspace composition updated: ${changes.join("; ")}.`
    : "No composition changes to apply.";
}

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
