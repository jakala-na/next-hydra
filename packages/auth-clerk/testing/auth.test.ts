import { ClerkAPIResponseError } from "@clerk/backend/errors";
/* oxlint-disable typescript/promise-function-async -- Test doubles return already-settled promises to implement asynchronous provider ports. */
import type { Page } from "@repo/e2e-testing";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { makeClerkAuthTestControl } from "./auth";
import type { ClerkAuthTestApi } from "./auth";

const testPage = (visited: string[]): Page => {
  const page = {
    goto: (url: string) => {
      visited.push(url);
      return Promise.resolve(null);
    },
  };

  // SAFETY: this provider test exercises only Page.goto, which the stub implements.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return page as Page;
};

const clerkNotFound = () =>
  new ClerkAPIResponseError("Not Found", { data: [], status: 404 });

const clerkRateLimited = () =>
  new ClerkAPIResponseError("Too Many Requests", {
    data: [],
    retryAfter: 0,
    status: 429,
  });

const transientTransportFailure = () => {
  const cause = new Error("No route to host");
  Object.assign(cause, { code: "EHOSTUNREACH" });
  return new TypeError("fetch failed", { cause });
};

describe("makeClerkAuthTestControl", () => {
  it("constructs deterministic Clerk-safe email addresses", () => {
    const control = makeClerkAuthTestControl({
      acceptInvitation: () =>
        Promise.resolve({ authUserId: "unused-invited-user" }),
      api: {
        createUser: () => Promise.resolve({ id: "unused" }),
        deleteUser: () => Promise.resolve(),
        getInvitationList: () => Promise.resolve({ data: [], totalCount: 0 }),
        getUserList: () => Promise.resolve({ data: [] }),
        revokeInvitation: () => Promise.resolve(),
      },
      signIn: () => Promise.resolve(),
    });

    const email = control.emailAddressFor("Grace Hopper/run 1");

    expect(email).toMatch(/^delivered\+clerk_test_[a-z0-9-]+@resend\.dev$/u);
    expect(control.emailAddressFor("Grace Hopper/run 1")).toBe(email);
    expect(control.emailAddressFor("Grace Hopper/run 2")).not.toBe(email);
  });

  it("provisions an authorized organization and activates it at sign-in", async () => {
    const memberships: object[] = [];
    const deletedResources: string[] = [];
    const signedIn: object[] = [];
    const page = testPage([]);
    const control = makeClerkAuthTestControl({
      acceptInvitation: () =>
        Promise.resolve({ authUserId: "unused-invited-user" }),
      api: {
        createUser: () => Promise.resolve({ id: "user_grace" }),
        deleteUser: (userId) => {
          deletedResources.push(`user:${userId}`);
          return Promise.resolve();
        },
        getInvitationList: () => Promise.resolve({ data: [], totalCount: 0 }),
        getUserList: () => Promise.resolve({ data: [] }),
        revokeInvitation: () => Promise.resolve(),
      },
      authorization: {
        createAuthorizedMembership: (input) => {
          memberships.push(input);
          return Promise.resolve();
        },
        createOrganization: () => Promise.resolve({ id: "org_e2e" }),
        deleteOrganization: (organizationId) => {
          deletedResources.push(`organization:${organizationId}`);
          return Promise.resolve();
        },
      },
      signIn: (input) => {
        signedIn.push(input);
        return Promise.resolve();
      },
    });

    const identity = await Effect.runPromise(
      control.createVerifiedIdentity({
        email: "grace+clerk_test@example.test",
        firstName: "Grace",
        lastName: "Hopper",
        permissions: ["registration.read", "registration.decide"],
      })
    );
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
        organizationId: "org_e2e",
        permissions: ["registration.read", "registration.decide"],
        userId: "user_grace",
      },
    ]);
    expect(signedIn).toStrictEqual([
      {
        emailAddress: "grace+clerk_test@example.test",
        organizationId: "org_e2e",
        page,
      },
    ]);
    expect(deletedResources).toStrictEqual([
      "organization:org_e2e",
      "user:user_grace",
    ]);
  });

  it("creates a verified identity and signs it into a loaded Clerk page", async () => {
    const createdUsers: Parameters<ClerkAuthTestApi["createUser"]>[0][] = [];
    const signedIn: { readonly emailAddress: string; readonly page: Page }[] =
      [];
    const visited: string[] = [];
    const page = testPage(visited);
    const control = makeClerkAuthTestControl({
      acceptInvitation: () =>
        Promise.resolve({ authUserId: "unused-invited-user" }),
      api: {
        createUser: (input) => {
          createdUsers.push(input);
          return Promise.resolve({ id: "user_ada" });
        },
        deleteUser: () => Promise.resolve(),
        getInvitationList: () => Promise.resolve({ data: [], totalCount: 0 }),
        getUserList: () => Promise.resolve({ data: [] }),
        revokeInvitation: () => Promise.resolve(),
      },
      signIn: (input) => {
        signedIn.push(input);
        return Promise.resolve();
      },
    });

    const identity = await Effect.runPromise(
      control.createVerifiedIdentity({
        email: "ada+clerk_test@example.test",
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
        emailAddress: ["ada+clerk_test@example.test"],
        firstName: "Ada",
        lastName: "Lovelace",
        skipPasswordRequirement: true,
      },
    ]);
    expect(identity).toStrictEqual({
      authUserId: "user_ada",
      email: "ada+clerk_test@example.test",
      firstName: "Ada",
      lastName: "Lovelace",
    });
    expect(visited).toStrictEqual(["http://localhost:3001/sign-in"]);
    expect(signedIn).toStrictEqual([
      { emailAddress: "ada+clerk_test@example.test", page },
    ]);
  });

  it("accepts the exact pending invitation through its Clerk ticket", async () => {
    const acceptedInvitations: object[] = [];
    const deliveredInvitations: object[] = [];
    const visited: string[] = [];
    const page = testPage(visited);
    const control = makeClerkAuthTestControl({
      acceptInvitation: (input) => {
        acceptedInvitations.push(input);
        return Promise.resolve({ authUserId: "user_grace" });
      },
      api: {
        createUser: () => Promise.resolve({ id: "user_grace" }),
        deleteUser: () => Promise.resolve(),
        getInvitationList: () =>
          Promise.resolve({
            data: [
              {
                emailAddress: "other@example.test",
                id: "invitation-other",
                url: "https://clerk.example.test/tickets/accept?ticket=other-ticket",
              },
              {
                emailAddress: "GRACE+CLERK_TEST@EXAMPLE.TEST",
                id: "invitation-grace",
                url: "https://clerk.example.test/tickets/accept?ticket=grace-ticket",
              },
            ],
            totalCount: 2,
          }),
        getUserList: () => Promise.resolve({ data: [] }),
        revokeInvitation: () => Promise.resolve(),
      },
      deliverAcceptedInvitation: (input) => {
        deliveredInvitations.push(input);
        return Promise.resolve();
      },
      signIn: () => Promise.resolve(),
    });
    const identity = await Effect.runPromise(
      control.acceptPendingInvitation({
        applicationUrl: "http://localhost:3001",
        email: "grace+clerk_test@example.test",
        firstName: "Grace",
        lastName: "Hopper",
        page,
      })
    );

    expect(visited).toStrictEqual([]);
    expect(acceptedInvitations).toStrictEqual([
      {
        applicationUrl: "http://localhost:3001",
        email: "grace+clerk_test@example.test",
        firstName: "Grace",
        invitationUrl:
          "https://clerk.example.test/tickets/accept?ticket=grace-ticket",
        lastName: "Hopper",
        page,
      },
    ]);
    expect(deliveredInvitations).toStrictEqual([
      { authUserId: "user_grace", page },
    ]);
    expect(identity).toStrictEqual({
      authUserId: "user_grace",
      email: "grace+clerk_test@example.test",
      firstName: "Grace",
      lastName: "Hopper",
    });
  });

  it("cleans up a user created before browser invitation acceptance fails", async () => {
    const deletedUserIds: string[] = [];
    let userLookupCount = 0;
    const control = makeClerkAuthTestControl({
      acceptInvitation: () =>
        Promise.reject(new Error("Clerk session did not become active")),
      api: {
        createUser: () => Promise.resolve({ id: "unused" }),
        deleteUser: (userId) => {
          deletedUserIds.push(userId);
          return Promise.resolve();
        },
        getInvitationList: () =>
          Promise.resolve({
            data: [
              {
                emailAddress: "grace+clerk_test@example.test",
                id: "invitation-grace",
                url: "https://clerk.example.test/tickets/accept?ticket=grace-ticket",
              },
            ],
            totalCount: 1,
          }),
        getUserList: () => {
          userLookupCount += 1;
          return Promise.resolve({
            data: userLookupCount < 3 ? [] : [{ id: "user-created-by-signup" }],
          });
        },
        revokeInvitation: () => Promise.resolve(),
      },
      signIn: () => Promise.resolve(),
    });

    await expect(
      Effect.runPromise(
        control.acceptPendingInvitation({
          applicationUrl: "http://localhost:3001",
          email: "grace+clerk_test@example.test",
          firstName: "Grace",
          lastName: "Hopper",
          page: testPage([]),
        })
      )
    ).rejects.toMatchObject({
      operation: "acceptInvitation",
      provider: "clerk",
    });
    expect(deletedUserIds).toStrictEqual(["user-created-by-signup"]);
  });

  it("preserves a Clerk user that existed before invitation acceptance", async () => {
    const deletedUserIds: string[] = [];
    const control = makeClerkAuthTestControl({
      acceptInvitation: () => Promise.reject(new Error("Signup rejected")),
      api: {
        createUser: () => Promise.resolve({ id: "unused" }),
        deleteUser: (userId) => {
          deletedUserIds.push(userId);
          return Promise.resolve();
        },
        getInvitationList: () =>
          Promise.resolve({
            data: [
              {
                emailAddress: "grace+clerk_test@example.test",
                id: "invitation-grace",
                url: "https://clerk.example.test/tickets/accept?ticket=grace-ticket",
              },
            ],
            totalCount: 1,
          }),
        getUserList: () =>
          Promise.resolve({ data: [{ id: "preexisting-user" }] }),
        revokeInvitation: () => Promise.resolve(),
      },
      signIn: () => Promise.resolve(),
    });

    await expect(
      Effect.runPromise(
        control.acceptPendingInvitation({
          applicationUrl: "http://localhost:3001",
          email: "grace+clerk_test@example.test",
          firstName: "Grace",
          lastName: "Hopper",
          page: testPage([]),
        })
      )
    ).rejects.toMatchObject({ operation: "acceptInvitation" });
    expect(deletedUserIds).toStrictEqual([]);
  });

  it("paginates, exact-matches, and revokes pending invitations", async () => {
    const listInputs: Parameters<ClerkAuthTestApi["getInvitationList"]>[0][] =
      [];
    const revoked: string[] = [];
    const control = makeClerkAuthTestControl({
      acceptInvitation: () =>
        Promise.resolve({ authUserId: "unused-invited-user" }),
      api: {
        createUser: () => Promise.resolve({ id: "unused" }),
        deleteUser: () => Promise.resolve(),
        getInvitationList: (input) => {
          listInputs.push(input);
          return Promise.resolve(
            input.offset === 0
              ? {
                  data: [
                    {
                      emailAddress: "grace+clerk_test@example.test",
                      id: "invitation-exact",
                    },
                    {
                      emailAddress: "another-grace+clerk_test@example.test",
                      id: "invitation-partial",
                    },
                  ],
                  totalCount: 3,
                }
              : {
                  data: [
                    {
                      emailAddress: "GRACE+CLERK_TEST@EXAMPLE.TEST",
                      id: "invitation-case-insensitive",
                    },
                  ],
                  totalCount: 3,
                }
          );
        },
        getUserList: () => Promise.resolve({ data: [] }),
        revokeInvitation: (invitationId) => {
          revoked.push(invitationId);
          return Promise.resolve();
        },
      },
      signIn: () => Promise.resolve(),
    });

    await Effect.runPromise(
      control.revokePendingInvitationsFor("grace+clerk_test@example.test")
    );

    expect(listInputs).toStrictEqual([
      {
        limit: 100,
        offset: 0,
        query: "grace+clerk_test@example.test",
        status: "pending",
      },
      {
        limit: 100,
        offset: 2,
        query: "grace+clerk_test@example.test",
        status: "pending",
      },
    ]);
    expect(revoked).toStrictEqual([
      "invitation-exact",
      "invitation-case-insensitive",
    ]);
  });

  it("revokes every matching invitation when each revoke mutates the pending list", async () => {
    const emailAddress = "grace+clerk_test@example.test";
    const pendingInvitations = Array.from({ length: 101 }, (_, index) => ({
      emailAddress,
      id: `invitation-${index}`,
    }));
    const control = makeClerkAuthTestControl({
      acceptInvitation: () =>
        Promise.resolve({ authUserId: "unused-invited-user" }),
      api: {
        createUser: () => Promise.resolve({ id: "unused" }),
        deleteUser: () => Promise.resolve(),
        getInvitationList: ({ limit, offset }) =>
          Promise.resolve({
            data: pendingInvitations.slice(offset, offset + limit),
            totalCount: pendingInvitations.length,
          }),
        getUserList: () => Promise.resolve({ data: [] }),
        revokeInvitation: (invitationId) => {
          const index = pendingInvitations.findIndex(
            ({ id }) => id === invitationId
          );
          if (index !== -1) {
            pendingInvitations.splice(index, 1);
          }
          return Promise.resolve();
        },
      },
      signIn: () => Promise.resolve(),
    });

    await Effect.runPromise(control.revokePendingInvitationsFor(emailAddress));

    expect(pendingInvitations).toStrictEqual([]);
  });

  it("retries rate-limited invitation cleanup", async () => {
    const emailAddress = "grace+clerk_test@example.test";
    let listAttempts = 0;
    let revokeAttempts = 0;
    const control = makeClerkAuthTestControl({
      acceptInvitation: () =>
        Promise.resolve({ authUserId: "unused-invited-user" }),
      api: {
        createUser: () => Promise.resolve({ id: "unused" }),
        deleteUser: () => Promise.resolve(),
        getInvitationList: () => {
          listAttempts += 1;
          return listAttempts === 1
            ? Promise.reject(clerkRateLimited())
            : Promise.resolve({
                data: [{ emailAddress, id: "invitation-rate-limited" }],
                totalCount: 1,
              });
        },
        getUserList: () => Promise.resolve({ data: [] }),
        revokeInvitation: () => {
          revokeAttempts += 1;
          return revokeAttempts === 1
            ? Promise.reject(clerkRateLimited())
            : Promise.resolve();
        },
      },
      signIn: () => Promise.resolve(),
    });

    await Effect.runPromise(control.revokePendingInvitationsFor(emailAddress));

    expect(listAttempts).toBe(2);
    expect(revokeAttempts).toBe(2);
  });

  it("retries transient transport failures during invitation cleanup", async () => {
    const emailAddress = "grace+clerk_test@example.test";
    let listAttempts = 0;
    let revokeAttempts = 0;
    const control = makeClerkAuthTestControl({
      acceptInvitation: () =>
        Promise.resolve({ authUserId: "unused-invited-user" }),
      api: {
        createUser: () => Promise.resolve({ id: "unused" }),
        deleteUser: () => Promise.resolve(),
        getInvitationList: () => {
          listAttempts += 1;
          return listAttempts === 1
            ? Promise.reject(transientTransportFailure())
            : Promise.resolve({
                data: [{ emailAddress, id: "invitation-after-network-retry" }],
                totalCount: 1,
              });
        },
        getUserList: () => Promise.resolve({ data: [] }),
        revokeInvitation: () => {
          revokeAttempts += 1;
          return revokeAttempts === 1
            ? Promise.reject(transientTransportFailure())
            : Promise.resolve();
        },
      },
      signIn: () => Promise.resolve(),
    });

    await Effect.runPromise(control.revokePendingInvitationsFor(emailAddress));

    expect(listAttempts).toBe(2);
    expect(revokeAttempts).toBe(2);
  });

  it("treats already-absent Clerk resources as cleaned", async () => {
    const control = makeClerkAuthTestControl({
      acceptInvitation: () =>
        Promise.resolve({ authUserId: "unused-invited-user" }),
      api: {
        createUser: () => Promise.resolve({ id: "unused" }),
        deleteUser: () => Promise.reject(clerkNotFound()),
        getInvitationList: () =>
          Promise.resolve({
            data: [
              {
                emailAddress: "missing+clerk_test@example.test",
                id: "invitation-missing",
              },
            ],
            totalCount: 1,
          }),
        getUserList: () => Promise.resolve({ data: [] }),
        revokeInvitation: () => Promise.reject(clerkNotFound()),
      },
      signIn: () => Promise.resolve(),
    });

    await expect(
      Effect.runPromise(
        control.revokePendingInvitationsFor("missing+clerk_test@example.test")
      )
    ).resolves.toBeUndefined();
    await expect(
      Effect.runPromise(
        control.deleteIdentity({
          authUserId: "user-missing",
          email: "missing+clerk_test@example.test",
          firstName: "Missing",
          lastName: "Person",
        })
      )
    ).resolves.toBeUndefined();
  });
});
