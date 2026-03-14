import { getRegistrationRecord } from "@repo/commerce/lib/b2b-registration/service";
import { registrationApprovalDecisionSchema } from "@repo/commerce/lib/b2b-registration/schema";
import { resumeHook } from "workflow/api";
import { ZodError, z } from "zod";
import { env } from "../../../env";

const requestSchema = registrationApprovalDecisionSchema.extend({
  registrationId: z.string().uuid(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const secret = request.headers.get("x-registration-approval-secret");

    if (secret !== env.REGISTRATION_APPROVAL_SECRET) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await request.json();
    const body = requestSchema.parse(json);
    const record = await getRegistrationRecord(body.registrationId);

    if (!record) {
      return Response.json(
        { error: "Registration not found" },
        { status: 404 }
      );
    }

    if (record.status === "approved") {
      if (!record.invitationId) {
        return Response.json(
          {
            error: `Approved registration ${record.registrationId} is missing invitationId`,
          },
          { status: 409 }
        );
      }

      return Response.json(
        {
          registrationId: record.registrationId,
          status: record.status,
          idempotent: true,
        },
        { status: 200 }
      );
    }

    if (record.status === "rejected") {
      return Response.json(
        {
          registrationId: record.registrationId,
          status: record.status,
          idempotent: true,
        },
        { status: 200 }
      );
    }

    if (!record.hookToken) {
      return Response.json(
        {
          error: "Registration is not waiting for approval",
        },
        { status: 409 }
      );
    }

    await resumeHook(record.hookToken, {
      decision: body.decision,
      reason: body.reason,
      actorEmail: body.actorEmail,
      actorName: body.actorName,
    });

    return Response.json({
      registrationId: record.registrationId,
      status: "resumed",
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: "Invalid approval payload",
          issues: error.flatten(),
        },
        { status: 400 }
      );
    }

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Approval request failed",
      },
      { status: 500 }
    );
  }
}
