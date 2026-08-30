import { randomUUID } from "node:crypto";

import type { AcceptPendingAuthInvitationInput } from "@repo/auth-contract/e2e/auth-test-control";
import type { WorkOS } from "@workos-inc/node";
import { DateTime } from "effect";

type Page = AcceptPendingAuthInvitationInput["page"];

export interface WorkosInvitationWebhookRelayInput {
  readonly authUserId: string;
  readonly invitationId: string;
  readonly page: Page;
}

export type WorkosInvitationWebhookRelay = (
  input: WorkosInvitationWebhookRelayInput
) => Promise<void>;

interface LocalWorkosInvitationWebhookRelayOptions {
  readonly apiUrl: string;
  readonly webhookSecret: string;
  readonly workos: Pick<WorkOS, "webhooks"> & {
    readonly userManagement: Pick<WorkOS["userManagement"], "getInvitation">;
  };
}

export const localWorkosInvitationWebhookRelay =
  ({
    apiUrl,
    webhookSecret,
    workos,
  }: LocalWorkosInvitationWebhookRelayOptions): WorkosInvitationWebhookRelay =>
  async ({ authUserId, invitationId, page }) => {
    const invitation = await workos.userManagement.getInvitation(invitationId);
    if (invitation.state !== "accepted" || invitation.acceptedAt === null) {
      throw new Error(
        `WorkOS invitation ${invitationId} was not accepted after authentication`
      );
    }
    if (
      invitation.acceptedUserId === null ||
      invitation.acceptedUserId !== authUserId
    ) {
      throw new Error(
        `WorkOS invitation ${invitationId} was accepted by an unexpected user`
      );
    }

    const now = DateTime.toDateUtc(DateTime.nowUnsafe());
    const event = {
      created_at: now.toISOString(),
      data: {
        accepted_at: invitation.acceptedAt,
        accepted_user_id: invitation.acceptedUserId,
        created_at: invitation.createdAt,
        email: invitation.email,
        expires_at: invitation.expiresAt,
        id: invitation.id,
        inviter_user_id: invitation.inviterUserId,
        object: invitation.object,
        organization_id: invitation.organizationId,
        revoked_at: invitation.revokedAt,
        state: invitation.state,
        updated_at: invitation.updatedAt,
      },
      event: "invitation.accepted",
      id: `event_${randomUUID()}`,
    };
    const timestamp = String(now.getTime());
    const signature = await workos.webhooks.computeSignature(
      timestamp,
      event,
      webhookSecret
    );
    const response = await page.request.post(
      new URL("/api/webhooks/workos", apiUrl).href,
      {
        data: event,
        headers: {
          "workos-signature": `t=${timestamp},v1=${signature}`,
        },
      }
    );
    if (!response.ok()) {
      throw new Error(
        `The local WorkOS webhook relay failed with ${response.status()}: ${await response.text()}`
      );
    }
  };
