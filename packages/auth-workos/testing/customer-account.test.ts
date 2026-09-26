import {
  customerAccountProviderContract,
  inviteeEmail,
} from "@repo/registration/testing/customer-account-provider-contract";
import type { CustomerAccountProviderHarness } from "@repo/registration/testing/customer-account-provider-contract";
import { expect, vi } from "vitest";

import {
  makeWorkosCompanyMemberInvitations,
  makeWorkosInvitationDeliveries,
} from "../invitations";
import type {
  WorkosCompanyMemberInvitationUserManagement,
  WorkosInvitationSender,
} from "../invitations";

function createWorkosHarness(): CustomerAccountProviderHarness {
  const invitations = new Map<
    string,
    {
      acceptInvitationUrl: string;
      acceptedAt: null;
      acceptedUserId: null;
      createdAt: string;
      email: string;
      expiresAt: string;
      id: string;
      inviterUserId: string | null;
      object: "invitation";
      organizationId: null;
      revokedAt: string | null;
      state: "pending" | "revoked";
      token: string;
      updatedAt: string;
    }
  >();
  const sendInvitation = vi.fn<WorkosInvitationSender["sendInvitation"]>(
    async (input) => {
      const id = `workos-invitation-${invitations.size + 1}`;
      const invitation = {
        acceptInvitationUrl: "https://workos.example.test/invitations/accept",
        acceptedAt: null,
        acceptedUserId: null,
        createdAt: "2026-08-25T12:00:00.000Z",
        email: input.email,
        expiresAt: "2026-09-24T12:00:00.000Z",
        id,
        inviterUserId: input.inviterUserId ?? null,
        object: "invitation",
        organizationId: null,
        revokedAt: null,
        state: "pending",
        token: "token-1",
        updatedAt: "2026-08-25T12:00:00.000Z",
      } as const;
      invitations.set(id, invitation);
      return await Promise.resolve(invitation);
    }
  );
  const revokeInvitation = vi.fn<
    WorkosCompanyMemberInvitationUserManagement["revokeInvitation"]
  >(async (id) => {
    const current = invitations.get(id);
    if (current === undefined) {
      throw new Error(`Unknown WorkOS invitation ${id}`);
    }
    const revoked = {
      ...current,
      revokedAt: "2026-08-26T12:00:00.000Z",
      state: "revoked" as const,
    };
    invitations.set(id, revoked);
    return await Promise.resolve(revoked);
  });
  const userManagement: WorkosCompanyMemberInvitationUserManagement = {
    getInvitation: async (id) => {
      const invitation = invitations.get(id);
      return invitation === undefined
        ? await Promise.reject(new Error(`Unknown WorkOS invitation ${id}`))
        : await Promise.resolve(invitation);
    },
    revokeInvitation,
    sendInvitation,
  };

  return {
    assertIssued: () => {
      expect(sendInvitation).toHaveBeenCalledWith({
        email: inviteeEmail,
        inviterUserId: "auth-admin-1",
      });
    },
    assertLifecycle: () => {
      expect(sendInvitation).toHaveBeenCalledTimes(2);
      expect(revokeInvitation).toHaveBeenCalledWith("workos-invitation-1");
    },
    deliveries: makeWorkosInvitationDeliveries(userManagement),
    invitationId: "workos-invitation-1",
    invitations: makeWorkosCompanyMemberInvitations(userManagement),
  };
}

customerAccountProviderContract("WorkOS", createWorkosHarness);
