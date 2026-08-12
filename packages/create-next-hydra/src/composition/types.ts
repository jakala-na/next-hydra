import type { RegistryItem } from "shadcn/schema";

export const PROVIDER_SLOTS = ["auth", "cms", "commerce"] as const;

export type ProviderSlot = (typeof PROVIDER_SLOTS)[number];
export type SelectionKind = "provider" | "add-on" | "preset";
export type DependencySection =
  | "dependencies"
  | "devDependencies"
  | "optionalDependencies";
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type InstallUnitReference = {
  item: string;
  cwd: string;
};

export type PackageRequirement = {
  cwd: string;
  section: DependencySection;
  name: string;
  specifier: string;
};

export type RouteClaim = {
  app: string;
  path: string;
  method: HttpMethod;
  module: string;
  export: string;
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
  installUnits: InstallUnitReference[];
  compatibility: {
    requires: string[];
    conflicts: string[];
  };
  packages: PackageRequirement[];
  pnpmPatches: PnpmPatch[];
  assets: AssetContribution[];
  routes: RouteClaim[];
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
  authoringPaths: string[];
  items: Map<string, RegistryItem>;
  selections: CatalogSelection[];
  byId: Map<string, CatalogSelection>;
  byReference: Map<string, CatalogSelection>;
};

export type PreparedInstallUnit = PlannedInstallUnit & {
  artifact: RegistryItem;
};

export type PreparedComposition = {
  units: PreparedInstallUnit[];
  assets: Array<AssetContribution & { content: Uint8Array }>;
};

export type PlannedInstallUnit = InstallUnitReference & {
  selectionId: string;
  targets: string[];
};

export type PlannedRoute = RouteClaim & {
  target: string;
};

export type CompositionPlan = {
  selection: WorkspaceSelection;
  selections: CatalogSelection[];
  installUnits: PlannedInstallUnit[];
  packageRequirements: PackageRequirement[];
  catalogPackageRequirements: PackageRequirement[];
  pnpmPatches: PnpmPatch[];
  catalogPnpmPatches: PnpmPatch[];
  assets: AssetContribution[];
  routes: PlannedRoute[];
  variableTargets: string[];
  generatedRouteTargets: string[];
  instructions: string[];
};
