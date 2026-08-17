import { Cause, Effect } from "effect";
import { describe, expect, it } from "vitest";
import { HookNotFoundError, WorkflowRuntimeError } from "workflow/errors";

import {
  withRegistrationWorkflowResumeOutcome,
  withRegistrationWorkflowStartFailure,
} from "./workflow-failure";

const SINGLE_ATTEMPT = 1;

describe("registration workflow failure projection", () => {
  it("projects any Vercel start rejection to one unavailable failure", async () => {
    await Effect.runPromise(
      Effect.gen(function* projectsStartRejection() {
        let attempts = 0;
        const result = yield* Effect.suspend(() => {
          attempts += SINGLE_ATTEMPT;
          return Effect.fail({ cause: new Error("Vercel rejected kickoff") });
        }).pipe(
          withRegistrationWorkflowStartFailure(() => "unavailable" as const),
          Effect.flip
        );

        expect(result).toBe("unavailable");
        expect(attempts).toBe(SINGLE_ATTEMPT);
      })
    );
  });

  it("keeps Workflow SDK misuse and runtime failures as defects", async () => {
    await Effect.runPromise(
      Effect.gen(function* keepsStartDefects() {
        const exit = yield* Effect.fail({
          cause: new WorkflowRuntimeError(
            "'start' received an invalid workflow function"
          ),
        }).pipe(
          withRegistrationWorkflowStartFailure(() => "unavailable" as const),
          Effect.exit
        );

        expect(exit._tag).toBe("Failure");
        if (exit._tag === "Failure") {
          expect(Cause.hasDies(exit.cause)).toBeTruthy();
        }
      })
    );
  });

  it("projects a Vercel resume rejection to one unknown outcome", async () => {
    await Effect.runPromise(
      Effect.gen(function* projectsResumeRejection() {
        const result = yield* Effect.fail({
          cause: new Error("Vercel rejected hook resume"),
        }).pipe(
          withRegistrationWorkflowResumeOutcome(
            () => "outcomeUnknown" as const
          ),
          Effect.flip
        );

        expect(result).toBe("outcomeUnknown");
      })
    );
  });

  it("keeps a missing workflow hook as a defect", async () => {
    await Effect.runPromise(
      Effect.gen(function* keepsResumeDefects() {
        const exit = yield* Effect.fail({
          cause: new HookNotFoundError("registration:approval:missing"),
        }).pipe(
          withRegistrationWorkflowResumeOutcome(
            () => "outcomeUnknown" as const
          ),
          Effect.exit
        );

        expect(exit._tag).toBe("Failure");
        if (exit._tag === "Failure") {
          expect(Cause.hasDies(exit.cause)).toBeTruthy();
        }
      })
    );
  });
});
