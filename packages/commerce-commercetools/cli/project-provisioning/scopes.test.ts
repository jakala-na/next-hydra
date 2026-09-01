import { describe, expect, it } from "vitest";

import { ProjectKey } from "./model";
import {
  bootstrapScopesFor,
  RUNTIME_SCOPE_NAMES,
  runtimeScopeFor,
} from "./scopes";

describe("Commercetools provisioning scopes", () => {
  it("keeps bootstrap access limited to project settings and API Clients", () => {
    const projectKey = ProjectKey.make("starter-project");

    expect(bootstrapScopesFor(projectKey)).toStrictEqual([
      "manage_project_settings:starter-project",
      "manage_api_clients:starter-project",
    ]);
  });

  it("qualifies every versioned application scope with the project key", () => {
    const scope = runtimeScopeFor(ProjectKey.make("starter-project"));
    const qualifiedScopes = scope.split(" ");

    expect(qualifiedScopes).toHaveLength(RUNTIME_SCOPE_NAMES.length);
    expect(new Set(qualifiedScopes).size).toBe(RUNTIME_SCOPE_NAMES.length);
    expect(qualifiedScopes).toEqual(
      expect.arrayContaining([
        "manage_key_value_documents:starter-project",
        "manage_payments:starter-project",
        "manage_types:starter-project",
      ])
    );
    expect(
      qualifiedScopes.every((entry) => entry.endsWith(":starter-project"))
    ).toBeTruthy();
  });
});
