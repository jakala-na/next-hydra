import { getWorkosUser } from "@repo/auth-workos/admin";
import { log } from "@repo/observability/log";
import { getRegistrationInvitationHookToken } from "@repo/registration-effect";
import { WorkOS } from "@workos-inc/node";
import { resumeHook } from "workflow/api";
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
        await resumeHook(getRegistrationInvitationHookToken(payload.data.id), {
          event: "revoked",
        });
        return Response.json({ ok: true });
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
        await resumeHook(getRegistrationInvitationHookToken(payload.data.id), {
          event: "accepted",
          acceptedIdentity: {
            authUserId: user.id,
            email: user.email,
            ...(user.firstName ? { firstName: user.firstName } : {}),
            ...(user.lastName ? { lastName: user.lastName } : {}),
          },
        });

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

    log.warn("WorkOS webhook processing failed", { error });
    throw error;
  }
}
