import { getWorkosUser } from "@repo/auth-workos/admin";
import {
  markRegistrationInvitationRevoked,
  syncRegistrationIdentityFromInvitation,
} from "@repo/commerce/lib/b2b-registration/service";
import { log } from "@repo/observability/log";
import { WorkOS } from "@workos-inc/node";
import { env } from "../../../../env";

const workos = new WorkOS(env.WORKOS_API_KEY);

export async function POST(request: Request): Promise<Response> {
  try {
    const signatureHeader = request.headers.get("workos-signature");

    if (!signatureHeader) {
      return Response.json(
        { error: "Missing WorkOS signature" },
        { status: 401 }
      );
    }

    const payload = await workos.webhooks.constructEvent({
      payload: await request.json(),
      sigHeader: signatureHeader,
      secret: env.WORKOS_WEBHOOK_SECRET,
    });

    switch (payload.event) {
      case "invitation.revoked":
        await markRegistrationInvitationRevoked(payload.data.id);
        return Response.json({ ok: true });
      case "invitation.accepted": {
        if (!payload.data.acceptedUserId) {
          return Response.json(
            { error: "Invitation accepted event missing accepted user id" },
            { status: 400 }
          );
        }

        const user = await getWorkosUser(payload.data.acceptedUserId);
        const record = await syncRegistrationIdentityFromInvitation(
          payload.data.id,
          {
            userId: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
          }
        );

        if (!record) {
          log.warn(
            "Received WorkOS invitation event for unknown registration",
            {
              invitationId: payload.data.id,
              eventId: payload.id,
              eventType: payload.event,
            }
          );
        }

        return Response.json({ ok: true });
      }
      default:
        return Response.json({ ok: true, ignored: true });
    }
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

    if (error instanceof SyntaxError) {
      return Response.json(
        { error: "Invalid WorkOS webhook payload" },
        { status: 400 }
      );
    }

    throw error;
  }
}
