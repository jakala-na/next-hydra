import { getRegistrationApprovalHookToken } from "@repo/registration-effect";
import { RegistrationApiError } from "@repo/registration-effect/http/registration-api";
import { Effect } from "effect";
import { resumeHook, start } from "workflow/api";
import { env } from "@/env";
import { makeRegistrationEffectHttpHandler } from "@/lib/registration-effect-http";
import { registrationEffectLayer } from "@/lib/registration-effect-runtime";
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

const { handler } = makeRegistrationEffectHttpHandler({
  approvalSecret: env.REGISTRATION_APPROVAL_SECRET,
  layer: registrationEffectLayer,
  resumeRegistrationWorkflow,
  startRegistrationWorkflow,
});

export const GET = handler;

export const POST = handler;
