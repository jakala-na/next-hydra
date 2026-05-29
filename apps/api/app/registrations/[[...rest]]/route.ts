import { getRegistrationApprovalHookToken } from "@repo/registration";
import { RegistrationApiError } from "@repo/registration/http/registration-api";
import { Effect } from "effect";
import type { NextRequest } from "next/server";
import { resumeHook, start } from "workflow/api";
import { env } from "@/env";
import { makeRegistrationHttpHandler } from "@/lib/registration/http";
import { registrationLayer } from "@/lib/registration/runtime";
import type { RegistrationWorkflowDecision } from "@/lib/registration-workflow-contract";
import { registerCompanyWorkflow } from "@/workflows/register-company";

const startRegistrationWorkflow = (registrationId: string) =>
  Effect.tryPromise({
    try: () => start(registerCompanyWorkflow, [{ registrationId }]),
    catch: (cause) =>
      new RegistrationApiError({
        message:
          cause instanceof Error
            ? cause.message
            : "Registration workflow could not be started",
      }),
  });

const resumeRegistrationWorkflow = (
  registrationId: string,
  decision: RegistrationWorkflowDecision
) =>
  Effect.tryPromise({
    try: () =>
      resumeHook(getRegistrationApprovalHookToken(registrationId), decision),
    catch: (cause) =>
      new RegistrationApiError({
        message:
          cause instanceof Error
            ? cause.message
            : "Registration workflow could not be resumed",
      }),
  });

const { handler } = makeRegistrationHttpHandler({
  approvalSecret: env.REGISTRATION_APPROVAL_SECRET,
  layer: registrationLayer,
  resumeRegistrationWorkflow,
  startRegistrationWorkflow,
});

const handleRegistrationRequest = (
  request: NextRequest,
  _context: RouteContext<"/registrations/[[...rest]]">
): Promise<Response> => handler(request);

export const GET = handleRegistrationRequest;

export const POST = handleRegistrationRequest;
