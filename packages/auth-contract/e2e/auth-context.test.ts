/* oxlint-disable typescript/promise-function-async -- Test doubles return settled promises for Playwright's asynchronous Page contract. */
import type { Page } from "@repo/e2e-testing";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { AuthContext } from "./auth-context";
import { createAuthScenario } from "./auth-scenario";
import { AuthTestControl } from "./auth-test-control";

const pageStub = (visitedUrls: string[]): Page => {
  const page = {
    goto: (url: string) => {
      visitedUrls.push(url);
      return Promise.resolve(null);
    },
  };

  // SAFETY: AuthContext exercises only Page.goto; the provider control checks
  // object identity without invoking another Page method.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return page as Page;
};

const authControl = (signedInUserIds: string[]) =>
  AuthTestControl.of({
    acceptPendingInvitation: (input) =>
      Effect.succeed({ authUserId: `invited-${input.firstName}`, ...input }),
    createVerifiedIdentity: (input) =>
      Effect.succeed({ authUserId: `user-${input.firstName}`, ...input }),
    deleteIdentity: () => Effect.void,
    emailAddressFor: (uniqueSeed) => `${uniqueSeed}@example.test`,
    revokePendingInvitationsFor: () => Effect.void,
    signIn: ({ identity }) =>
      Effect.sync(() => {
        signedInUserIds.push(identity.authUserId);
      }),
  });

describe(AuthContext, () => {
  it("logs a remembered customer identity into the web application", async () => {
    const signedInCustomerIds: string[] = [];
    const visitedWebUrls: string[] = [];
    const scenario = createAuthScenario();
    const auth = new AuthContext({
      applications: {
        admin: {
          auth: authControl([]),
          page: pageStub([]),
          url: "https://admin.example.test",
        },
        web: {
          auth: authControl(signedInCustomerIds),
          page: pageStub(visitedWebUrls),
          url: "https://web.example.test",
        },
      },
      scenario,
    });
    auth.rememberIdentity("Ada Lovelace", {
      authUserId: "customer-ada",
      email: "ada@example.test",
      firstName: "Ada",
      lastName: "Lovelace",
    });

    await auth.loginAs("Ada Lovelace");

    expect(signedInCustomerIds).toStrictEqual(["customer-ada"]);
    expect(visitedWebUrls).toStrictEqual(["https://web.example.test"]);
  });

  it("uses the isolated admin control and page for an admin identity", async () => {
    const signedInAdminIds: string[] = [];
    const signedInCustomerIds: string[] = [];
    const visitedAdminUrls: string[] = [];
    const scenario = createAuthScenario();
    const auth = new AuthContext({
      applications: {
        admin: {
          auth: authControl(signedInAdminIds),
          page: pageStub(visitedAdminUrls),
          url: "https://admin.example.test",
        },
        web: {
          auth: authControl(signedInCustomerIds),
          page: pageStub([]),
          url: "https://web.example.test",
        },
      },
      scenario,
    });
    auth.rememberIdentity(
      "Grace Hopper",
      {
        authUserId: "admin-grace",
        email: "grace@example.test",
        firstName: "Grace",
        lastName: "Hopper",
      },
      "admin"
    );

    await auth.loginAs("Grace Hopper");

    expect(signedInAdminIds).toStrictEqual(["admin-grace"]);
    expect(signedInCustomerIds).toStrictEqual([]);
    expect(visitedAdminUrls).toStrictEqual(["https://admin.example.test"]);
  });

  it("provisions and cleans up an admin user through the admin control", async () => {
    const createdAdminInputs: unknown[] = [];
    const deletedAdminIds: string[] = [];
    const adminControl = AuthTestControl.of({
      acceptPendingInvitation: (input) =>
        Effect.succeed({ authUserId: `invited-${input.firstName}`, ...input }),
      createVerifiedIdentity: (input) =>
        Effect.sync(() => {
          createdAdminInputs.push(input);
          return { authUserId: "admin-grace", ...input };
        }),
      deleteIdentity: (identity) =>
        Effect.sync(() => {
          deletedAdminIds.push(identity.authUserId);
        }),
      emailAddressFor: (uniqueSeed) => `${uniqueSeed}@example.test`,
      revokePendingInvitationsFor: () => Effect.void,
      signIn: () => Effect.void,
    });
    const auth = new AuthContext({
      applications: {
        admin: {
          auth: adminControl,
          page: pageStub([]),
          url: "https://admin.example.test",
        },
        web: {
          auth: authControl([]),
          page: pageStub([]),
          url: "https://web.example.test",
        },
      },
      scenario: createAuthScenario(),
    });

    await auth.givenUser("Grace Hopper", {
      application: "admin",
      email: "grace@example.test",
      firstName: "Grace",
      lastName: "Hopper",
      permissions: ["registration.read", "registration.decide"],
    });
    await auth.loginAs("Grace Hopper");
    await auth.dispose();

    expect(createdAdminInputs).toStrictEqual([
      {
        email: "grace@example.test",
        firstName: "Grace",
        lastName: "Hopper",
        permissions: ["registration.read", "registration.decide"],
      },
    ]);
    expect(deletedAdminIds).toStrictEqual(["admin-grace"]);
  });
});
