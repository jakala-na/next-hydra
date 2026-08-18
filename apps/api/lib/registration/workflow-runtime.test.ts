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
import { Cause, Effect } from "effect";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { HookNotFoundError, WorkflowRuntimeError } from "workflow/errors";

import {
  registrationWorkflowLayer,
  resumeRegistrationInvitation,
} from "./workflow-runtime";

const workflowMocks = vi.hoisted(() => ({
  resumeRegistrationApprovalHook:
    vi.fn<(registrationId: string, decision: unknown) => Promise<void>>(),
  resumeRegistrationInvitationHook:
    vi.fn<
      (
        invitationId: string,
        event: RegistrationInvitationEvent
      ) => Promise<void>
    >(),
  start: vi.fn<(...args: unknown[]) => Promise<{ readonly runId: string }>>(),
}));

vi.mock("workflow/api", () => ({
  start: workflowMocks.start,
}));

vi.mock("@/workflows/register-company", () => ({
  isRegistrationWorkflowHookPayloadValidationError: (cause: unknown) =>
    typeof cause === "object" &&
    cause !== null &&
    "_tag" in cause &&
    cause._tag === "RegistrationWorkflowHookPayloadValidationError",
  registerCompanyWorkflow:
    vi.fn<(input: { readonly registrationId: string }) => Promise<unknown>>(),
  resumeRegistrationApprovalHook: workflowMocks.resumeRegistrationApprovalHook,
  resumeRegistrationInvitationHook:
    workflowMocks.resumeRegistrationInvitationHook,
}));

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
};

const resumeInvitation = () =>
  RegistrationWorkflow.pipe(
    Effect.flatMap((workflow) =>
      workflow.resumeInvitation(invitationId, invitationEvent)
    ),
    Effect.provide(registrationWorkflowLayer)
  );

const startRegistration = () =>
  RegistrationWorkflow.pipe(
    Effect.flatMap((workflow) => workflow.start(registrationId)),
    Effect.provide(registrationWorkflowLayer)
  );

describe("registration workflow runtime", () => {
  beforeEach(() => {
    workflowMocks.resumeRegistrationApprovalHook.mockReset();
    workflowMocks.resumeRegistrationInvitationHook.mockReset();
    workflowMocks.start.mockReset();
  });

  test("invitation resume delegates to the hook colocated with the workflow", async () => {
    workflowMocks.resumeRegistrationInvitationHook.mockResolvedValue();

    await resumeRegistrationInvitation({
      event: invitationEvent,
      invitationId,
    });

    expect(workflowMocks.resumeRegistrationInvitationHook).toHaveBeenCalledWith(
      "inv_123",
      invitationEvent
    );
  });

  test("projects a rejected workflow start to one unavailable failure", async () => {
    workflowMocks.start.mockRejectedValue(new Error("Vercel rejected kickoff"));

    const failure = await Effect.runPromise(
      startRegistration().pipe(Effect.flip)
    );

    expect(failure).toBeInstanceOf(RegistrationWorkflowStartUnavailable);
    expect(workflowMocks.start).toHaveBeenCalledOnce();
  });

  test("keeps Workflow SDK start failures as defects", async () => {
    workflowMocks.start.mockRejectedValue(
      new WorkflowRuntimeError("'start' received an invalid workflow function")
    );

    const exit = await Effect.runPromise(startRegistration().pipe(Effect.exit));

    expect(exit._tag === "Failure" && Cause.hasDies(exit.cause)).toBeTruthy();
  });

  test("projects a rejected hook resume to an unknown outcome", async () => {
    workflowMocks.resumeRegistrationInvitationHook.mockRejectedValue(
      new Error("Vercel rejected hook resume")
    );

    const failure = await Effect.runPromise(
      resumeInvitation().pipe(Effect.flip)
    );

    expect(failure).toBeInstanceOf(
      RegistrationWorkflowInvitationResumeOutcomeUnknown
    );
  });

  test("keeps a missing workflow hook as a defect", async () => {
    workflowMocks.resumeRegistrationInvitationHook.mockRejectedValue(
      new HookNotFoundError("registration-invitation:missing")
    );

    const exit = await Effect.runPromise(resumeInvitation().pipe(Effect.exit));

    expect(exit._tag === "Failure" && Cause.hasDies(exit.cause)).toBeTruthy();
  });

  test("keeps hook payload validation issues on the defect", async () => {
    const issues = [
      {
        message: "Expected a string, actual 123",
        path: ["acceptedIdentity", "email"],
      },
    ];
    const failure = {
      _tag: "RegistrationWorkflowHookPayloadValidationError",
      hook: "invitation",
      issues,
      message: "Registration invitation hook payload failed validation",
    };
    workflowMocks.resumeRegistrationInvitationHook.mockRejectedValue(failure);

    const exit = await Effect.runPromise(resumeInvitation().pipe(Effect.exit));

    expect(failure.issues).toStrictEqual(issues);
    expect(exit._tag === "Failure" && Cause.hasDies(exit.cause)).toBeTruthy();
  });
});
