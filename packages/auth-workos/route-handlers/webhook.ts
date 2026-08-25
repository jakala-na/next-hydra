import { log } from "@repo/observability/log";
import {
  AuthUserId,
  Email,
  InvitationId,
  PersonName,
} from "@repo/registration/domain/identity";
import type { RegistrationInvitationEvent } from "@repo/registration/services/registration-workflow";
import { WorkOS } from "@workos-inc/node";

import { getWorkosUser } from "../admin";
import { keys, webhookKeys } from "../keys";

export interface WorkosWebhookHandlerOptions {
  readonly onInvitationEvent: (input: {
    readonly event: RegistrationInvitationEvent;
    readonly invitationId: InvitationId;
  }) => Promise<void>;
}

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const makeWorkosWebhookHandler = (
  options: WorkosWebhookHandlerOptions
) =>
  async function POST(request: Request): Promise<Response> {
    const env = keys();
    const webhookEnv = webhookKeys();
    const workos = new WorkOS(env.WORKOS_API_KEY);
    const signatureHeader = request.headers.get("workos-signature");

    if (!signatureHeader) {
      return Response.json(
        { error: "Missing WorkOS signature" },
        { status: 401 }
      );
    }

    let requestPayload: unknown;
    try {
      requestPayload = await request.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        return Response.json(
          { error: "Invalid WorkOS webhook payload" },
          { status: 400 }
        );
      }

      throw error;
    }

    if (!isJsonObject(requestPayload)) {
      return Response.json(
        { error: "Invalid WorkOS webhook payload" },
        { status: 400 }
      );
    }

    let payload: Awaited<ReturnType<typeof workos.webhooks.constructEvent>>;
    try {
      payload = await workos.webhooks.constructEvent({
        payload: requestPayload,
        secret: webhookEnv.WORKOS_WEBHOOK_SECRET,
        sigHeader: signatureHeader,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "SignatureVerificationException"
      ) {
        return Response.json(
          { error: "Invalid WorkOS signature" },
          { status: 401 }
        );
      }

      log.warn("WorkOS webhook verification failed", { error });
      throw error;
    }

    try {
      switch (payload.event) {
        case "invitation.revoked": {
          await options.onInvitationEvent({
            event: { event: "revoked" },
            invitationId: InvitationId.make(payload.data.id),
          });
          return Response.json({ ok: true });
        }
        case "invitation.accepted": {
          const invitationEventData = payload.data as typeof payload.data & {
            readonly accepted_user_id?: string | null;
          };
          const acceptedUserId =
            invitationEventData.acceptedUserId ??
            invitationEventData.accepted_user_id;

          if (!acceptedUserId) {
            return Response.json(
              { error: "Invitation accepted event missing accepted user id" },
              { status: 400 }
            );
          }

          const user = await getWorkosUser(acceptedUserId);
          await options.onInvitationEvent({
            event: {
              acceptedIdentity: {
                authUserId: AuthUserId.make(user.id),
                email: Email.make(user.email),
                ...(user.firstName
                  ? { firstName: PersonName.make(user.firstName) }
                  : {}),
                ...(user.lastName
                  ? { lastName: PersonName.make(user.lastName) }
                  : {}),
              },
              event: "accepted",
            },
            invitationId: InvitationId.make(payload.data.id),
          });

          return Response.json({ ok: true });
        }
        default: {
          return Response.json({ ignored: true, ok: true });
        }
      }
    } catch (error) {
      log.warn("WorkOS webhook processing failed", { error });
      throw error;
    }
  };
