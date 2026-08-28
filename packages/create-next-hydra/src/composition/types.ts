import type { getRegistriesConfig } from "shadcn/registry";
import type { RegistryItem } from "shadcn/schema";

export type RegistriesConfig = Awaited<ReturnType<typeof getRegistriesConfig>>;

export const PROVIDER_SLOTS = ["auth", "cms", "commerce"] as const;

export type ProviderSlot = (typeof PROVIDER_SLOTS)[number];
export const PROVIDER_ALIASES = {
  auth: "@repo/auth",
  cms: "@repo/cms",
  commerce: "@repo/commerce-provider",
} as const satisfies Record<ProviderSlot, string>;
export type SelectionKind = "provider" | "add-on" | "preset";
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

export type AssetContribution = {
  source: string;
  target: string;
};

export type PnpmPatch = {
  dependency: string;
  path: string;
};

export type WorkspaceSelection = {
  providers: Record<ProviderSlot, string>;
  addOns: string[];
};

export type SelectionDefinition = {
  id: string;
  kind: SelectionKind;
  slot?: ProviderSlot;
  binding?: ProviderBinding;
  compatibility: {
    requires: string[];
    conflicts: string[];
  };
  packages: PackageRequirement[];
  providerDependencies: ProviderDependency[];
  pnpmPatches: PnpmPatch[];
  assets: AssetContribution[];
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
  items: Map<string, RegistryItem>;
  itemByReference: Map<string, string>;
  registryConfig: RegistriesConfig;
  selections: CatalogSelection[];
  byId: Map<string, CatalogSelection>;
  byReference: Map<string, CatalogSelection>;
  managedTargets: string[];
};

export type PreparedComposition = {
  artifacts: RegistryItem[];
  itemByReference: Map<string, string>;
  entryItems: string[];
  registryConfig: RegistriesConfig;
  assets: (AssetContribution & { content: Uint8Array })[];
  managedFiles: { content: string; target: string }[];
};

export type TypeScriptPathAlias = {
  alias: string;
  cwd: string;
  sourcePath: string;
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
  assets: AssetContribution[];
  managedTargets: string[];
  catalogManagedTargets: string[];
  catalogTypeScriptPathAliases: TypeScriptPathAliasTarget[];
  typeScriptPathAliases: TypeScriptPathAlias[];
  variableTargets: string[];
  instructions: string[];
};
