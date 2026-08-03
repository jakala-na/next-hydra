import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { CommerceIdentity } from "./commerce-identity";

describe("CommerceIdentity", () => {
  it.effect(
    "provides the authenticated user resolved at the request boundary",
    () =>
      Effect.gen(function* () {
        const identity = yield* CommerceIdentity;

        expect(identity.authUserId).toBe("auth-user-1");
      }).pipe(Effect.provide(CommerceIdentity.layer("auth-user-1")))
  );

  it.effect("reports an invalid authenticated user as a request failure", () =>
    Effect.flip(
      Effect.void.pipe(Effect.provide(CommerceIdentity.layer("")))
    ).pipe(
      Effect.tap((error) => {
        expect(error).toMatchObject({
          _tag: "CommerceRequestFailure",
          operation: "decodeAuthUserId",
        });
        return Effect.void;
      })
    )
  );
});
