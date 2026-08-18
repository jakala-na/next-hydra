import {
  RegistrationWorkflow,
  RegistrationWorkflowInvitationResumeOutcomeUnknown,
  RegistrationWorkflowResumeOutcomeUnknown,
  RegistrationWorkflowStartUnavailable,
} from "@repo/registration";
import type {
  InvitationId,
  RegistrationId,
} from "@repo/registration/domain/identity";
import type {
  RegistrationInvitationEvent,
  RegistrationReviewWorkflowDecision,
} from "@repo/registration/services/registration-workflow";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import { start } from "workflow/api";
import { HookNotFoundError, WorkflowRuntimeError } from "workflow/errors";

import {
  isRegistrationWorkflowHookPayloadValidationError,
  registerCompanyWorkflow,
  resumeRegistrationApprovalHook,
  resumeRegistrationInvitationHook,
} from "@/workflows/register-company";

class RegistrationWorkflowRejection extends Schema.TaggedErrorClass<RegistrationWorkflowRejection>()(
  "RegistrationWorkflowRejection",
  {
    cause: Schema.Defect,
  }
) {}

const projectWorkflowRejection =
  <ProjectedFailure>(
    isDefect: (cause: unknown) => boolean,
    projectFailure: (cause: unknown) => ProjectedFailure
  ) =>
  <A, Failure extends RegistrationWorkflowRejection>(
    program: Effect.Effect<A, Failure>
  ): Effect.Effect<A, ProjectedFailure> =>
    program.pipe(
      // oxlint-disable-next-line promise/prefer-await-to-callbacks promise/prefer-await-to-then -- Effect.catch handles the typed Effect error channel.
      Effect.catch(
        // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Effect.catch handles the typed Effect error channel.
        (error): Effect.Effect<never, ProjectedFailure> =>
          isDefect(error.cause)
            ? Effect.die(error.cause)
            : Effect.fail(projectFailure(error.cause))
      )
    );

/** SDK runtime errors are developer or build defects. Every other rejected
 * kickoff is an availability failure; the intake program compensates the
 * discardable Registration before exposing it to the caller. */
const withRegistrationWorkflowStartFailure =
  <Unavailable>(unavailable: (cause: unknown) => Unavailable) =>
  <A, Failure extends RegistrationWorkflowRejection>(
    program: Effect.Effect<A, Failure>
  ) =>
    program.pipe(
      projectWorkflowRejection(
        (cause) => WorkflowRuntimeError.is(cause),
        unavailable
      )
    );

const withRegistrationWorkflowResumeOutcome =
  <OutcomeUnknown>(outcomeUnknown: (cause: unknown) => OutcomeUnknown) =>
  <A, Failure extends RegistrationWorkflowRejection>(
    program: Effect.Effect<A, Failure>
  ) =>
    program.pipe(
      projectWorkflowRejection(
        (cause) =>
          WorkflowRuntimeError.is(cause) ||
          HookNotFoundError.is(cause) ||
          isRegistrationWorkflowHookPayloadValidationError(cause),
        outcomeUnknown
      )
    );

const workflowFailureAnnotations = (cause: unknown) =>
  isRegistrationWorkflowHookPayloadValidationError(cause)
    ? {
        "workflow.validation.hook": cause.hook,
        "workflow.validation.issues": cause.issues,
      }
    : {};

const logWorkflowFailure =
  (operation: "resumeInvitation" | "resumeReview" | "start") =>
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
            ...workflowFailureAnnotations(failure.cause),
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

const resumeRegistrationReview = (
  registrationId: RegistrationId,
  decision: RegistrationReviewWorkflowDecision
) =>
  Effect.tryPromise({
    catch: (cause) => new RegistrationWorkflowRejection({ cause }),
    try: async () => {
      await resumeRegistrationApprovalHook(String(registrationId), decision);
    },
  }).pipe(
    logWorkflowFailure("resumeReview"),
    withRegistrationWorkflowResumeOutcome(
      (cause) =>
        new RegistrationWorkflowResumeOutcomeUnknown({
          cause,
          message: "Registration workflow resume outcome is unknown",
          registrationId,
        })
    )
  );

const resumeRegistrationInvitationWorkflow = (
  invitationId: InvitationId,
  event: RegistrationInvitationEvent
) =>
  Effect.tryPromise({
    catch: (cause) => new RegistrationWorkflowRejection({ cause }),
    try: async () => {
      await resumeRegistrationInvitationHook(String(invitationId), event);
    },
  }).pipe(
    logWorkflowFailure("resumeInvitation"),
    withRegistrationWorkflowResumeOutcome(
      (cause) =>
        new RegistrationWorkflowInvitationResumeOutcomeUnknown({
          cause,
          invitationId,
          message: "Registration invitation resume outcome is unknown",
        })
    )
  );

export const registrationWorkflowLayer = Layer.succeed(
  RegistrationWorkflow,
  RegistrationWorkflow.of({
    resumeInvitation: resumeRegistrationInvitationWorkflow,
    resumeReview: resumeRegistrationReview,
    start: startRegistrationWorkflow,
  })
);

const registrationWorkflowRuntime = ManagedRuntime.make(
  registrationWorkflowLayer
);

export const resumeRegistrationInvitation = async (input: {
  readonly event: RegistrationInvitationEvent;
  readonly invitationId: InvitationId;
}): Promise<void> => {
  await registrationWorkflowRuntime.runPromise(
    RegistrationWorkflow.pipe(
      Effect.flatMap((workflow) =>
        workflow.resumeInvitation(input.invitationId, input.event)
      )
    )
  );
};
