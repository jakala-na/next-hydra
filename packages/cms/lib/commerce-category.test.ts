import { Option } from "effect";
import { describe, expect, it } from "vitest";
import { decodeCommerceCategoryId } from "./commerce-category";

describe("decodeCommerceCategoryId", () => {
  it("preserves an absent Category selection", () => {
    const result = decodeCommerceCategoryId(undefined);

    expect(Option.isSome(result)).toBe(true);
    expect(Option.getOrUndefined(result)).toBeUndefined();
  });

  it("decodes a selected domain Category ID", () => {
    const result = decodeCommerceCategoryId({
      data: [{ id: "category-1", providerField: "ignored" }],
    });

    expect(Option.getOrUndefined(result)).toBe("category-1");
  });

  it("rejects malformed CMS Category data", () => {
    expect(
      Option.isNone(decodeCommerceCategoryId({ data: [{ id: "" }] }))
    ).toBe(true);
    expect(
      Option.isNone(decodeCommerceCategoryId({ data: "category-1" }))
    ).toBe(true);
  });
});
