import {
  customerAccountProviderContract,
  inviteeEmail,
} from "@repo/registration/testing/customer-account-provider-contract";
import type { CustomerAccountProviderHarness } from "@repo/registration/testing/customer-account-provider-contract";
import { expect, vi } from "vitest";

import {
  makeClerkCompanyMemberInvitations,
  makeClerkInvitationDeliveries,
} from "../invitations";
import type { ClerkInvitationsApi } from "../invitations";

function createClerkHarness(): CustomerAccountProviderHarness {
  const invitations = new Map<
    string,
    Awaited<ReturnType<ClerkInvitationsApi["createInvitation"]>>
  >();
  const createInvitation = vi.fn<ClerkInvitationsApi["createInvitation"]>(
    async (input) => {
      const id = `clerk-invitation-${invitations.size + 1}`;
      const invitation = {
        createdAt: Date.parse("2026-08-25T12:00:00.000Z"),
        emailAddress: input.emailAddress,
        id,
        publicMetadata: input.publicMetadata,
        status: "pending",
        updatedAt: Date.parse("2026-08-25T12:00:00.000Z"),
        url: "https://clerk.example.test/invitations/accept",
      } as const;
      invitations.set(id, invitation);
      return await Promise.resolve(invitation);
    }
  );
  const revokeInvitation = vi.fn<ClerkInvitationsApi["revokeInvitation"]>(
    async (id) => {
      const current = invitations.get(id);
      if (current === undefined) {
        throw new Error(`Unknown Clerk invitation ${id}`);
      }
      const revoked = { ...current, status: "revoked" as const };
      invitations.set(id, revoked);
      return await Promise.resolve(revoked);
    }
  );
  const api: ClerkInvitationsApi = {
    createInvitation,
    getInvitationList: async ({ query, status }) =>
      await Promise.resolve({
        data: [...invitations.values()].filter(
          (invitation) =>
            invitation.id === query &&
            (status === undefined || invitation.status === status)
        ),
      }),
    revokeInvitation,
  };

  return {
    assertIssued: () => {
      const invitationIdMatcher: unknown = expect.stringMatching(
        /^company-member-invitation-/u
      );
      expect(createInvitation).toHaveBeenCalledWith(
        expect.objectContaining({
          emailAddress: inviteeEmail,
          publicMetadata: {
            invitation: {
              businessUnitId: "business-unit-1",
              companyMemberInvitationId: invitationIdMatcher,
              intent: "company_member",
              roles: ["buyer", "approver"],
            },
          },
        })
      );
    },
    assertLifecycle: () => {
      expect(createInvitation).toHaveBeenCalledTimes(2);
      expect(revokeInvitation).toHaveBeenCalledWith("clerk-invitation-1");
    },
    deliveries: makeClerkInvitationDeliveries(api),
    invitationId: "clerk-invitation-1",
    invitations: makeClerkCompanyMemberInvitations(
      api,
      "https://shop.example.test/accept-invitation"
    ),
  };
}

customerAccountProviderContract("Clerk", createClerkHarness);
