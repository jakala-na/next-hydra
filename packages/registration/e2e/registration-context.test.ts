/* oxlint-disable typescript/promise-function-async -- Test doubles return already-settled promises to implement asynchronous context ports. */
/* oxlint-disable vitest/max-expects -- Each test verifies one complete context lifecycle across its service boundaries. */
import {
  AuthTestControl,
  AuthTestFailure,
} from "@repo/auth-contract/e2e/auth-test-control";
import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import { StoreKey } from "@repo/commerce/store";
import { Effect, Layer, ManagedRuntime } from "effect";
import { describe, expect, it } from "vitest";

import { provisionCompanyMember } from "../programs/company-member-invitations";
import { provisionApprovedRegistration } from "../programs/registration-onboarding";
import { CompanyInvitationPolicy } from "../services/company-invitation-policy";
import { CompanyMemberIdentityProjection } from "../services/company-member-identity-projection";
import { RegistrationContext } from "./registration-context";

describe("RegistrationContext", () => {
  it("creates a company with its initial administrator", async () => {
    const projectedMemberships: {
      readonly authUserId: string;
      readonly businessUnitId: string;
      readonly roles: readonly string[];
    }[] = [];
    const identityProjection = CompanyMemberIdentityProjection.of({
      projectAcceptedInvitation: () => Effect.void,
      projectMembership: (input) =>
        Effect.sync(() => {
          projectedMemberships.push(input);
        }),
      removeMembership: () => Effect.void,
    });
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(
        CommerceAccounts.layerMemory,
        CompanyInvitationPolicy.layer,
        Layer.succeed(CompanyMemberIdentityProjection, identityProjection)
      )
    );
    const commerceAccounts = await runtime.runPromise(CommerceAccounts);
    const deletedUsers: string[] = [];
    const deletedInvitations: string[] = [];
    const cleanupOrder: string[] = [];
    const auth = AuthTestControl.of({
      createVerifiedIdentity: (input) =>
        Effect.succeed({
          authUserId: "user-ada",
          ...input,
        }),
      deleteIdentity: (identity) =>
        Effect.sync(() => {
          deletedUsers.push(identity.authUserId);
          cleanupOrder.push(`identity:${identity.authUserId}`);
        }),
      revokePendingInvitationsFor: (email) =>
        Effect.sync(() => {
          deletedInvitations.push(email);
          cleanupOrder.push(`invitation:${email}`);
        }),
      signIn: () => Effect.void,
    });
    const deletedAccounts: {
      readonly businessUnitId: string;
      readonly customerId: string;
    }[] = [];
    const deletedRegistrations: string[] = [];
    const registration = new RegistrationContext({
      auth,
      deleteCommerceAccount: (account) => {
        deletedAccounts.push(account);
        cleanupOrder.push(`commerce:${account.businessUnitId}`);
        return Promise.resolve();
      },
      deleteRegistration: (registrationId) => {
        deletedRegistrations.push(registrationId);
        cleanupOrder.push(`registration:${registrationId}`);
        return Promise.resolve();
      },
      provisionCompany: (input) =>
        runtime.runPromise(provisionApprovedRegistration(input)),
      provisionCompanyMember: (input) =>
        runtime.runPromise(provisionCompanyMember(input)),
      storeKey: StoreKey.make("default-store"),
      uniqueEmail: (localPart) => `${localPart}@e2e.example.test`,
      uniqueId: (prefix) => `${prefix}-scenario-1`,
    });

    const company = await registration.givenCompany({
      administrator: { firstName: "Ada", lastName: "Lovelace" },
      name: "Analytical Engines",
    });
    registration.trackCompanyMemberInvitation("grace@example.test");
    registration.trackRegistration({
      email: "charles@example.test",
      registrationId: "registration-charles",
    });

    expect(company.name).toBe("Analytical Engines");
    expect(company.administrator).toMatchObject({
      authUserId: "user-ada",
      email: "ada-lovelace@e2e.example.test",
      firstName: "Ada",
      lastName: "Lovelace",
    });
    expect(
      company.administrator.memberships.get(company.businessUnitId)
    ).toStrictEqual(["admin", "buyer"]);
    await expect(
      runtime.runPromise(
        commerceAccounts.getCustomerIdByAuthUserId(
          company.administrator.authUserId
        )
      )
    ).resolves.toBe(company.administrator.customerId);
    expect(projectedMemberships).toStrictEqual([
      {
        authUserId: "user-ada",
        businessUnitId: company.businessUnitId,
        roles: ["admin", "buyer"],
      },
    ]);

    await registration.dispose();

    expect(deletedAccounts).toHaveLength(1);
    expect(deletedAccounts[0]).toMatchObject({
      businessUnitId: company.businessUnitId,
      customerId: company.administrator.customerId,
    });
    expect(deletedUsers).toStrictEqual(["user-ada"]);
    expect(deletedInvitations).toStrictEqual([
      "charles@example.test",
      "charles@example.test",
      "grace@example.test",
    ]);
    expect(deletedRegistrations).toStrictEqual(["registration-charles"]);
    expect(cleanupOrder).toStrictEqual([
      "invitation:charles@example.test",
      "registration:registration-charles",
      "invitation:charles@example.test",
      "invitation:grace@example.test",
      `commerce:${company.businessUnitId}`,
      "identity:user-ada",
    ]);
    await runtime.dispose();
  });

  it("reuses one Company Member identity across multiple Business Units", async () => {
    const projectedUserIds: string[] = [];
    const identityProjection = CompanyMemberIdentityProjection.of({
      projectAcceptedInvitation: () => Effect.void,
      projectMembership: (input) =>
        Effect.sync(() => {
          projectedUserIds.push(input.authUserId);
        }),
      removeMembership: () => Effect.void,
    });
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(
        CommerceAccounts.layerMemory,
        CompanyInvitationPolicy.layer,
        Layer.succeed(CompanyMemberIdentityProjection, identityProjection)
      )
    );
    const commerceAccounts = await runtime.runPromise(CommerceAccounts);
    const deletedUsers: string[] = [];
    const cleanupOrder: string[] = [];
    const auth = AuthTestControl.of({
      createVerifiedIdentity: (input) =>
        Effect.succeed({
          authUserId: `user-${input.firstName.toLowerCase()}`,
          ...input,
        }),
      deleteIdentity: (identity) =>
        Effect.sync(() => {
          deletedUsers.push(identity.authUserId);
          cleanupOrder.push(`identity:${identity.authUserId}`);
        }),
      revokePendingInvitationsFor: () => Effect.void,
      signIn: () => Effect.void,
    });
    const registration = new RegistrationContext({
      auth,
      deleteCommerceAccount: (account) => {
        cleanupOrder.push(`commerce:${account.businessUnitId}`);
        return Promise.resolve();
      },
      deleteRegistration: () => Promise.resolve(),
      provisionCompany: (input) =>
        runtime.runPromise(provisionApprovedRegistration(input)),
      provisionCompanyMember: (input) =>
        runtime.runPromise(provisionCompanyMember(input)),
      storeKey: StoreKey.make("default-store"),
      uniqueEmail: (localPart) => `${localPart}@e2e.example.test`,
      uniqueId: (prefix) => `${prefix}-scenario-2`,
    });
    const firstCompany = await registration.givenCompany({
      administrator: { firstName: "Ada", lastName: "Lovelace" },
      name: "Analytical Engines",
    });
    const secondCompany = await registration.givenCompany({
      administrator: { firstName: "Charles", lastName: "Babbage" },
      name: "Difference Engine",
    });

    const firstMembership = await registration.givenCompanyMember({
      company: firstCompany,
      firstName: "Grace",
      lastName: "Hopper",
      roles: ["buyer"],
    });
    const member = await registration.givenCompanyMember({
      company: secondCompany,
      companyMember: firstMembership,
      firstName: "Grace",
      lastName: "Hopper",
      roles: ["approver"],
    });

    expect(member).toMatchObject({
      authUserId: "user-grace",
      email: "grace-hopper@e2e.example.test",
      firstName: "Grace",
      lastName: "Hopper",
    });
    expect(member.customerId).toBe(firstMembership.customerId);
    expect(member.memberships.get(firstCompany.businessUnitId)).toStrictEqual([
      "buyer",
    ]);
    expect(member.memberships.get(secondCompany.businessUnitId)).toStrictEqual([
      "approver",
    ]);
    await expect(
      runtime.runPromise(
        commerceAccounts.getCustomerIdByAuthUserId(member.authUserId)
      )
    ).resolves.toBe(member.customerId);
    expect(projectedUserIds).toStrictEqual([
      "user-ada",
      "user-charles",
      "user-grace",
      "user-grace",
    ]);

    await registration.dispose();

    expect(deletedUsers).toStrictEqual([
      "user-grace",
      "user-charles",
      "user-ada",
    ]);
    expect(cleanupOrder).toStrictEqual([
      `commerce:${secondCompany.businessUnitId}`,
      `commerce:${firstCompany.businessUnitId}`,
      "identity:user-grace",
      "identity:user-charles",
      "identity:user-ada",
    ]);
    await runtime.dispose();
  });

  it("can retry cleanup after a transient failure", async () => {
    const identityProjection = CompanyMemberIdentityProjection.of({
      projectAcceptedInvitation: () => Effect.void,
      projectMembership: () => Effect.void,
      removeMembership: () => Effect.void,
    });
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(
        CommerceAccounts.layerMemory,
        CompanyInvitationPolicy.layer,
        Layer.succeed(CompanyMemberIdentityProjection, identityProjection)
      )
    );
    let deleteUserAttempts = 0;
    const auth = AuthTestControl.of({
      createVerifiedIdentity: (input) =>
        Effect.succeed({ authUserId: "user-ada", ...input }),
      deleteIdentity: () =>
        Effect.suspend(() => {
          deleteUserAttempts += 1;
          return deleteUserAttempts === 1
            ? Effect.fail(
                new AuthTestFailure({
                  cause: new Error("WorkOS temporarily unavailable"),
                  message: "WorkOS temporarily unavailable",
                  operation: "deleteIdentity",
                  provider: "workos",
                })
              )
            : Effect.void;
        }),
      revokePendingInvitationsFor: () => Effect.void,
      signIn: () => Effect.void,
    });
    const registration = new RegistrationContext({
      auth,
      deleteCommerceAccount: () => Promise.resolve(),
      deleteRegistration: () => Promise.resolve(),
      provisionCompany: (input) =>
        runtime.runPromise(provisionApprovedRegistration(input)),
      provisionCompanyMember: (input) =>
        runtime.runPromise(provisionCompanyMember(input)),
      storeKey: StoreKey.make("default-store"),
      uniqueEmail: (localPart) => `${localPart}@e2e.example.test`,
      uniqueId: (prefix) => `${prefix}-cleanup-retry`,
    });

    await registration.givenCompany({
      administrator: { firstName: "Ada", lastName: "Lovelace" },
      name: "Analytical Engines",
    });

    await expect(registration.dispose()).rejects.toThrow(
      "Failed to clean up Registration scenario resources"
    );
    await expect(registration.dispose()).resolves.toBeUndefined();
    expect(deleteUserAttempts).toBe(2);
    await runtime.dispose();
  });
});
