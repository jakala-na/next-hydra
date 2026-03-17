import { createHmac, timingSafeEqual } from "node:crypto";
import { getWorkosUser } from "@repo/auth-workos/admin";
import {
  markRegistrationInvitationRevoked,
  syncRegistrationIdentityFromInvitation,
} from "@repo/commerce/lib/b2b-registration/service";
import { log } from "@repo/observability/log";
import { ZodError, z } from "zod";
import { env } from "../../../../env";

const FIVE_MINUTES_IN_MILLISECONDS = 5 * 60 * 1000;

const webhookEventSchema = z.object({
  event: z.string().min(1),
  id: z.string().min(1),
  data: z.unknown(),
});

const invitationEventDataSchema = z.object({
  id: z.string().min(1),
  accepted_user_id: z.string().nullable().optional(),
});

const parseSignatureHeader = (header: string) => {
  const values = Object.fromEntries(
    header.split(",").map((segment) => {
      const [key, value] = segment.trim().split("=");
      return [key, value];
    })
  );

  return {
    timestamp: values.t,
    signature: values.v1,
  };
};

const isValidWorkosSignature = (rawBody: string, signatureHeader: string) => {
  const { timestamp, signature } = parseSignatureHeader(signatureHeader);

  if (!(timestamp && signature)) {
    return false;
  }

  const issuedAt = Number.parseInt(timestamp, 10);

  if (!Number.isFinite(issuedAt)) {
    return false;
  }

  if (Math.abs(Date.now() - issuedAt) > FIVE_MINUTES_IN_MILLISECONDS) {
    return false;
  }

  const expectedSignature = createHmac("sha256", env.WORKOS_WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  if (expectedSignature.length !== signature.length) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(expectedSignature, "utf8"),
    Buffer.from(signature, "utf8")
  );
};

export async function POST(request: Request): Promise<Response> {
  try {
    const signatureHeader = request.headers.get("workos-signature");

    if (!signatureHeader) {
      return Response.json(
        { error: "Missing WorkOS signature" },
        { status: 401 }
      );
    }

    const rawBody = await request.text();

    if (!isValidWorkosSignature(rawBody, signatureHeader)) {
      return Response.json(
        { error: "Invalid WorkOS signature" },
        { status: 401 }
      );
    }

    const payload = webhookEventSchema.parse(JSON.parse(rawBody));

    if (payload.event === "invitation.revoked") {
      const data = invitationEventDataSchema.parse(payload.data);
      await markRegistrationInvitationRevoked(data.id);
      return Response.json({ ok: true });
    }

    if (payload.event !== "invitation.accepted") {
      return Response.json({ ok: true, ignored: true });
    }

    const data = invitationEventDataSchema.parse(payload.data);

    if (!data.accepted_user_id) {
      return Response.json(
        { error: "Invitation accepted event missing accepted user id" },
        { status: 400 }
      );
    }

    const user = await getWorkosUser(data.accepted_user_id);
    const record = await syncRegistrationIdentityFromInvitation(data.id, {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    });

    if (!record) {
      log.warn("Received WorkOS invitation event for unknown registration", {
        invitationId: data.id,
        eventId: payload.id,
        eventType: payload.event,
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return Response.json(
        { error: "Invalid WorkOS webhook payload" },
        { status: 400 }
      );
    }

    throw error;
  }
}
