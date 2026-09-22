import {
  addCatalogReferences,
  loadSourceRegistryCatalog,
} from "./composition/catalog.js";
import type { WorkspaceSelection } from "./composition/types.js";
import { findMaintainerWorkspaceRoot } from "./maintainer-workspace.js";
import { constructWorkspace } from "./workspace-construction.js";

export type ComposeOptions = {
  cms: string;
  auth?: string;
  commerce?: string;
  search?: boolean;
  copyEnv?: boolean;
  install?: boolean;
  offline?: boolean;
  addOns?: string[];
  port?: number;
};

export type CompositionOutput = {
  name?: string;
  report?: (message: string) => void;
  sourceRoot?: string;
};

/** Local selection and authoring policy; workspace construction is shared with customers. */
export async function composeWorkspace(
  targetDirectory: string,
  options: ComposeOptions,
  output: CompositionOutput = {}
) {
  const sourceRoot =
    output.sourceRoot ?? (await findMaintainerWorkspaceRoot(process.cwd()));
  const providers: WorkspaceSelection["providers"] = {
    cms: options.cms,
  };
  if (options.auth) {
    providers.auth = options.auth;
  }
  if (options.commerce) {
    providers.commerce = options.commerce;
  }
  const addOns = [
    ...new Set([
      ...(options.addOns ?? []),
      ...(options.search ? ["app-web-navigation-search"] : []),
    ]),
  ];
  const catalog = await addCatalogReferences(
    await loadSourceRegistryCatalog(sourceRoot),
    [...Object.values(providers), ...addOns],
    sourceRoot
  );
  return await constructWorkspace(targetDirectory, {
    ...options,
    ...output,
    catalog,
    selection: { addOns, providers },
  });
}
