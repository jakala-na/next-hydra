import { readFile } from "node:fs/promises";
import path from "node:path";

import { confirm, isCancel } from "@clack/prompts";
import { getRegistriesConfig, resolveRegistryItems } from "shadcn/registry";
import type { RegistryItem } from "shadcn/schema";

import { pathExists } from "../fs-utils.js";
import { runCommand } from "../git.js";
import { info, success } from "../logger.js";
import { fetchRegistryItemGraph } from "./catalog.js";
import { CompositionValidationError } from "./errors.js";
import {
  addRegistryItemsQuietly,
  withPreparedRegistryArtifacts,
} from "./install.js";
import {
  mergePackageRequirements,
  parsePackageJson,
  readPackageJson,
} from "./packages.js";
import type { PackageJson } from "./packages.js";
import { resolveRegistryTarget } from "./paths.js";
import {
  formatZodError,
  NEXT_HYDRA_SELECTION_SCHEMA_URL,
  selectionDefinitionSchema,
} from "./schema.js";
import { PROVIDER_ALIASES } from "./types.js";
import type { PackageRequirement, SelectionDefinition } from "./types.js";
import { applyPackageEntries } from "./workspace.js";

export type AddOptions = {
  cwd?: string;
  overwrite?: boolean;
  yes?: boolean;
};

type ConfirmPrompt = (
  options: Parameters<typeof confirm>[0]
) => ReturnType<typeof confirm>;

export type AddDependencies = {
  confirm?: ConfirmPrompt;
  install?: (cwd: string) => Promise<void>;
};

type ChangeStatus = "create" | "identical" | "changed";

type FileChange = {
  kind: "registry file";
  status: ChangeStatus;
  target: string;
};

type PackageChange = PackageRequirement & {
  status: ChangeStatus;
  actual?: string;
};

type ParsedDependency = {
  name: string;
  specifier?: string;
};

const EXACT_COPY_FILE_TYPES = new Set(["registry:file", "registry:item"]);

const KNOWN_PROVIDERS = new Map<
  string,
  { dependency: string; packageName: string }
>([
  [
    "next-hydra/auth/clerk",
    { dependency: "@repo/auth", packageName: "@repo/auth-clerk" },
  ],
  [
    "next-hydra/auth/workos",
    { dependency: "@repo/auth", packageName: "@repo/auth-workos" },
  ],
  [
    "next-hydra/cms/contentstack",
    { dependency: "@repo/cms", packageName: "@repo/cms-contentstack" },
  ],
  [
    "next-hydra/cms/drupal",
    { dependency: "@repo/cms", packageName: "@repo/cms-drupal" },
  ],
  [
    "next-hydra/commerce/commercetools",
    {
      dependency: "@repo/commerce-provider",
      packageName: "@repo/commerce-commercetools",
    },
  ],
]);

function parseDependency(request: string): ParsedDependency {
  const packageEnd = request.startsWith("@")
    ? request.indexOf("@", request.indexOf("/") + 1)
    : request.indexOf("@");
  if (packageEnd < 1) {
    return { name: request };
  }
  return {
    name: request.slice(0, packageEnd),
    specifier: request.slice(packageEnd + 1),
  };
}

function packageStatus(
  actual: string | undefined,
  expected: string
): ChangeStatus {
  if (actual === undefined) {
    return "create";
  }
  return actual === expected ? "identical" : "changed";
}

function dependencyStatus(
  actual: string | undefined,
  requested: ParsedDependency
): ChangeStatus {
  if (requested.specifier) {
    return packageStatus(actual, requested.specifier);
  }
  return actual === undefined ? "create" : "identical";
}

function parseSelection(item: RegistryItem): SelectionDefinition | undefined {
  if (item.meta?.nextHydra === undefined) {
    return;
  }
  if (item.$schema !== NEXT_HYDRA_SELECTION_SCHEMA_URL) {
    throw new CompositionValidationError(
      `${item.name} does not use the Next Hydra Selection Definition schema.`,
      [`$schema must be ${NEXT_HYDRA_SELECTION_SCHEMA_URL}`]
    );
  }
  const result = selectionDefinitionSchema.safeParse(item.meta.nextHydra);
  if (!result.success) {
    throw new CompositionValidationError(
      `${item.name} contains invalid Next Hydra metadata. Run the latest create-next-hydra and try again.`,
      formatZodError(result.error)
    );
  }
  return result.data;
}

async function changeStatus(
  absoluteTarget: string,
  expected: string
): Promise<ChangeStatus> {
  if (!(await pathExists(absoluteTarget))) {
    return "create";
  }
  const normalize = (content: string) =>
    content.replaceAll("\r\n", "\n").trim();
  return normalize(await readFile(absoluteTarget, "utf-8")) ===
    normalize(expected)
    ? "identical"
    : "changed";
}

function requireExactCopyFile(type: string, owner: string): void {
  if (!EXACT_COPY_FILE_TYPES.has(type)) {
    throw new CompositionValidationError(
      "Customer add supports only exact-copy registry files in v1.",
      [
        `${owner} uses ${type}; use registry:file or registry:item with an explicit target so the reviewed content is exactly what ShadCN writes`,
      ]
    );
  }
}

async function inspectFiles(
  workspaceRoot: string,
  tree: NonNullable<Awaited<ReturnType<typeof resolveRegistryItems>>>
): Promise<FileChange[]> {
  const registryFiles = await Promise.all(
    (tree.files ?? []).map(async (file) => {
      requireExactCopyFile(file.type, file.path);
      if (!(file.target && file.content !== undefined)) {
        throw new CompositionValidationError(
          "Next Hydra Add-ons require explicit workspace-root file targets.",
          [`${file.path} must include content and a target beginning with ~/`]
        );
      }
      const target = resolveRegistryTarget(file.target);
      return {
        kind: "registry file" as const,
        status: await changeStatus(
          path.join(workspaceRoot, target),
          file.content
        ),
        target,
      };
    })
  );
  const claimed = new Map<string, FileChange["kind"]>();
  for (const change of registryFiles) {
    const existing = claimed.get(change.target);
    if (existing) {
      throw new CompositionValidationError(
        "The requested Add-on targets the same customer file more than once.",
        [`${change.target} is both a ${existing} and a ${change.kind}`]
      );
    }
    claimed.set(change.target, change.kind);
  }
  return registryFiles.sort((left, right) =>
    left.target.localeCompare(right.target)
  );
}

async function inspectPackages(
  workspaceRoot: string,
  requirements: PackageRequirement[],
  tree: NonNullable<Awaited<ReturnType<typeof resolveRegistryItems>>>
): Promise<PackageChange[]> {
  const prospectiveManifests = new Map<string, string>();
  for (const file of tree.files ?? []) {
    if (!(file.target && file.content !== undefined)) {
      continue;
    }
    const target = resolveRegistryTarget(file.target);
    if (target.endsWith("/package.json") || target === "package.json") {
      prospectiveManifests.set(target, file.content);
    }
  }

  return await Promise.all(
    requirements.map(async (requirement) => {
      const relativeManifest = path.posix.join(requirement.cwd, "package.json");
      const prospective = prospectiveManifests.get(relativeManifest);
      const manifest =
        prospective === undefined
          ? await readPackageJson(
              path.join(workspaceRoot, relativeManifest),
              relativeManifest
            )
          : parsePackageJson(prospective, relativeManifest);
      const actual = manifest[requirement.section]?.[requirement.name];
      return {
        ...requirement,
        actual,
        status: packageStatus(actual, requirement.specifier),
      };
    })
  );
}

async function inspectRootDependencies(
  workspaceRoot: string,
  tree: NonNullable<Awaited<ReturnType<typeof resolveRegistryItems>>>
): Promise<PackageChange[]> {
  const manifest = await readPackageJson(
    path.join(workspaceRoot, "package.json"),
    "package.json"
  );
  const requests = [
    ...(tree.dependencies ?? []).map((request) => ({
      ...parseDependency(request),
      section: "dependencies" as const,
    })),
    ...(tree.devDependencies ?? []).map((request) => ({
      ...parseDependency(request),
      section: "devDependencies" as const,
    })),
  ];

  return requests.map((request) => {
    const actual = manifest[request.section]?.[request.name];
    const specifier = request.specifier ?? actual ?? "registry default";
    return {
      actual,
      cwd: ".",
      name: request.name,
      section: request.section,
      specifier,
      status: dependencyStatus(actual, request),
    };
  });
}

function usesProviderAlias(
  actual: string | undefined,
  packageName: string
): boolean {
  if (!actual) {
    return false;
  }
  return (
    actual === packageName ||
    actual.startsWith(`workspace:${packageName}@`) ||
    actual.startsWith(`npm:${packageName}@`)
  );
}

function providerExpectation(
  selectionId: string,
  selectionsById: Map<string, SelectionDefinition>
):
  | { dependency: string; packageName: string }
  | { dependency: string; specifier: string }
  | undefined {
  const selection = selectionsById.get(selectionId);
  if (selection?.kind === "provider" && selection.slot && selection.binding) {
    return {
      dependency: PROVIDER_ALIASES[selection.slot],
      specifier: selection.binding.specifier,
    };
  }
  return KNOWN_PROVIDERS.get(selectionId);
}

function matchesProviderExpectation(
  actual: string | undefined,
  expectation: NonNullable<ReturnType<typeof providerExpectation>>
): boolean {
  return "specifier" in expectation
    ? actual === expectation.specifier
    : usesProviderAlias(actual, expectation.packageName);
}

function validateKnownProviderCompatibility(
  manifest: PackageJson,
  selections: SelectionDefinition[]
): string[] {
  if (selections.length === 0) {
    return [];
  }
  const issues: string[] = [];
  const assumptions: string[] = [];
  const selectionsById = new Map(selections.map((item) => [item.id, item]));

  for (const selection of selections) {
    if (selection.kind !== "provider") {
      continue;
    }
    const provider = providerExpectation(selection.id, selectionsById);
    if (!provider) {
      issues.push(
        `${selection.id} is a Provider in the requested graph but does not declare a usable Provider binding`
      );
      continue;
    }
    const actual = manifest.dependencies?.[provider.dependency];
    if (!matchesProviderExpectation(actual, provider)) {
      issues.push(
        `${selection.id} is a Provider in the requested graph, but the current provider alias ${provider.dependency} is ${actual ?? "missing"}`
      );
    }
  }

  for (const selection of selections) {
    for (const required of selection.compatibility.requires) {
      const provider = providerExpectation(required, selectionsById);
      const requiredSelection = selectionsById.get(required);
      if (
        provider &&
        !matchesProviderExpectation(
          manifest.dependencies?.[provider.dependency],
          provider
        )
      ) {
        issues.push(`${selection.id} requires ${required}`);
      } else if (!(provider || requiredSelection?.kind === "add-on")) {
        assumptions.push(
          `${selection.id} requires ${required}; this customer workspace has no authoritative selection record, so Next Hydra cannot verify it`
        );
      }
    }
    for (const conflict of selection.compatibility.conflicts) {
      const provider = providerExpectation(conflict, selectionsById);
      const conflictingSelection = selectionsById.get(conflict);
      if (
        (provider &&
          matchesProviderExpectation(
            manifest.dependencies?.[provider.dependency],
            provider
          )) ||
        conflictingSelection?.kind === "add-on"
      ) {
        issues.push(`${selection.id} conflicts with ${conflict}`);
      } else if (!provider) {
        assumptions.push(
          `${selection.id} conflicts with ${conflict}; this customer workspace has no authoritative selection record, so Next Hydra cannot verify its absence`
        );
      }
    }
  }
  if (issues.length > 0) {
    throw new CompositionValidationError(
      "The Add-on is incompatible with the current provider aliases.",
      issues
    );
  }
  return [...new Set(assumptions)].sort((left, right) =>
    left.localeCompare(right)
  );
}

function resolveCustomerProviderRequirements(
  manifest: PackageJson,
  selections: SelectionDefinition[]
): PackageRequirement[] {
  const requirements: PackageRequirement[] = [];
  const issues: string[] = [];

  for (const selection of selections) {
    for (const dependency of selection.providerDependencies) {
      const name = PROVIDER_ALIASES[dependency.slot];
      const specifier = manifest.dependencies?.[name];
      if (!specifier) {
        issues.push(
          `${selection.id} needs the ${dependency.slot} Provider at ${dependency.cwd}, but apps/web/package.json does not declare ${name}`
        );
        continue;
      }
      requirements.push({
        cwd: dependency.cwd,
        name,
        section: dependency.section,
        specifier,
      });
    }
  }

  if (issues.length > 0) {
    throw new CompositionValidationError(
      "The Add-on's Provider dependencies could not be resolved from the customer workspace.",
      issues
    );
  }

  return requirements;
}

function validateRegistryTargetClaims(items: Iterable<RegistryItem>): void {
  const claims = new Map<string, string>();
  const issues: string[] = [];
  for (const item of items) {
    for (const file of item.files ?? []) {
      requireExactCopyFile(file.type, `${item.name}:${file.path}`);
      if (!(file.target && file.content !== undefined)) {
        throw new CompositionValidationError(
          "Next Hydra Add-ons require explicit workspace-root file targets.",
          [
            `${item.name}:${file.path} must include content and a target beginning with ~/`,
          ]
        );
      }
      const target = resolveRegistryTarget(file.target);
      const owner = `${item.name}:${file.path}`;
      const existing = claims.get(target);
      if (existing && existing !== owner) {
        issues.push(`${target} is claimed by both ${existing} and ${owner}`);
      } else {
        claims.set(target, owner);
      }
    }
  }
  if (issues.length > 0) {
    throw new CompositionValidationError(
      "The registry dependency graph targets the same customer file more than once.",
      issues
    );
  }
}

function describeShadcnEffects(
  tree: NonNullable<Awaited<ReturnType<typeof resolveRegistryItems>>>,
  items: Iterable<RegistryItem>
): string[] {
  const hasValues = (value: unknown): boolean => {
    if (Array.isArray(value)) {
      return value.some(hasValues);
    }
    if (value !== null && typeof value === "object") {
      return Object.values(value).some(hasValues);
    }
    return (
      value !== undefined && value !== null && value !== false && value !== ""
    );
  };
  const effects: string[] = [];
  const envKeys = Object.keys(tree.envVars ?? {}).sort();
  if (envKeys.length > 0) {
    effects.push(
      `environment placeholders may be merged by ShadCN: ${envKeys.join(", ")}`
    );
  }
  if (hasValues(tree.tailwind)) {
    effects.push("Tailwind configuration will be merged by ShadCN");
  }
  if (hasValues(tree.cssVars)) {
    effects.push("CSS variables will be merged by ShadCN");
  }
  if (hasValues(tree.css)) {
    effects.push("CSS declarations will be merged by ShadCN");
  }
  if ((tree.fonts?.length ?? 0) > 0) {
    effects.push(
      `${tree.fonts?.length ?? 0} font definition(s) will be applied by ShadCN`
    );
  }
  if (
    [...items].some((item) => "config" in item && item.config !== undefined)
  ) {
    effects.push("ShadCN project configuration will be updated");
  }

  return [...new Set(effects)];
}

async function confirmChanges(
  fileChanges: FileChange[],
  packageChanges: PackageChange[],
  options: Pick<AddOptions, "overwrite" | "yes">,
  prompt: ConfirmPrompt
): Promise<void> {
  const overwrite = options.overwrite ?? false;
  const yes = options.yes === true;
  const conflicts = [
    ...fileChanges
      .filter((change) => change.status === "changed")
      .map((change) => ({ kind: change.kind, label: change.target })),
    ...packageChanges
      .filter((change) => change.status === "changed")
      .map((change) => ({
        kind: "dependency",
        label: `${change.cwd}/package.json ${change.name}: ${change.actual} -> ${change.specifier}`,
      })),
  ];

  if (yes && !overwrite && conflicts.length > 0) {
    throw new CompositionValidationError(
      "Additive installation found customer-owned conflicts.",
      conflicts.map(
        (conflict) =>
          `${conflict.label} requires --overwrite; --yes only skips confirmation prompts for non-conflicting changes`
      )
    );
  }

  if (!overwrite) {
    for (const conflict of conflicts) {
      // Without a global overwrite authorization, each customer-owned change
      // receives its own explicit confirmation.
      // oxlint-disable-next-line no-await-in-loop -- Sequential confirmation is the safety contract.
      const approved = await prompt({
        initialValue: false,
        message: `Replace changed ${conflict.kind} ${conflict.label}?`,
      });
      if (isCancel(approved) || !approved) {
        throw new Error(
          "Installation cancelled. No files or package entries were changed."
        );
      }
    }
  }

  if (!yes) {
    const approved = await prompt({
      initialValue: true,
      message: "Apply the listed Add-on changes?",
    });
    if (isCancel(approved) || !approved) {
      throw new Error("Installation cancelled. No changes were made.");
    }
  }
}

export async function addRegistryItem(
  reference: string,
  options: AddOptions = {},
  dependencies: AddDependencies = {}
): Promise<void> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const localReference = path.resolve(cwd, reference);
  const resolvedReference =
    !path.isAbsolute(reference) && (await pathExists(localReference))
      ? localReference
      : reference;
  const config = await getRegistriesConfig(cwd);
  const graph = await fetchRegistryItemGraph({
    config,
    cwd,
    references: [resolvedReference],
  });
  const primaryName = graph.itemByReference.get(resolvedReference);
  const primary = primaryName ? graph.items.get(primaryName) : undefined;
  if (!primary) {
    throw new Error(`The registry returned no item for ${reference}.`);
  }

  const selection = parseSelection(primary);
  const graphSelections = [...graph.items.values()]
    .map(parseSelection)
    .filter((value): value is SelectionDefinition => Boolean(value));
  if (selection) {
    if (selection.kind === "preset") {
      throw new Error(
        "Presets compose a new workspace. Use `create-next-hydra <directory> --preset ...` instead of `add`."
      );
    }
    if (selection.kind === "provider") {
      throw new Error(
        "Providers must be selected while scaffolding or with `create-next-hydra use`; `add` does not switch a customer workspace provider."
      );
    }
  }

  const nestedPresets = graphSelections.filter(
    (candidate) => candidate.kind === "preset"
  );
  if (nestedPresets.length > 0) {
    throw new CompositionValidationError(
      "Presets cannot be installed into a Customer Workspace.",
      nestedPresets.map(
        (candidate) =>
          `${candidate.id} appears in the requested registry dependency graph`
      )
    );
  }

  const assetSelections = graphSelections.filter(
    (candidate) => candidate.assets.length > 0
  );
  if (assetSelections.length > 0) {
    throw new CompositionValidationError(
      "Customer Add-ons cannot install separate binary assets in v1.",
      assetSelections.map(
        (candidate) =>
          `${candidate.id} must put text files in its registry item; binary asset transport requires a future extension`
      )
    );
  }
  const patchSelections = graphSelections.filter(
    (candidate) => candidate.pnpmPatches.length > 0
  );
  if (patchSelections.length > 0) {
    throw new CompositionValidationError(
      "Customer Add-ons cannot change pnpm patches in v1.",
      patchSelections.map(
        (candidate) =>
          `${candidate.id} must avoid pnpmPatches or be selected during a new scaffold`
      )
    );
  }

  validateRegistryTargetClaims(graph.items.values());
  const providerSelectionIds = new Set(
    graphSelections
      .filter((candidate) => candidate.kind === "provider")
      .map((candidate) => candidate.id)
  );
  const needsProviderManifest = graphSelections.some(
    (candidate) =>
      candidate.kind === "provider" ||
      candidate.providerDependencies.length > 0 ||
      [
        ...candidate.compatibility.requires,
        ...candidate.compatibility.conflicts,
      ].some(
        (selectionId) =>
          KNOWN_PROVIDERS.has(selectionId) ||
          providerSelectionIds.has(selectionId)
      )
  );
  const providerManifest = needsProviderManifest
    ? await readPackageJson(
        path.join(cwd, "apps/web/package.json"),
        "apps/web/package.json"
      )
    : {};
  const compatibilityAssumptions = validateKnownProviderCompatibility(
    providerManifest,
    graphSelections
  );
  const packageRequirements = mergePackageRequirements([
    ...graphSelections.flatMap((candidate) => candidate.packages),
    ...resolveCustomerProviderRequirements(providerManifest, graphSelections),
  ]);
  await withPreparedRegistryArtifacts({
    artifacts: [...graph.items.values()],
    entryItems: [primary.name],
    itemByReference: graph.itemByReference,
    run: async (entries) => {
      const tree = await resolveRegistryItems(entries, { config });
      if (!tree) {
        throw new Error(
          `The registry dependency graph for ${reference} is empty.`
        );
      }

      const fileChanges = await inspectFiles(cwd, tree);
      const packageChanges = await inspectPackages(
        cwd,
        packageRequirements,
        tree
      );
      const rootDependencyChanges = await inspectRootDependencies(cwd, tree);
      const disclosedPackageChanges = [
        ...packageChanges,
        ...rootDependencyChanges,
      ];
      const shadcnEffects = describeShadcnEffects(tree, graph.items.values());

      info(
        [
          `Registry item: ${primary.name}`,
          "Files:",
          ...fileChanges.map(
            (change) => `  ${change.status}: ${change.target} (${change.kind})`
          ),
          "Package entries:",
          ...disclosedPackageChanges.map(
            (change) =>
              `  ${change.status}: ${change.cwd} ${change.name} = ${change.specifier}`
          ),
          ...(compatibilityAssumptions.length > 0
            ? [
                "Compatibility assumptions:",
                ...compatibilityAssumptions.map(
                  (assumption) => `  ${assumption}`
                ),
              ]
            : []),
          ...(shadcnEffects.length > 0
            ? [
                "Additional ShadCN effects:",
                ...shadcnEffects.map((effect) => `  ${effect}`),
              ]
            : []),
        ].join("\n")
      );

      await confirmChanges(
        fileChanges,
        disclosedPackageChanges,
        options,
        dependencies.confirm ?? confirm
      );
      await addRegistryItemsQuietly(entries, {
        config,
        cwd,
        overwrite:
          options.overwrite === true ||
          fileChanges.some(
            (change) =>
              change.kind === "registry file" && change.status === "changed"
          ),
      });
      const changedPackageEntries = packageChanges
        .filter((change) => change.status !== "identical")
        .map(
          ({ status: _status, actual: _actual, ...requirement }) => requirement
        );
      await applyPackageEntries(cwd, changedPackageEntries);
      if (changedPackageEntries.length > 0) {
        if (dependencies.install) {
          await dependencies.install(cwd);
        } else {
          await runCommand("pnpm", ["install"], { cwd });
        }
      }
    },
  });
  success(`Added ${primary.name}.`);
}
