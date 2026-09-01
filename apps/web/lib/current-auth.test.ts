import { AuthSessionReadFailure } from "@repo/auth/session";
import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import {
  CurrentAuth,
  currentAuthLayerFromSessionRead,
} from "./current-auth-api";

describe(CurrentAuth, () => {
  it("preserves auth session read failures for application boundaries", async () => {
    const failure = new AuthSessionReadFailure({
      cause: new Error("provider unavailable"),
      message: "Failed to read the authentication session",
      provider: "test",
    });
    const currentAuthLayer = currentAuthLayerFromSessionRead(
      Effect.fail(failure)
    );
    const exit = await Effect.runPromise(
      CurrentAuth.pipe(
        Effect.flatMap((auth) => auth.snapshot),
        Effect.provide(currentAuthLayer),
        Effect.exit
      )
    );
    const reasons = Exit.isFailure(exit) ? exit.cause.reasons : [];

    expect(reasons.find(Cause.isFailReason)?.error).toBe(failure);
    expect(reasons.some(Cause.isDieReason)).toBeFalsy();
  });
});
