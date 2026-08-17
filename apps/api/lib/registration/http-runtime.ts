import {
  getRegistrationApprovalHookToken,
  RegistrationWorkflow,
  RegistrationWorkflowResumeOutcomeUnknown,
  RegistrationWorkflowStartUnavailable,
} from "@repo/registration";
import type { RegistrationReviewWorkflowDecision } from "@repo/registration";
import type { RegistrationId } from "@repo/registration/domain/identity";
import { Effect, Layer, Schema } from "effect";
import { resumeHook, start } from "workflow/api";

import { registerCompanyWorkflow } from "@/workflows/register-company";

import { apiAuthenticationLayer } from "../auth/runtime";
import { makeRegistrationHttpHandler } from "./http";
import { registrationLayer } from "./runtime";
import {
  withRegistrationWorkflowResumeOutcome,
  withRegistrationWorkflowStartFailure,
} from "./workflow-failure";

class RegistrationWorkflowRejection extends Schema.TaggedErrorClass<RegistrationWorkflowRejection>()(
  "RegistrationWorkflowRejection",
  {
    cause: Schema.Defect,
  }
) {}

const logWorkflowFailure =
  (operation: "resume" | "start") =>
  <A>(program: Effect.Effect<A, RegistrationWorkflowRejection>) =>
    program.pipe(
      Effect.tapError((failure) =>
        Effect.logError(
          `Registration workflow ${operation} failed`,
          failure.cause
        ).pipe(
          Effect.annotateLogs({
            operation: `registration.workflow.${operation}`,
            service: "registration-api",
          })
        )
      )
    );

const startRegistrationWorkflow = (registrationId: RegistrationId) =>
  Effect.tryPromise({
    catch: (cause) => new RegistrationWorkflowRejection({ cause }),
    try: async () =>
      await start(registerCompanyWorkflow, [
        { registrationId: String(registrationId) },
      ]),
  }).pipe(
    Effect.tap((run) =>
      Effect.logInfo("Registration workflow started").pipe(
        Effect.annotateLogs({
          "registration.id": String(registrationId),
          "workflow.run_id": run.runId,
        })
      )
    ),
    Effect.asVoid,
    logWorkflowFailure("start"),
    withRegistrationWorkflowStartFailure(
      (cause) =>
        new RegistrationWorkflowStartUnavailable({
          cause,
          message: "Registration workflow could not be started",
          registrationId,
        })
    )
  );

const resumeRegistrationWorkflow = (
  registrationId: RegistrationId,
  decision: RegistrationReviewWorkflowDecision
) =>
  Effect.tryPromise({
    catch: (cause) => new RegistrationWorkflowRejection({ cause }),
    try: async () =>
      await resumeHook(
        getRegistrationApprovalHookToken(String(registrationId)),
        decision
      ),
  }).pipe(
    logWorkflowFailure("resume"),
    withRegistrationWorkflowResumeOutcome(
      (cause) =>
        new RegistrationWorkflowResumeOutcomeUnknown({
          cause,
          message: "Registration workflow resume outcome is unknown",
          registrationId,
        })
    )
  );

const registrationWorkflowLayer = Layer.succeed(
  RegistrationWorkflow,
  RegistrationWorkflow.of({
    resume: resumeRegistrationWorkflow,
    start: startRegistrationWorkflow,
  })
);

const registrationHttp = makeRegistrationHttpHandler({
  authenticationLayer: apiAuthenticationLayer,
  layer: registrationLayer.pipe(Layer.provideMerge(registrationWorkflowLayer)),
});

export const registrationHttpHandler = registrationHttp.handler;
