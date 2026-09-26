import { describe, expect, it } from "vitest";

import { missingRuntimeScopes } from "../../config/runtime-scopes";
import { ProjectKey } from "./model";
import { RUNTIME_SCOPE_NAMES, runtimeScopeFor } from "./scopes";

describe("Commercetools provisioning scopes", () => {
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

  it.each(RUNTIME_SCOPE_NAMES)(
    "reports a missing %s runtime scope",
    (missingScopeName) => {
      const projectKey = ProjectKey.make("starter-project");
      const scope = runtimeScopeFor(projectKey)
        .split(" ")
        .filter((entry) => entry !== `${missingScopeName}:${projectKey}`)
        .join(" ");

      expect(missingRuntimeScopes(projectKey, scope)).toStrictEqual([
        `${missingScopeName}:${projectKey}`,
      ]);
    }
  );

  it("accepts the project-wide management scope", () => {
    expect(
      missingRuntimeScopes(
        ProjectKey.make("starter-project"),
        "manage_project:starter-project"
      )
    ).toStrictEqual([]);
  });
});
