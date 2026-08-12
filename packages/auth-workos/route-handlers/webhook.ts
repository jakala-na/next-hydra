import { log } from "@repo/observability/log";
import { getRegistrationInvitationHookToken } from "@repo/registration";
import { WorkOS } from "@workos-inc/node";
import { resumeHook } from "workflow/api";
import { getWorkosUser } from "../admin";
import { keys, webhookKeys } from "../keys";

export async function POST(request: Request): Promise<Response> {
  const env = keys();
  const webhookEnv = webhookKeys();
  const workos = new WorkOS(env.WORKOS_API_KEY);

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
      secret: webhookEnv.WORKOS_WEBHOOK_SECRET,
      sigHeader: signatureHeader,
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
          acceptedIdentity: {
            authUserId: user.id,
            email: user.email,
            ...(user.firstName ? { firstName: user.firstName } : {}),
            ...(user.lastName ? { lastName: user.lastName } : {}),
          },
          event: "accepted",
        });

        return Response.json({ ok: true });
      }
      default:
        return Response.json({ ignored: true, ok: true });
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
