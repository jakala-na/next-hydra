import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { CommerceRuntimeNotConfigured, NextCommerce } from "./runtime";

describe("Commerce runtime binding", () => {
  it("fails explicitly when the host does not configure Commerce", async () => {
    await expect(
      NextCommerce.runPromise(Effect.void.pipe(NextCommerce.provide("en-US")))
    ).rejects.toBeInstanceOf(CommerceRuntimeNotConfigured);
  });
});
