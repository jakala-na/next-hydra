import path from "node:path";

import { runCommand } from "../git.js";
import { info, printNextSteps, success } from "../logger.js";
import { addCatalogReferences, loadSourceRegistryCatalog } from "./catalog.js";
import { CompositionValidationError } from "./errors.js";
import { formatCompositionPlan } from "./format.js";
import { planComposition, selectionFromPreset } from "./planner.js";
import type { ProviderSlot, WorkspaceSelection } from "./types.js";
import {
  applyGeneratedRoutes,
  applyPackageRequirements,
  applyPnpmPatches,
  checkWorkspaceComposition,
  readWorkspaceSelection,
  writeWorkspaceSelection,
} from "./workspace.js";

export type UseCompositionOptions = {
  cwd?: string;
  auth?: string;
  cms?: string;
  commerce?: string;
  addOns?: string[];
  preset?: string;
  check?: boolean;
  verbose?: boolean;
};

type UseDependencies = {
  install?: (cwd: string, verbose: boolean) => Promise<void>;
};

function requestedSelection(
  current: WorkspaceSelection,
  options: UseCompositionOptions,
  presetSelection?: WorkspaceSelection
): WorkspaceSelection {
  const providers = presetSelection
    ? { ...presetSelection.providers }
    : { ...current.providers };
  const providerOverrides: Partial<Record<ProviderSlot, string>> = {
    auth: options.auth,
    cms: options.cms,
    commerce: options.commerce,
  };

  for (const [slot, reference] of Object.entries(providerOverrides) as [
    ProviderSlot,
    string | undefined,
  ][]) {
    if (reference) {
      providers[slot] = reference;
    }
  }

  const presetAddOns = presetSelection ? presetSelection.addOns : [];
  let addOns = presetSelection ? presetAddOns : current.addOns;
  if (options.addOns) {
    addOns = [...presetAddOns, ...options.addOns];
  }

  return { addOns: [...new Set(addOns)], providers };
}

function operationFailure(
  error: unknown,
  failed: string,
  completed: string[],
  pending: string[]
): Error {
  const cause = error instanceof Error ? error.message : String(error);
  return new Error(
    [
      `Composition stopped while ${failed}.`,
      `Completed: ${completed.length > 0 ? completed.join(", ") : "none"}.`,
      `Not attempted: ${pending.length > 0 ? pending.join(", ") : "none"}.`,
      "The workspace changes have been left in place for inspection or repair.",
      "",
      cause,
    ].join("\n")
  );
}

export async function useComposition(
  options: UseCompositionOptions,
  dependencies: UseDependencies = {}
): Promise<void> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const current = await readWorkspaceSelection(cwd);

  if (
    options.check &&
    (options.auth ||
      options.cms ||
      options.commerce ||
      options.preset ||
      options.addOns)
  ) {
    throw new Error(
      "`use --check` reads next-hydra.json and accepts no selections."
    );
  }

  if (options.preset && (options.auth || options.cms || options.commerce)) {
    throw new Error("`use --preset` cannot be combined with provider flags.");
  }

  let catalog = await loadSourceRegistryCatalog(cwd);
  catalog = await addCatalogReferences(catalog, [
    ...Object.values(current.providers),
    ...current.addOns,
    ...[options.auth, options.cms, options.commerce, options.preset].filter(
      (value): value is string => Boolean(value)
    ),
    ...(options.addOns ?? []),
  ]);
  const presetSelection = options.preset
    ? selectionFromPreset(catalog, options.preset)
    : undefined;
  const selection = options.check
    ? current
    : requestedSelection(current, options, presetSelection);
  catalog = await addCatalogReferences(catalog, [
    ...Object.values(selection.providers),
    ...selection.addOns,
  ]);
  const plan = planComposition(catalog, selection);

  info(formatCompositionPlan(plan));

  if (options.check) {
    const drift = await checkWorkspaceComposition(cwd, plan);
    if (drift.length > 0) {
      throw new CompositionValidationError(
        "The maintainer workspace differs from next-hydra.json.",
        drift
      );
    }
    success("The maintainer workspace matches next-hydra.json.");
    return;
  }

  const completed: string[] = [];
  const pending = [
    "write next-hydra.json",
    "update package aliases",
    "update pnpm patches",
    "generate routes",
    "install dependencies",
  ];

  const runStep = async (label: string, operation: () => Promise<void>) => {
    pending.shift();
    try {
      await operation();
      completed.push(label);
    } catch (error) {
      throw operationFailure(error, label, completed, pending);
    }
  };

  await runStep("write next-hydra.json", () =>
    writeWorkspaceSelection(cwd, plan.selection)
  );
  await runStep("update package aliases", () =>
    applyPackageRequirements(cwd, plan)
  );
  await runStep("update pnpm patches", () => applyPnpmPatches(cwd, plan));
  await runStep("generate routes", () => applyGeneratedRoutes(cwd, plan));
  await runStep("install dependencies", async () => {
    if (dependencies.install) {
      await dependencies.install(cwd, options.verbose ?? false);
      return;
    }
    await runCommand("pnpm", ["install"], {
      cwd,
      verbose: options.verbose ?? false,
    });
  });

  if (plan.instructions.length > 0) {
    printNextSteps(plan.instructions.join("\n\n"), "Provider setup");
  }
  success("Maintainer workspace composition updated.");
}
