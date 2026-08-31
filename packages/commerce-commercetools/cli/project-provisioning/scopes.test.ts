import { describe, expect, it } from "vitest";

import { ProjectKey } from "./model";
import { RUNTIME_SCOPE_NAMES, runtimeScopeFor } from "./scopes";

describe("Commercetools provisioning scopes", () => {
  it("qualifies every versioned application scope with the project key", () => {
    const scope = runtimeScopeFor(ProjectKey.make("starter-project"));
    const qualifiedScopes = scope.split(" ");

    expect(qualifiedScopes).toHaveLength(RUNTIME_SCOPE_NAMES.length);
    expect(new Set(qualifiedScopes).size).toBe(RUNTIME_SCOPE_NAMES.length);
    expect(qualifiedScopes).toContain("manage_types:starter-project");
    expect(qualifiedScopes).toContain(
      "manage_key_value_documents:starter-project"
    );
    expect(
      qualifiedScopes.every((entry) => entry.endsWith(":starter-project"))
    ).toBeTruthy();
  });
});
