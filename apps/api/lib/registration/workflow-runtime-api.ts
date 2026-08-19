import {
  RegistrationWorkflow,
  RegistrationWorkflowInvitationResumeOutcomeUnknown,
  RegistrationWorkflowResumeOutcomeUnknown,
  RegistrationWorkflowStartUnavailable,
} from "@repo/registration";
import type { RegistrationId } from "@repo/registration/domain/identity";
import type {
  RegistrationInvitationEvent,
  RegistrationReviewWorkflowDecision,
} from "@repo/registration/services/registration-workflow";
import { Effect, Layer, Schema } from "effect";
import { HookNotFoundError, WorkflowRuntimeError } from "workflow/errors";

class RegistrationWorkflowRejection extends Schema.TaggedErrorClass<RegistrationWorkflowRejection>()(
  "RegistrationWorkflowRejection",
  {
    cause: Schema.Defect,
  }
) {}

type HookPayloadValidationFailure = {
  readonly hook: unknown;
  readonly issues: readonly unknown[];
};

export type RegistrationWorkflowAdapters = {
  readonly isHookPayloadValidationError: (
    cause: unknown
  ) => cause is HookPayloadValidationFailure;
  readonly resumeApproval: (
    registrationId: string,
    decision: RegistrationReviewWorkflowDecision
  ) => Promise<void>;
  readonly resumeInvitation: (
    invitationId: string,
    event: RegistrationInvitationEvent
  ) => Promise<void>;
  readonly start: (
    registrationId: RegistrationId
  ) => Promise<{ readonly runId: string }>;
};

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
  <OutcomeUnknown>(
    isHookPayloadValidationError: (
      cause: unknown
    ) => cause is HookPayloadValidationFailure,
    outcomeUnknown: (cause: unknown) => OutcomeUnknown
  ) =>
  <A, Failure extends RegistrationWorkflowRejection>(
    program: Effect.Effect<A, Failure>
  ) =>
    program.pipe(
      projectWorkflowRejection(
        (cause) =>
          WorkflowRuntimeError.is(cause) ||
          HookNotFoundError.is(cause) ||
          isHookPayloadValidationError(cause),
        outcomeUnknown
      )
    );

const workflowFailureAnnotations = (
  isHookPayloadValidationError: (
    cause: unknown
  ) => cause is HookPayloadValidationFailure,
  cause: unknown
) => {
  if (!isHookPayloadValidationError(cause)) {
    return {};
  }

  return {
    "workflow.validation.hook": cause.hook,
    "workflow.validation.issues": cause.issues,
  };
};

const logWorkflowFailure =
  (
    isHookPayloadValidationError: (
      cause: unknown
    ) => cause is HookPayloadValidationFailure,
    operation: "resumeInvitation" | "resumeReview" | "start"
  ) =>
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
            ...workflowFailureAnnotations(
              isHookPayloadValidationError,
              failure.cause
            ),
          })
        )
      )
    );

export const registrationWorkflowLayerFrom = (
  adapters: RegistrationWorkflowAdapters
): Layer.Layer<RegistrationWorkflow> =>
  Layer.succeed(
    RegistrationWorkflow,
    RegistrationWorkflow.of({
      resumeInvitation: (invitationId, event) =>
        Effect.tryPromise({
          catch: (cause) => new RegistrationWorkflowRejection({ cause }),
          try: async () => {
            await adapters.resumeInvitation(String(invitationId), event);
          },
        }).pipe(
          logWorkflowFailure(
            adapters.isHookPayloadValidationError,
            "resumeInvitation"
          ),
          withRegistrationWorkflowResumeOutcome(
            adapters.isHookPayloadValidationError,
            (cause) =>
              new RegistrationWorkflowInvitationResumeOutcomeUnknown({
                cause,
                invitationId,
                message: "Registration invitation resume outcome is unknown",
              })
          )
        ),
      resumeReview: (registrationId, decision) =>
        Effect.tryPromise({
          catch: (cause) => new RegistrationWorkflowRejection({ cause }),
          try: async () => {
            await adapters.resumeApproval(String(registrationId), decision);
          },
        }).pipe(
          logWorkflowFailure(
            adapters.isHookPayloadValidationError,
            "resumeReview"
          ),
          withRegistrationWorkflowResumeOutcome(
            adapters.isHookPayloadValidationError,
            (cause) =>
              new RegistrationWorkflowResumeOutcomeUnknown({
                cause,
                message: "Registration workflow resume outcome is unknown",
                registrationId,
              })
          )
        ),
      start: (registrationId) =>
        Effect.tryPromise({
          catch: (cause) => new RegistrationWorkflowRejection({ cause }),
          try: async () => await adapters.start(registrationId),
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
          logWorkflowFailure(adapters.isHookPayloadValidationError, "start"),
          withRegistrationWorkflowStartFailure(
            (cause) =>
              new RegistrationWorkflowStartUnavailable({
                cause,
                message: "Registration workflow could not be started",
                registrationId,
              })
          )
        ),
    })
  );
