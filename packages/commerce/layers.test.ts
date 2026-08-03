import { describe, expect, it, vi } from "vitest";
import { CommerceLayersNotConfigured, commerceIdentityLayer } from "./layers";

vi.mock("server-only", () => ({}));

describe("commerce Layer binding", () => {
  it("fails explicitly when the host does not configure Commerce Identity", async () => {
    await expect(commerceIdentityLayer()).rejects.toEqual(
      expect.objectContaining({
        name: "CommerceLayersNotConfigured",
        binding: "commerceIdentityLayer",
      })
    );
    await expect(commerceIdentityLayer()).rejects.toBeInstanceOf(
      CommerceLayersNotConfigured
    );
  });
});
