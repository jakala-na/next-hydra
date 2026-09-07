import { describe, expect, it } from "vitest";

import { ALGOLIA_COMMERCETOOLS_CONNECTOR_SCOPE_NAMES } from "./scopes";

describe("Algolia commercetools connector scopes", () => {
  it("can read connector inputs and manage subscriptions without managing the project", () => {
    expect(ALGOLIA_COMMERCETOOLS_CONNECTOR_SCOPE_NAMES).toContain(
      "view_api_clients"
    );
    expect(ALGOLIA_COMMERCETOOLS_CONNECTOR_SCOPE_NAMES).toContain(
      "view_products"
    );
    expect(ALGOLIA_COMMERCETOOLS_CONNECTOR_SCOPE_NAMES).toContain(
      "manage_subscriptions"
    );
    expect(ALGOLIA_COMMERCETOOLS_CONNECTOR_SCOPE_NAMES).not.toContain(
      "manage_api_clients"
    );
    expect(ALGOLIA_COMMERCETOOLS_CONNECTOR_SCOPE_NAMES).not.toContain(
      "manage_project"
    );
  });
});
