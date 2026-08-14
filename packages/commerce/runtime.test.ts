import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { CommerceRuntimeNotConfigured, NextCommerce } from "./runtime";

vi.mock("server-only", () => ({}));

describe("Commerce runtime binding", () => {
  it("fails explicitly when the host does not configure Commerce", async () => {
    await expect(
      NextCommerce.runPromise(Effect.void.pipe(NextCommerce.provide("en-US")))
    ).rejects.toBeInstanceOf(CommerceRuntimeNotConfigured);
  });
});
