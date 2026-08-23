import { describe, expect, it } from "vitest";

import { authCapabilities } from "./capabilities";
import { workosSessionToAuthSession } from "./session";

describe(workosSessionToAuthSession, () => {
  it("advertises registration onboarding as supported", () => {
    expect(authCapabilities.registrationOnboarding).toBeTruthy();
  });

  it("maps an authenticated WorkOS session to the auth domain", () => {
    const session = workosSessionToAuthSession({
      accessToken: "access-token",
      permissions: ["registration.read"],
      sessionId: "session-1",
      user: {
        createdAt: "2026-08-23T00:00:00.000Z",
        email: "ada@example.com",
        emailVerified: true,
        externalId: null,
        firstName: "Ada",
        id: "user-1",
        lastName: "Lovelace",
        lastSignInAt: "2026-08-23T00:00:00.000Z",
        locale: null,
        metadata: {},
        object: "user",
        profilePictureUrl: null,
        updatedAt: "2026-08-23T00:00:00.000Z",
      },
    });

    expect(session).toMatchObject({
      accessToken: "access-token",
      sessionId: "session-1",
      user: {
        email: "ada@example.com",
        firstName: "Ada",
        id: "user-1",
        lastName: "Lovelace",
        profilePictureUrl: null,
      },
    });
    expect(session.permissions.has("registration.read")).toBeTruthy();
    expect(session.permissions.has("registration.decide")).toBeFalsy();
  });

  it("maps an anonymous WorkOS request to an empty auth session", () => {
    const session = workosSessionToAuthSession({ user: null });

    expect(session).toMatchObject({ user: null });
    expect(session.accessToken).toBeUndefined();
    expect(session.sessionId).toBeUndefined();
    expect(session.permissions.has("registration.read")).toBeFalsy();
  });
});
