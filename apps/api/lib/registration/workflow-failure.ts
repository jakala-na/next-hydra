import { Effect } from "effect";
import { HookNotFoundError, WorkflowRuntimeError } from "workflow/errors";

interface RegistrationWorkflowRejection {
  readonly cause: unknown;
}

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
export const withRegistrationWorkflowStartFailure =
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

export const withRegistrationWorkflowResumeOutcome =
  <OutcomeUnknown>(outcomeUnknown: (cause: unknown) => OutcomeUnknown) =>
  <A, Failure extends RegistrationWorkflowRejection>(
    program: Effect.Effect<A, Failure>
  ) =>
    program.pipe(
      projectWorkflowRejection(
        (cause) =>
          WorkflowRuntimeError.is(cause) || HookNotFoundError.is(cause),
        outcomeUnknown
      )
    );
