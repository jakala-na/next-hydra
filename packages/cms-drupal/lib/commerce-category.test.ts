import { Option } from "effect";
import { describe, expect, it } from "vitest";
import { decodeCommerceCategoryId } from "./commerce-category";

describe("decodeCommerceCategoryId", () => {
  it.each([undefined, null, "", "   "])(
    "preserves an absent category selection (%s)",
    (value) => {
      const result = decodeCommerceCategoryId(value);

      expect(Option.isSome(result)).toBe(true);
      expect(Option.getOrUndefined(result)).toBeUndefined();
    }
  );

  it("decodes a selected domain category ID", () => {
    const result = decodeCommerceCategoryId("category-1");

    expect(Option.getOrUndefined(result)).toBe("category-1");
  });

  it("rejects malformed category data", () => {
    expect(Option.isNone(decodeCommerceCategoryId({ id: "category-1" }))).toBe(
      true
    );
  });
});
