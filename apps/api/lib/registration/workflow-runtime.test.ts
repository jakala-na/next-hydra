import {
  RegistrationWorkflow,
  RegistrationWorkflowInvitationResumeOutcomeUnknown,
  RegistrationWorkflowStartUnavailable,
} from "@repo/registration";
import {
  AuthUserId,
  Email,
  InvitationId,
  PersonName,
  RegistrationId,
} from "@repo/registration/domain/identity";
import type { RegistrationInvitationEvent } from "@repo/registration/services/registration-workflow";
import { Cause, Effect, ManagedRuntime } from "effect";
import { describe, expect, test } from "vitest";
import { HookNotFoundError, WorkflowRuntimeError } from "workflow/errors";

import {
  isRegistrationWorkflowHookPayloadValidationError,
  RegistrationWorkflowHookPayloadValidationError,
} from "./workflow-hook-validation";
import { registrationWorkflowLayerFrom } from "./workflow-runtime-api";
import type { RegistrationWorkflowAdapters } from "./workflow-runtime-api";

const invitationId = InvitationId.make("inv_123");
const registrationId = RegistrationId.make("reg_123");
const invitationEvent = {
  acceptedIdentity: {
    authUserId: AuthUserId.make("user_123"),
    email: Email.make("ada@example.com"),
    firstName: PersonName.make("Ada"),
    lastName: PersonName.make("Lovelace"),
  },
  event: "accepted" as const,
} satisfies RegistrationInvitationEvent;

const makeHarness = (overrides: Partial<RegistrationWorkflowAdapters> = {}) => {
  // SAFETY: resumeInvitation call log entries always pair a string invitation id with the event under test.
  const resumeInvitationCalls = [] as {
    event: RegistrationInvitationEvent;
    invitationId: string;
  }[];
  // SAFETY: start call log entries always record RegistrationId values passed to the adapter.
  const startCalls = [] as RegistrationId[];

  const adapters: RegistrationWorkflowAdapters = {
    isHookPayloadValidationError:
      isRegistrationWorkflowHookPayloadValidationError,
    resumeApproval: async () => {
      await Promise.resolve();
    },
    resumeInvitation: async (id, event) => {
      resumeInvitationCalls.push({ event, invitationId: id });
      await Promise.resolve();
    },
    start: async (id) => {
      startCalls.push(id);
      await Promise.resolve();
      return { runId: "run_1" };
    },
    ...overrides,
  };

  const runtime = ManagedRuntime.make(registrationWorkflowLayerFrom(adapters));

  return {
    calls: {
      resumeInvitation: resumeInvitationCalls,
      start: startCalls,
    },
    resumeInvitation: async () => {
      await runtime.runPromise(
        RegistrationWorkflow.pipe(
          Effect.flatMap((workflow) =>
            workflow.resumeInvitation(invitationId, invitationEvent)
          )
        )
      );
    },
    resumeInvitationEffect: () =>
      RegistrationWorkflow.pipe(
        Effect.flatMap((workflow) =>
          workflow.resumeInvitation(invitationId, invitationEvent)
        ),
        Effect.provide(registrationWorkflowLayerFrom(adapters))
      ),
    startEffect: () =>
      RegistrationWorkflow.pipe(
        Effect.flatMap((workflow) => workflow.start(registrationId)),
        Effect.provide(registrationWorkflowLayerFrom(adapters))
      ),
  };
};

describe("registration workflow runtime", () => {
  test("invitation resume delegates to the hook colocated with the workflow", async () => {
    const { calls, resumeInvitation } = makeHarness();

    await resumeInvitation();

    expect(calls.resumeInvitation).toStrictEqual([
      { event: invitationEvent, invitationId: "inv_123" },
    ]);
  });

  test("projects a rejected workflow start to one unavailable failure", async () => {
    const { startEffect } = makeHarness({
      start: async () => {
        await Promise.reject(new Error("Vercel rejected kickoff"));
      },
    });

    const failure = await Effect.runPromise(startEffect().pipe(Effect.flip));

    expect(failure).toBeInstanceOf(RegistrationWorkflowStartUnavailable);
  });

  test("keeps Workflow SDK start failures as defects", async () => {
    const { startEffect } = makeHarness({
      start: async () => {
        await Promise.reject(
          new WorkflowRuntimeError(
            "'start' received an invalid workflow function"
          )
        );
      },
    });

    const exit = await Effect.runPromise(startEffect().pipe(Effect.exit));

    expect(exit._tag === "Failure" && Cause.hasDies(exit.cause)).toBeTruthy();
  });

  test("projects a rejected hook resume to an unknown outcome", async () => {
    const { resumeInvitationEffect } = makeHarness({
      resumeInvitation: async () => {
        await Promise.reject(new Error("Vercel rejected hook resume"));
      },
    });

    const failure = await Effect.runPromise(
      resumeInvitationEffect().pipe(Effect.flip)
    );

    expect(failure).toBeInstanceOf(
      RegistrationWorkflowInvitationResumeOutcomeUnknown
    );
  });

  test("keeps a missing workflow hook as a defect", async () => {
    const { resumeInvitationEffect } = makeHarness({
      resumeInvitation: async () => {
        await Promise.reject(
          new HookNotFoundError("registration-invitation:missing")
        );
      },
    });

    const exit = await Effect.runPromise(
      resumeInvitationEffect().pipe(Effect.exit)
    );

    expect(exit._tag === "Failure" && Cause.hasDies(exit.cause)).toBeTruthy();
  });

  test("keeps hook payload validation issues on the defect", async () => {
    const issues = [
      {
        message: "Expected a string, actual 123",
        path: ["acceptedIdentity", "email"],
      },
    ];
    const validationFailure =
      new RegistrationWorkflowHookPayloadValidationError({
        hook: "invitation",
        issues,
        message: "Registration invitation hook payload failed validation",
      });
    const { resumeInvitationEffect } = makeHarness({
      resumeInvitation: async () => {
        await Promise.reject(validationFailure);
      },
    });

    const exit = await Effect.runPromise(
      resumeInvitationEffect().pipe(Effect.exit)
    );

    expect(validationFailure.issues).toStrictEqual(issues);
    expect(exit._tag === "Failure" && Cause.hasDies(exit.cause)).toBeTruthy();
  });
});
