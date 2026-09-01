import type { Page } from "@repo/e2e-testing";
/* oxlint-disable typescript/promise-function-async -- Test doubles return already-settled promises to implement the asynchronous provider port. */
import { NotFoundException } from "@workos-inc/node";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { makeWorkosAuthTestControl } from "./auth";
import type { WorkosTestUserManagement } from "./auth";

const workosNotFound = () =>
  new NotFoundException({
    path: "/user_management/resources/missing",
    requestID: "request-missing",
  });

const accessToken = (permissions: readonly string[]) =>
  `header.${Buffer.from(JSON.stringify({ permissions })).toString("base64url")}.signature`;

const invitedUserManagementDefaults = {
  listUsers: () => Promise.resolve({ data: [] }),
} satisfies Pick<WorkosTestUserManagement, "listUsers">;

describe("makeWorkosAuthTestControl", () => {
  it("constructs deterministic WorkOS-safe email addresses", () => {
    const control = makeWorkosAuthTestControl({
      clientId: "client_test",
      cookieName: "wos-session",
      cookiePassword: "a-secure-cookie-password-for-testing",
      userManagement: {
        ...invitedUserManagementDefaults,
        authenticateWithPassword: () =>
          Promise.resolve({ sealedSession: "sealed-session" }),
        createUser: () => Promise.resolve({ id: "unused" }),
        deleteUser: () => Promise.resolve(),
        listInvitations: () => Promise.resolve({ data: [] }),
        revokeInvitation: (invitationId) =>
          Promise.resolve({ id: invitationId }),
      },
    });

    const email = control.emailAddressFor("Grace Hopper/run 1");

    expect(email).toMatch(/^delivered\+[a-z0-9-]+@resend\.dev$/u);
    expect(email).not.toContain("clerk_test");
    expect(control.emailAddressFor("Grace Hopper/run 1")).toBe(email);
    expect(control.emailAddressFor("Grace Hopper/run 2")).not.toBe(email);
  });

  it("provisions and removes an authorized organization membership", async () => {
    const memberships: object[] = [];
    const deletedResources: string[] = [];
    let authenticationAttempts = 0;
    const control = makeWorkosAuthTestControl({
      authorization: {
        createAuthorizedMembership: (input) => {
          memberships.push(input);
          return Promise.resolve();
        },
        createOrganization: () => Promise.resolve({ id: "organization-e2e" }),
        deleteOrganization: (organizationId) => {
          deletedResources.push(`organization:${organizationId}`);
          return Promise.resolve();
        },
      },
      clientId: "client_test",
      cookieName: "wos-session",
      cookiePassword: "a-secure-cookie-password-for-testing",
      userManagement: {
        ...invitedUserManagementDefaults,
        authenticateWithPassword: () => {
          authenticationAttempts += 1;
          return Promise.resolve({
            accessToken: accessToken(
              authenticationAttempts === 1
                ? []
                : ["registration.read", "registration.decide"]
            ),
            sealedSession: "sealed-session",
          });
        },
        createUser: () => Promise.resolve({ id: "user-grace" }),
        deleteUser: (userId) => {
          deletedResources.push(`user:${userId}`);
          return Promise.resolve();
        },
        listInvitations: () => Promise.resolve({ data: [] }),
        revokeInvitation: (invitationId) =>
          Promise.resolve({ id: invitationId }),
      },
      waitForAuthorization: () => Promise.resolve(),
    });

    const identity = await Effect.runPromise(
      control.createVerifiedIdentity({
        email: "grace@example.test",
        firstName: "Grace",
        lastName: "Hopper",
        permissions: ["registration.read", "registration.decide"],
      })
    );
    const pageStub = {
      context: () => ({
        addCookies: (_cookies: object[]) => Promise.resolve(),
      }),
    };
    // SAFETY: this provider test exercises only Page.context().addCookies, which the stub implements.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const page = pageStub as Page;
    await Effect.runPromise(
      control.signIn({
        applicationUrl: "http://localhost:3005",
        identity,
        page,
      })
    );
    await Effect.runPromise(control.deleteIdentity(identity));

    expect(memberships).toStrictEqual([
      {
        organizationId: "organization-e2e",
        permissions: ["registration.read", "registration.decide"],
        userId: "user-grace",
      },
    ]);
    expect(deletedResources).toStrictEqual([
      "organization:organization-e2e",
      "user:user-grace",
    ]);
    expect(authenticationAttempts).toBe(2);
  });

  it("creates a verified user and seals a password session for that user", async () => {
    const createdUsers: Parameters<
      WorkosTestUserManagement["createUser"]
    >[0][] = [];
    const authentications: Parameters<
      WorkosTestUserManagement["authenticateWithPassword"]
    >[0][] = [];
    const userManagement: WorkosTestUserManagement = {
      ...invitedUserManagementDefaults,
      authenticateWithPassword: (input) => {
        authentications.push(input);
        return Promise.resolve({ sealedSession: "sealed-session" });
      },
      createUser: (input) => {
        createdUsers.push(input);
        return Promise.resolve({
          email: "ada@example.test",
          firstName: "Ada",
          id: "user-ada",
          lastName: "Lovelace",
        });
      },
      deleteUser: () => Promise.resolve(),
      listInvitations: () => Promise.resolve({ data: [] }),
      revokeInvitation: (invitationId) => Promise.resolve({ id: invitationId }),
    };
    const control = makeWorkosAuthTestControl({
      clientId: "client_test",
      cookieName: "wos-session",
      cookiePassword: "a-secure-cookie-password-for-testing",
      makePassword: () => "a-unique-password",
      userManagement,
    });

    const cookies: object[] = [];
    const pageStub = {
      context: () => ({
        addCookies: (nextCookies: object[]) => {
          cookies.push(...nextCookies);
          return Promise.resolve();
        },
      }),
    };
    // SAFETY: this provider test exercises only Page.context().addCookies, which the stub implements.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const page = pageStub as Page;
    const identity = await Effect.runPromise(
      control.createVerifiedIdentity({
        email: "ada@example.test",
        firstName: "Ada",
        lastName: "Lovelace",
      })
    );
    await Effect.runPromise(
      control.signIn({
        applicationUrl: "http://localhost:3001",
        identity,
        page,
      })
    );

    expect(createdUsers).toStrictEqual([
      {
        email: "ada@example.test",
        emailVerified: true,
        firstName: "Ada",
        lastName: "Lovelace",
        password: "a-unique-password",
      },
    ]);
    expect(authentications).toStrictEqual([
      {
        clientId: "client_test",
        email: "ada@example.test",
        password: "a-unique-password",
        session: {
          cookiePassword: "a-secure-cookie-password-for-testing",
          sealSession: true,
        },
      },
    ]);
    expect(cookies).toStrictEqual([
      {
        httpOnly: true,
        name: "wos-session",
        sameSite: "Lax",
        secure: false,
        url: "http://localhost:3001",
        value: "sealed-session",
      },
    ]);
  });

  it("accepts the exact pending invitation through the hosted WorkOS flow", async () => {
    const authentications: Parameters<
      WorkosTestUserManagement["authenticateWithPassword"]
    >[0][] = [];
    const acceptedInvitations: object[] = [];
    const control = makeWorkosAuthTestControl({
      acceptInvitation: (input) => {
        acceptedInvitations.push(input);
        return Promise.resolve();
      },
      clientId: "client_test",
      cookieName: "wos-session",
      cookiePassword: "a-secure-cookie-password-for-testing",
      makePassword: () => "a-unique-password",
      userManagement: {
        ...invitedUserManagementDefaults,
        authenticateWithPassword: (input) => {
          authentications.push(input);
          return Promise.resolve({ sealedSession: "sealed-session" });
        },
        createUser: () => Promise.resolve({ id: "unused" }),
        deleteUser: () => Promise.resolve(),
        listInvitations: () =>
          Promise.resolve({
            data: [
              {
                email: "other@example.test",
                id: "invitation-other",
                state: "pending" as const,
                token: "other-token",
              },
              {
                email: "GRACE@EXAMPLE.TEST",
                id: "invitation-grace",
                state: "pending" as const,
                token: "grace-token",
              },
            ],
          }),
        listUsers: () =>
          Promise.resolve({
            data: [
              {
                email: "GRACE@EXAMPLE.TEST",
                emailVerified: false,
                id: "user-grace",
              },
            ],
          }),
        revokeInvitation: (invitationId) =>
          Promise.resolve({ id: invitationId }),
      },
    });
    const pageStub = {};
    // SAFETY: the injected hosted-flow double treats the page as an opaque value.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const page = pageStub as Page;
    const identity = await Effect.runPromise(
      control.acceptPendingInvitation({
        applicationUrl: "http://localhost:3001",
        email: "grace@example.test",
        firstName: "Grace",
        lastName: "Hopper",
        page,
      })
    );

    expect(authentications).toStrictEqual([]);
    expect(acceptedInvitations).toStrictEqual([
      {
        applicationUrl: "http://localhost:3001",
        email: "grace@example.test",
        firstName: "Grace",
        invitationToken: "grace-token",
        lastName: "Hopper",
        page,
        password: "a-unique-password",
      },
    ]);
    expect(identity).toStrictEqual({
      authUserId: "user-grace",
      email: "grace@example.test",
      firstName: "Grace",
      lastName: "Hopper",
    });
  });

  it("defers cleanup when invitation delivery has an unknown outcome", async () => {
    const deletedUserIds: string[] = [];
    let invitationLookup = 0;
    const control = makeWorkosAuthTestControl({
      acceptInvitation: () => Promise.resolve(),
      clientId: "client_test",
      cookieName: "wos-session",
      cookiePassword: "a-secure-cookie-password-for-testing",
      deliverAcceptedInvitation: () =>
        Promise.reject(new Error("webhook response was lost")),
      makePassword: () => "a-unique-password",
      userManagement: {
        ...invitedUserManagementDefaults,
        authenticateWithPassword: () =>
          Promise.resolve({ sealedSession: "sealed-session" }),
        createUser: () => Promise.resolve({ id: "unused" }),
        deleteUser: (userId) => {
          deletedUserIds.push(userId);
          return Promise.resolve();
        },
        listInvitations: () => {
          invitationLookup += 1;
          return Promise.resolve({
            data: [
              {
                email: "grace@example.test",
                id: "invitation-grace",
                state:
                  invitationLookup === 1
                    ? ("pending" as const)
                    : ("accepted" as const),
                token: "grace-token",
              },
            ],
          });
        },
        listUsers: () =>
          Promise.resolve({
            data: [
              {
                email: "grace@example.test",
                emailVerified: invitationLookup !== 1,
                id: "provisional-user-grace",
              },
            ],
          }),
        revokeInvitation: (invitationId) =>
          Promise.resolve({ id: invitationId }),
      },
    });
    const pageStub = {};
    // SAFETY: the injected hosted-flow and delivery doubles treat the page as opaque.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const page = pageStub as Page;

    await expect(
      Effect.runPromise(
        control.acceptPendingInvitation({
          applicationUrl: "http://localhost:3001",
          email: "grace@example.test",
          firstName: "Grace",
          lastName: "Hopper",
          page,
        })
      )
    ).rejects.toThrow("webhook response was lost");
    expect(deletedUserIds).toStrictEqual([]);

    await Effect.runPromise(
      control.revokePendingInvitationsFor("grace@example.test")
    );

    expect(deletedUserIds).toStrictEqual(["provisional-user-grace"]);
  });

  it("revokes pending invitations for an E2E test email", async () => {
    const revokedInvitationIds: string[] = [];
    const deletedUserIds: string[] = [];
    const control = makeWorkosAuthTestControl({
      clientId: "client_test",
      cookieName: "wos-session",
      cookiePassword: "a-secure-cookie-password-for-testing",
      userManagement: {
        ...invitedUserManagementDefaults,
        authenticateWithPassword: () =>
          Promise.resolve({
            sealedSession: "sealed-session",
          }),
        createUser: () =>
          Promise.resolve({
            email: "unused@example.test",
            id: "unused",
          }),
        deleteUser: (userId) => {
          deletedUserIds.push(userId);
          return Promise.resolve();
        },
        listInvitations: () =>
          Promise.resolve({
            data: [
              {
                email: "grace@example.test",
                id: "invitation-pending",
                state: "pending" as const,
                token: "pending-token",
              },
              {
                email: "grace@example.test",
                id: "invitation-accepted",
                state: "accepted" as const,
                token: "accepted-token",
              },
            ],
          }),
        listUsers: () =>
          Promise.resolve({
            data: [
              {
                email: "grace@example.test",
                emailVerified: false,
                id: "user-provisional",
              },
              {
                email: "grace@example.test",
                emailVerified: true,
                id: "user-established",
              },
            ],
          }),
        revokeInvitation: (invitationId) => {
          revokedInvitationIds.push(invitationId);
          return Promise.resolve({ id: invitationId });
        },
      },
    });

    await Effect.runPromise(
      control.revokePendingInvitationsFor("grace@example.test")
    );

    expect(revokedInvitationIds).toStrictEqual(["invitation-pending"]);
    expect(deletedUserIds).toStrictEqual(["user-provisional"]);
  });

  it("treats already-absent WorkOS resources as cleaned", async () => {
    const control = makeWorkosAuthTestControl({
      clientId: "client_test",
      cookieName: "wos-session",
      cookiePassword: "a-secure-cookie-password-for-testing",
      userManagement: {
        ...invitedUserManagementDefaults,
        authenticateWithPassword: () =>
          Promise.resolve({ sealedSession: "sealed-session" }),
        createUser: () =>
          Promise.resolve({ email: "unused@example.test", id: "unused" }),
        deleteUser: () => Promise.reject(workosNotFound()),
        listInvitations: () =>
          Promise.resolve({
            data: [
              {
                email: "missing@example.test",
                id: "invitation-missing",
                state: "pending" as const,
                token: "missing-token",
              },
            ],
          }),
        revokeInvitation: () => Promise.reject(workosNotFound()),
      },
    });

    await expect(
      Effect.runPromise(
        control.revokePendingInvitationsFor("missing@example.test")
      )
    ).resolves.toBeUndefined();
    await expect(
      Effect.runPromise(
        control.deleteIdentity({
          authUserId: "user-missing",
          email: "missing@example.test",
          firstName: "Missing",
          lastName: "Person",
        })
      )
    ).resolves.toBeUndefined();
  });
});
