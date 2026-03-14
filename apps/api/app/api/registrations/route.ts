import { registrationMessageKey } from "@repo/commerce/lib/b2b-registration/message-keys";
import {
  registrationInputSchema,
  registrationWorkflowInputSchema,
} from "@repo/commerce/lib/b2b-registration/schema";
import {
  createPendingRegistrationRecord,
  markRegistrationWorkflowStartFailed,
} from "@repo/commerce/lib/b2b-registration/service";
import { start } from "workflow/api";
import { ZodError, type z } from "zod";
import { registerCompanyWorkflow } from "@/workflows/register-company";

const requestSchema = registrationInputSchema;

export async function POST(request: Request): Promise<Response> {
  try {
    const json = await request.json();
    const body = requestSchema.parse(json);
    const registrationId = crypto.randomUUID();
    const workflowInput: z.infer<typeof registrationWorkflowInputSchema> =
      registrationWorkflowInputSchema.parse({
        ...body,
        registrationId,
      });

    try {
      await createPendingRegistrationRecord(workflowInput);
      const run = await start(registerCompanyWorkflow, [workflowInput]);

      return Response.json(
        {
          registrationId,
          runId: run.runId,
          status: "pending",
        },
        { status: 202 }
      );
    } catch (error) {
      await markRegistrationWorkflowStartFailed(
        workflowInput,
        registrationMessageKey("gate.failed.description")
      );
      throw error;
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        {
          error: registrationMessageKey("errors.invalidSubmission"),
          issues: error.format(),
        },
        { status: 400 }
      );
    }

    return Response.json(
      {
        error: registrationMessageKey("errors.submitFailed"),
      },
      { status: 500 }
    );
  }
}
