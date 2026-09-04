import { APP_SLOTS, PROVIDER_SLOTS } from "./types.js";
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

function formatProvider(provider: string | undefined): string {
  return provider ?? "none";
}

function formatTransition(
  current: string | undefined,
  proposed: string | undefined
): string {
  const currentProvider = formatProvider(current);
  const proposedProvider = formatProvider(proposed);
  return currentProvider === proposedProvider
    ? `${currentProvider} (unchanged)`
    : `${currentProvider} -> ${proposedProvider}`;
}

function compositionChanges(
  current: WorkspaceSelection,
  proposed: WorkspaceSelection
): string[] {
  const appChanges = APP_SLOTS.filter(
    (app) => current.apps?.[app] !== proposed.apps?.[app]
  ).map(
    (app) =>
      `${app}: ${formatProvider(current.apps?.[app])} -> ${formatProvider(proposed.apps?.[app])}`
  );
  const providerChanges = PROVIDER_SLOTS.filter(
    (slot) => current.providers[slot] !== proposed.providers[slot]
  ).map(
    (slot) =>
      `${slot}: ${formatProvider(current.providers[slot])} -> ${formatProvider(proposed.providers[slot])}`
  );
  const addOnChanges = sameAddOns(current.addOns, proposed.addOns)
    ? []
    : [
        `add-ons: ${formatAddOns(current.addOns)} -> ${formatAddOns(proposed.addOns)}`,
      ];

  return [...appChanges, ...providerChanges, ...addOnChanges];
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
    "Applications:",
    ...APP_SLOTS.map(
      (app) =>
        `  ${app}: ${formatTransition(current.apps?.[app], proposed.apps?.[app])}`
    ),
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
    "Applications:",
    ...APP_SLOTS.map(
      (app) => `  ${app}: ${formatProvider(plan.selection.apps?.[app])}`
    ),
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
