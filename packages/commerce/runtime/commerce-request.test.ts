import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { decodeCommerceAuthUserId } from "./commerce-request";

describe("Commerce request input", () => {
  it("decodes a verified external user id", async () => {
    const authUserId = await Effect.runPromise(
      decodeCommerceAuthUserId("auth-user-1")
    );

    expect(authUserId).toBe("auth-user-1");
  });

  it("keeps an anonymous request anonymous", async () => {
    const authUserId = await Effect.runPromise(
      decodeCommerceAuthUserId(undefined)
    );

    expect(authUserId).toBeUndefined();
  });

  it("reports an invalid external user id as a request failure", async () => {
    const exit = await Effect.runPromise(
      decodeCommerceAuthUserId("").pipe(Effect.exit)
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(exit.cause.toString()).toContain("CommerceRequestFailure");
    }
  });
});
