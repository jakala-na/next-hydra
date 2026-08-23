/* oxlint-disable require-await -- Reader test doubles implement an async provider boundary. */
import { Cause, Effect, Exit, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { AuthSession, makeAuthSessionAdapter } from "./session";

const readSessionExit = async (
  adapter: ReturnType<typeof makeAuthSessionAdapter>
) => await Effect.runPromise(adapter.read.pipe(Effect.exit));

describe(makeAuthSessionAdapter, () => {
  it("keeps provider I/O failures in the typed failure channel", async () => {
    const adapter = makeAuthSessionAdapter({
      decode: () =>
        new AuthSession({ permissions: { has: () => false }, user: null }),
      failureMessage: "Failed to read the test authentication session",
      provider: "test",
      read: async () => {
        throw new Error("provider unavailable");
      },
    });

    const exit = await readSessionExit(adapter);
    const failure = Exit.isFailure(exit)
      ? exit.cause.reasons.find(Cause.isFailReason)?.error
      : undefined;

    expect(failure).toMatchObject({
      _tag: "AuthSessionReadFailure",
      provider: "test",
    });
  });

  it("keeps domain Schema violations in the defect channel", async () => {
    const adapter = makeAuthSessionAdapter({
      decode: () =>
        Schema.decodeSync(AuthSession)({
          permissions: { has: () => false },
          sessionId: "",
          user: null,
        }),
      failureMessage: "Failed to read the test authentication session",
      provider: "test",
      read: async () => "provider-session",
    });

    const exit = await readSessionExit(adapter);
    const reasons = Exit.isFailure(exit) ? exit.cause.reasons : [];

    expect(reasons.some(Cause.isDieReason)).toBeTruthy();
    expect(reasons.some(Cause.isFailReason)).toBeFalsy();
  });
});
