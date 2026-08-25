import { describe, expect, it } from "vitest";

import { graphql } from "./graphql";

describe("Commercetools GraphQL scalar mappings", () => {
  it("maps KeyReferenceInput to its string wire type", () => {
    expect(graphql.scalar("KeyReferenceInput", "default-store")).toBe(
      "default-store"
    );

    // @ts-expect-error KeyReferenceInput is serialized as a string.
    graphql.scalar("KeyReferenceInput", { key: "default-store" });
  });
});
