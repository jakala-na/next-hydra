import { describe, expect, it } from "vitest";

import {
  clerkSessionToAuthSession,
  domainPermissionToClerkPermission,
} from "./session";

describe(domainPermissionToClerkPermission, () => {
  it("translates domain permissions to Clerk organization permissions", () => {
    expect(domainPermissionToClerkPermission("registration.read")).toBe(
      "org:registration:read"
    );
  });

  it("rejects permissions outside the domain format", () => {
    expect(domainPermissionToClerkPermission("system:read")).toBeNull();
  });
});

describe(clerkSessionToAuthSession, () => {
  it("maps a Clerk session and user to the auth domain", () => {
    const permissions = {
      has: (permission: string) => permission === "registration.read",
    };
    const session = clerkSessionToAuthSession({
      accessToken: "access-token",
      permissions,
      sessionId: "session-1",
      user: {
        email: "ada@example.com",
        firstName: "Ada",
        id: "user-1",
        imageUrl: "https://example.com/ada.jpg",
        lastName: "Lovelace",
      },
      userId: "user-1",
    });

    expect(session).toMatchObject({
      accessToken: "access-token",
      permissions,
      sessionId: "session-1",
      user: {
        email: "ada@example.com",
        firstName: "Ada",
        id: "user-1",
        lastName: "Lovelace",
        profilePictureUrl: "https://example.com/ada.jpg",
      },
    });
  });

  it("keeps the authenticated identity if the user profile is unavailable", () => {
    expect(
      clerkSessionToAuthSession({
        accessToken: "access-token",
        permissions: { has: () => false },
        sessionId: "session-1",
        user: null,
        userId: "user-1",
      }).user
    ).toMatchObject({
      email: null,
      firstName: null,
      id: "user-1",
      lastName: null,
      profilePictureUrl: null,
    });
  });
});
