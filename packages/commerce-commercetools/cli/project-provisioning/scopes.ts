import type { ProjectKey } from "./model";

export {
  RUNTIME_SCOPE_NAMES,
  runtimeScopeFor,
} from "../../config/runtime-scopes";

const scopeFor = (name: string, projectKey: ProjectKey) =>
  `${name}:${projectKey}`;

export const missingBootstrapScopes = (
  projectKey: ProjectKey,
  scopes: readonly string[]
): readonly string[] => {
  const manageApiClients = scopeFor("manage_api_clients", projectKey);
  const canManageProjectSettings = [
    scopeFor("manage_project_settings", projectKey),
    scopeFor("manage_project", projectKey),
  ].some((scope) => scopes.includes(scope));

  return [
    ...(scopes.includes(manageApiClients) ? [] : [manageApiClients]),
    ...(canManageProjectSettings
      ? []
      : [scopeFor("manage_project_settings", projectKey)]),
  ];
};
