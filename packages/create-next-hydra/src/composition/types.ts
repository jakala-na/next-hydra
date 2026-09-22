import type { getRegistriesConfig } from "shadcn/registry";
import type { RegistryItem } from "shadcn/schema";

import type { RegistryPackageDependency } from "./registry-dependencies.js";
import type { PlannedSlotTemplate } from "./slot-templates.js";

export type RegistriesConfig = Awaited<ReturnType<typeof getRegistriesConfig>>;

export const PROVIDER_SLOTS = ["auth", "cms", "commerce"] as const;

export type ProviderSlot = (typeof PROVIDER_SLOTS)[number];
export const PROVIDER_ALIASES = {
  auth: "@repo/auth",
  cms: "@repo/cms",
  commerce: "@repo/commerce-provider",
} as const satisfies Record<ProviderSlot, string>;
export type SelectionKind =
  | "provider"
  | "add-on"
  | "preset"
  | "package"
  | "recipe";
export type ProviderSlotRequirement = "optional" | "required" | "forbidden";
export type DependencySection =
  | "dependencies"
  | "devDependencies"
  | "optionalDependencies";
export type PackageRequirement = {
  cwd: string;
  section: DependencySection;
  name: string;
  specifier: string;
};

export type PackageRequirementTarget = Omit<PackageRequirement, "specifier">;

export type ProviderBinding = {
  specifier: string;
  sourcePath?: string;
};

export type ProviderDependency = {
  cwd: string;
  section: DependencySection;
  slot: ProviderSlot;
};

export type RegistryAsset = {
  source: string;
  target: string;
};
export type PlannedAsset = RegistryAsset & { owner: string };

export type PnpmPatch = {
  dependency: string;
  path: string;
};

export type TypeScriptPathAlias = {
  alias: string;
  cwd: string;
  sourcePath: string;
};

export type PlannedCompositionTemplate = PlannedSlotTemplate;

export type WorkspaceSelection = {
  providers: Partial<Record<ProviderSlot, string>>;
  addOns: string[];
};

export type SelectionDefinition = {
  id: string;
  kind: SelectionKind;
  slot?: ProviderSlot;
  providerSlots?: Partial<Record<ProviderSlot, ProviderSlotRequirement>>;
  binding?: ProviderBinding;
  compatibility: {
    requires: string[];
    conflicts: string[];
  };
  packages: PackageRequirement[];
  providerDependencies: ProviderDependency[];
  pnpmPatches: PnpmPatch[];
  assets: RegistryAsset[];
  conditionalDependencies: {
    providers: ProviderSlot[];
    items: string[];
  }[];
  typeScriptAliases: TypeScriptPathAlias[];
  selections?: {
    providers?: Partial<Record<ProviderSlot, string>>;
    addOns: string[];
  };
};

export type CatalogSelection = SelectionDefinition & {
  itemName: string;
};

export type SourceRegistryCatalog = {
  cwd: string;
  registryFile: string;
  repository?: string;
  authoringPaths: string[];
  externalItemNames: Set<string>;
  items: Map<string, RegistryItem>;
  itemByReference: Map<string, string>;
  registryConfig: RegistriesConfig;
  selections: CatalogSelection[];
  byId: Map<string, CatalogSelection>;
  byReference: Map<string, CatalogSelection>;
};

export type PreparedComposition = {
  registryDependencies: RegistryPackageDependency[];
  artifacts: RegistryItem[];
  itemByReference: Map<string, string>;
  entryItems: string[];
  registryConfig: RegistriesConfig;
  assets: (PlannedAsset & { content: Uint8Array })[];
  renderedFiles: {
    content: string;
    target: string;
    owner: string;
    source: string;
  }[];
};

export type TypeScriptPathAliasTarget = Pick<
  TypeScriptPathAlias,
  "alias" | "cwd"
>;

export type CompositionPlan = {
  selection: WorkspaceSelection;
  selections: CatalogSelection[];
  entryItems: string[];
  registryItems: string[];
  packageRequirements: PackageRequirement[];
  catalogPackageRequirementTargets: PackageRequirementTarget[];
  pnpmPatches: PnpmPatch[];
  catalogPnpmPatches: PnpmPatch[];
  assets: PlannedAsset[];
  templates: PlannedCompositionTemplate[];
  managedTargets: string[];
  catalogTypeScriptPathAliases: TypeScriptPathAliasTarget[];
  typeScriptPathAliases: TypeScriptPathAlias[];
  instructions: string[];
};
