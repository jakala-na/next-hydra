import { readFile } from "node:fs/promises";
import path from "node:path";
import { confirm, isCancel } from "@clack/prompts";
import { getRegistriesConfig, getRegistryItems } from "shadcn/registry";
import type { RegistryItem } from "shadcn/schema";

import { pathExists, readJsonFile } from "../fs-utils.js";
import { info, printNextSteps, success } from "../logger.js";
import { CompositionValidationError } from "./errors.js";
import { installPreparedComposition } from "./install.js";
import { normalizeWorkspaceRoot, resolveRegistryTarget } from "./paths.js";
import {
  formatZodError,
  NEXT_HYDRA_SELECTION_SCHEMA_URL,
  selectionDefinitionSchema,
} from "./schema.js";
import type {
  PackageRequirement,
  PreparedComposition,
  SelectionDefinition,
} from "./types.js";
import { applyPackageEntries } from "./workspace.js";

export type AddOptions = {
  cwd?: string;
  roots?: string[];
  yes?: boolean;
};

type FileChange = {
  target: string;
  status: "create" | "identical" | "changed";
  item: RegistryItem;
  fileIndex: number;
};

type PackageChange = PackageRequirement & {
  status: "create" | "identical" | "changed";
  actual?: string;
};

type ParsedDependency = {
  name: string;
  specifier?: string;
};

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
): PackageChange["status"] {
  if (actual === undefined) {
    return "create";
  }
  return actual === expected ? "identical" : "changed";
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

async function inspectFiles(
  workspaceRoot: string,
  artifacts: RegistryItem[],
  units: Array<{ item: string; cwd: string }>
): Promise<FileChange[]> {
  const byName = new Map(
    artifacts.map((artifact) => [artifact.name, artifact])
  );
  const tasks = units.flatMap((unit) => {
    const item = byName.get(unit.item);
    if (!item) {
      throw new CompositionValidationError("Missing Add-on Install Unit.", [
        `${unit.item} was not returned by the requested registry dependency graph`,
      ]);
    }
    return (item.files ?? []).map(async (file, fileIndex) => {
      if (!(file.target && file.content !== undefined)) {
        throw new CompositionValidationError(
          "Next Hydra Add-ons require explicit file targets and resolved content.",
          [`${item.name}:${file.path} cannot be inspected before installation`]
        );
      }
      const target = resolveRegistryTarget(unit.cwd, file.target);
      const absoluteTarget = path.join(workspaceRoot, target);
      if (!(await pathExists(absoluteTarget))) {
        return {
          fileIndex,
          item,
          status: "create",
          target,
        } satisfies FileChange;
      }
      const current = await readFile(absoluteTarget, "utf8");
      return {
        fileIndex,
        item,
        status: current === file.content ? "identical" : "changed",
        target,
      } satisfies FileChange;
    });
  });
  const changes = await Promise.all(tasks);

  const claimedTargets = new Set<string>();
  for (const change of changes) {
    if (claimedTargets.has(change.target)) {
      throw new CompositionValidationError(
        "The requested registry items target the same customer file more than once.",
        [change.target]
      );
    }
    claimedTargets.add(change.target);
  }
  return changes.sort((left, right) => left.target.localeCompare(right.target));
}

function inspectPackages(
  workspaceRoot: string,
  requirements: PackageRequirement[]
): Promise<PackageChange[]> {
  return Promise.all(
    requirements.map(async (requirement) => {
      const manifest = await readJsonFile<
        Partial<Record<PackageRequirement["section"], Record<string, string>>>
      >(path.join(workspaceRoot, requirement.cwd, "package.json"));
      const actual = manifest[requirement.section]?.[requirement.name];
      return {
        ...requirement,
        actual,
        status: packageStatus(actual, requirement.specifier),
      };
    })
  );
}

function inspectRegistryPackages(
  workspaceRoot: string,
  artifacts: RegistryItem[],
  units: Array<{ item: string; cwd: string }>
): Promise<PackageChange[]> {
  const byName = new Map(
    artifacts.map((artifact) => [artifact.name, artifact])
  );
  const requests = units.flatMap((unit) => {
    const artifact = byName.get(unit.item);
    if (!artifact) {
      return [];
    }
    return [
      ...(artifact.dependencies ?? []).map((request) => ({
        ...parseDependency(request),
        cwd: unit.cwd,
        section: "dependencies" as const,
      })),
      ...(artifact.devDependencies ?? []).map((request) => ({
        ...parseDependency(request),
        cwd: unit.cwd,
        section: "devDependencies" as const,
      })),
    ];
  });

  return Promise.all(
    requests.map(async (request) => {
      const manifest = await readJsonFile<
        Partial<Record<PackageRequirement["section"], Record<string, string>>>
      >(path.join(workspaceRoot, request.cwd, "package.json"));
      const actual = manifest[request.section]?.[request.name];
      const specifier = request.specifier ?? actual ?? "registry default";
      let status: PackageChange["status"] =
        actual === undefined ? "create" : "identical";
      if (request.specifier) {
        status = packageStatus(actual, request.specifier);
      }
      return {
        ...request,
        actual,
        specifier,
        status,
      };
    })
  );
}

async function confirmChanges(
  fileChanges: FileChange[],
  packageChanges: PackageChange[],
  yes: boolean
): Promise<void> {
  const conflicts = [
    ...fileChanges
      .filter((change) => change.status === "changed")
      .map((change) => ({ kind: "file", label: change.target })),
    ...packageChanges
      .filter((change) => change.status === "changed")
      .map((change) => ({
        kind: "dependency",
        label: `${change.cwd}/package.json ${change.name}: ${change.actual} -> ${change.specifier}`,
      })),
  ];

  if (yes && conflicts.length > 0) {
    throw new CompositionValidationError(
      "Additive installation found customer-owned conflicts.",
      conflicts.map(
        (conflict) =>
          `${conflict.label} must be reviewed interactively; --yes never authorizes changed ${conflict.kind}s`
      )
    );
  }

  for (const conflict of conflicts) {
    // Conflicts are deliberately confirmed one at a time so one answer cannot
    // authorize overwriting another customer-owned target.
    // biome-ignore lint/performance/noAwaitInLoops: sequential confirmation is the safety contract
    const approved = await confirm({
      initialValue: false,
      message: `Replace changed ${conflict.kind} ${conflict.label}?`,
    });
    if (isCancel(approved) || !approved) {
      throw new Error(
        "Installation cancelled. No files or package entries were changed."
      );
    }
  }

  if (!yes) {
    const approved = await confirm({
      initialValue: true,
      message: "Apply the listed Add-on changes?",
    });
    if (isCancel(approved) || !approved) {
      throw new Error("Installation cancelled. No changes were made.");
    }
  }
}

function installUnits(
  selection: SelectionDefinition | undefined,
  primary: RegistryItem,
  artifacts: RegistryItem[],
  rootOverrides: Map<string, string>
): Array<{ item: string; cwd: string }> {
  let declared: Array<{ item: string; cwd: string }>;
  if (!selection) {
    declared = artifacts.map((artifact) => ({
      cwd: ".",
      item: artifact.name,
    }));
  } else if (selection.installUnits.length > 0) {
    declared = selection.installUnits;
  } else {
    declared = [{ cwd: ".", item: primary.name }];
  }
  const itemNames = new Set(declared.map((unit) => unit.item));
  const unknownOverrides = [...rootOverrides.keys()].filter(
    (item) => !itemNames.has(item)
  );
  if (unknownOverrides.length > 0) {
    throw new CompositionValidationError(
      "Install Unit root overrides name unknown registry items.",
      unknownOverrides
    );
  }
  return declared.map((unit) => ({
    ...unit,
    cwd: rootOverrides.get(unit.item) ?? unit.cwd,
  }));
}

function parseRootOverrides(values: string[]): Map<string, string> {
  const overrides = new Map<string, string>();
  for (const value of values) {
    const separator = value.indexOf("=");
    if (separator < 1 || separator === value.length - 1) {
      throw new CompositionValidationError(
        "Invalid Install Unit root override.",
        [`${value} must use <registry-item>=<workspace-path>`]
      );
    }
    const item = value.slice(0, separator).trim();
    const root = normalizeWorkspaceRoot(value.slice(separator + 1));
    if (overrides.has(item)) {
      throw new CompositionValidationError(
        "An Install Unit root was overridden more than once.",
        [item]
      );
    }
    overrides.set(item, root);
  }
  return overrides;
}

function preparedFromChanges(
  artifacts: RegistryItem[],
  units: Array<{ item: string; cwd: string }>,
  changes: FileChange[]
): PreparedComposition {
  const byName = new Map(
    artifacts.map((artifact) => [artifact.name, artifact])
  );
  const installable = new Map(
    changes
      .filter((change) => change.status !== "identical")
      .map((change) => [`${change.item.name}\0${change.fileIndex}`, change])
  );

  return {
    assets: [],
    units: units.map((unit, index) => {
      const artifact = byName.get(unit.item);
      if (!artifact) {
        throw new Error(`Missing resolved artifact ${unit.item}.`);
      }
      return {
        ...unit,
        artifact: {
          ...artifact,
          files: (artifact.files ?? []).filter((_file, fileIndex) =>
            installable.has(`${artifact.name}\0${fileIndex}`)
          ),
          name: `${artifact.name}-${index}`,
        },
        selectionId: artifact.name,
        targets: [],
      };
    }),
  };
}

export async function addRegistryItem(
  reference: string,
  options: AddOptions = {}
): Promise<void> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const localReference = path.resolve(cwd, reference);
  const resolvedReference =
    !path.isAbsolute(reference) && (await pathExists(localReference))
      ? localReference
      : reference;
  const artifacts = await getRegistryItems([resolvedReference], {
    config: await getRegistriesConfig(cwd),
  });
  const [primary] = artifacts;
  if (!primary) {
    throw new Error(`The registry returned no item for ${reference}.`);
  }

  const selection = parseSelection(primary);
  if (selection?.kind === "preset") {
    throw new Error(
      "Presets compose a new workspace. Use `create-next-hydra <directory> --preset ...` instead of `add`."
    );
  }
  if (selection?.kind === "provider") {
    throw new Error(
      "Providers must be selected while scaffolding or with `create-next-hydra use`; `add` does not switch a customer workspace provider."
    );
  }
  if (
    selection &&
    (selection.routes.length > 0 || selection.assets.length > 0)
  ) {
    throw new CompositionValidationError(
      "This Add-on needs composition changes that customer `add` does not apply in v1.",
      [
        ...(selection.routes.length > 0
          ? [
              "generated routes require a maintainer composition or new scaffold",
            ]
          : []),
        ...(selection.assets.length > 0
          ? [
              "separate binary assets require a maintainer composition or new scaffold",
            ]
          : []),
      ]
    );
  }

  const units = installUnits(
    selection,
    primary,
    artifacts,
    parseRootOverrides(options.roots ?? [])
  );
  const fileChanges = await inspectFiles(cwd, artifacts, units);
  const packageChanges = await inspectPackages(
    cwd,
    selection ? selection.packages : []
  );
  const registryPackageChanges = await inspectRegistryPackages(
    cwd,
    artifacts,
    units
  );
  const disclosedPackageChanges = [
    ...packageChanges,
    ...registryPackageChanges,
  ];
  const requiredSelections = selection ? selection.compatibility.requires : [];
  const conflictingSelections = selection
    ? selection.compatibility.conflicts
    : [];

  info(
    [
      `Registry item: ${primary.name}`,
      ...(requiredSelections.length
        ? [`Assumes selections: ${requiredSelections.join(", ")}`]
        : []),
      ...(conflictingSelections.length
        ? [`Conflicts with selections: ${conflictingSelections.join(", ")}`]
        : []),
      "Install Units:",
      ...units.map((unit) => `  ${unit.item} in ${unit.cwd}`),
      "Files:",
      ...fileChanges.map((change) => `  ${change.status}: ${change.target}`),
      "Package entries:",
      ...disclosedPackageChanges.map(
        (change) =>
          `  ${change.status}: ${change.cwd} ${change.name} = ${change.specifier}`
      ),
    ].join("\n")
  );

  await confirmChanges(
    fileChanges,
    disclosedPackageChanges,
    options.yes ?? false
  );
  await installPreparedComposition(
    cwd,
    preparedFromChanges(artifacts, units, fileChanges)
  );
  await applyPackageEntries(
    cwd,
    packageChanges
      .filter((change) => change.status !== "identical")
      .map(
        ({ status: _status, actual: _actual, ...requirement }) => requirement
      )
  );

  const docs = [...new Set(artifacts.map((item) => item.docs).filter(Boolean))];
  if (docs.length > 0) {
    printNextSteps(docs.join("\n\n"), "Setup");
  }
  success(`Added ${primary.name}.`);
}
