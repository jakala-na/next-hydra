import {
  acceptRegistrationInvitation,
  approveRegistration,
  getRegistrationApprovalHookToken,
  getRegistrationInvitationHookToken,
  notifyRegistrationApproved,
  notifyRegistrationAwaitingApproval,
  notifyRegistrationRejected,
  RegistrationId,
  rejectRegistration,
} from "@repo/registration-effect";
import {
  AcceptedAuthIdentity,
  AuthUserId,
  Email,
  InvitationId,
  PersonName,
} from "@repo/registration-effect/domain/identity";
import {
  type RegistrationDetailResponse,
  RegistrationReviewerInput,
  toRegistrationDetailResponse,
  toReviewerActor,
} from "@repo/registration-effect/http/registration-api";
import { Effect, Redacted } from "effect";
import { createHook } from "workflow";
import { registrationEffectLayer } from "@/lib/registration/runtime";
import type {
  RegistrationInvitationEvent,
  RegistrationWorkflowDecision,
  RegistrationWorkflowInput,
} from "@/lib/registration-workflow-contract";

const toPlainRegistrationDetailResponse = (
  registration: RegistrationDetailResponse
) => ({
  registrationId: String(registration.registrationId),
  status: registration.status,
  companyName: registration.companyName,
  companyPhone: registration.companyPhone,
  vatId: registration.vatId,
  contactFirstName: registration.contactFirstName,
  contactLastName: registration.contactLastName,
  email: registration.email,
  address: { ...registration.address },
  ...(registration.invitationId
    ? { invitationId: String(registration.invitationId) }
    : {}),
  createdAt: registration.createdAt,
  updatedAt: registration.updatedAt,
  ...(registration.approvedAt ? { approvedAt: registration.approvedAt } : {}),
  ...(registration.rejectedAt ? { rejectedAt: registration.rejectedAt } : {}),
  ...(registration.approvalReason
    ? { approvalReason: registration.approvalReason }
    : {}),
  ...(registration.actorEmail ? { actorEmail: registration.actorEmail } : {}),
  ...(registration.actorName ? { actorName: registration.actorName } : {}),
});

const toAcceptedAuthIdentity = (
  event: Extract<RegistrationInvitationEvent, { readonly event: "accepted" }>,
  fallback: {
    readonly firstName: string;
    readonly lastName: string;
  }
) =>
  new AcceptedAuthIdentity({
    authUserId: AuthUserId.make(event.acceptedIdentity.authUserId),
    email: Redacted.make(Email.make(event.acceptedIdentity.email), {
      label: "email",
    }),
    firstName: Redacted.make(
      PersonName.make(event.acceptedIdentity.firstName ?? fallback.firstName),
      {
        label: "personName",
      }
    ),
    lastName: Redacted.make(
      PersonName.make(event.acceptedIdentity.lastName ?? fallback.lastName),
      {
        label: "personName",
      }
    ),
  });

const runWorkflowStep = <A, R>(
  effect: Effect.Effect<A, unknown, R>,
  input: RegistrationWorkflowInput,
  step: string,
  annotations: Record<string, string> = {}
) => {
  const runnable = effect.pipe(
    Effect.annotateLogs({
      operation: `registration.workflow.${step}`,
      "registration.id": input.registrationId,
      service: "registration-workflow",
      "workflow.name": "registerCompanyWorkflow",
      "workflow.step": step,
      ...annotations,
    }),
    Effect.annotateSpans({
      "registration.id": input.registrationId,
      "registration.operation": step,
      "workflow.name": "registerCompanyWorkflow",
      "workflow.step": step,
      ...Object.fromEntries(
        Object.entries(annotations).map(([key, value]) => [
          `registration.${key}`,
          value,
        ])
      ),
    }),
    Effect.withSpan(`registration.workflow.${step}`),
    Effect.provide(registrationEffectLayer)
  ) as Effect.Effect<A, unknown, never>;

  return Effect.runPromise(runnable);
};

async function approveRegistrationStep(
  input: RegistrationWorkflowInput,
  decision: RegistrationWorkflowDecision
) {
  "use step";

  const registration = await runWorkflowStep(
    approveRegistration({
      registrationId: RegistrationId.make(input.registrationId),
      actor: toReviewerActor(new RegistrationReviewerInput(decision.reviewer)),
      ...(decision.reason === undefined ? {} : { reason: decision.reason }),
    }),
    input,
    "approve",
    { decision: decision.decision }
  );

  return toPlainRegistrationDetailResponse(
    toRegistrationDetailResponse(registration)
  );
}

async function notifyAwaitingApprovalStep(input: RegistrationWorkflowInput) {
  "use step";

  await runWorkflowStep(
    notifyRegistrationAwaitingApproval({
      registrationId: RegistrationId.make(input.registrationId),
    }),
    input,
    "notify-awaiting-approval"
  );
}

async function notifyApprovedStep(input: RegistrationWorkflowInput) {
  "use step";

  await runWorkflowStep(
    notifyRegistrationApproved({
      registrationId: RegistrationId.make(input.registrationId),
    }),
    input,
    "notify-approved"
  );
}

async function acceptInvitationStep(
  input: RegistrationWorkflowInput,
  invitationId: string,
  event: Extract<RegistrationInvitationEvent, { readonly event: "accepted" }>,
  fallback: {
    readonly firstName: string;
    readonly lastName: string;
  }
) {
  "use step";

  const registration = await runWorkflowStep(
    acceptRegistrationInvitation({
      registrationId: RegistrationId.make(input.registrationId),
      invitationId: InvitationId.make(invitationId),
      acceptedIdentity: toAcceptedAuthIdentity(event, fallback),
    }),
    input,
    "accept-invitation",
    { invitationId }
  );

  return toPlainRegistrationDetailResponse(
    toRegistrationDetailResponse(registration)
  );
}

async function rejectRegistrationStep(
  input: RegistrationWorkflowInput,
  decision: RegistrationWorkflowDecision
) {
  "use step";

  const registration = await runWorkflowStep(
    rejectRegistration({
      registrationId: RegistrationId.make(input.registrationId),
      actor: toReviewerActor(new RegistrationReviewerInput(decision.reviewer)),
      ...(decision.reason === undefined ? {} : { reason: decision.reason }),
    }),
    input,
    "reject",
    { decision: decision.decision }
  );

  return toPlainRegistrationDetailResponse(
    toRegistrationDetailResponse(registration)
  );
}

async function notifyRejectedStep(input: RegistrationWorkflowInput) {
  "use step";

  await runWorkflowStep(
    notifyRegistrationRejected({
      registrationId: RegistrationId.make(input.registrationId),
    }),
    input,
    "notify-rejected"
  );
}

export async function registerCompanyWorkflow(
  input: RegistrationWorkflowInput
) {
  "use workflow";

  await notifyAwaitingApprovalStep(input);

  const decision = await createHook<RegistrationWorkflowDecision>({
    token: getRegistrationApprovalHookToken(input.registrationId),
  });

  if (decision.decision === "approved") {
    const registration = await approveRegistrationStep(input, decision);
    await notifyApprovedStep(input);
    const invitationId = registration.invitationId;
    if (!invitationId) {
      throw new Error("Approved registration is missing an invitation id");
    }

    const invitationEvent = await createHook<RegistrationInvitationEvent>({
      token: getRegistrationInvitationHookToken(invitationId),
    });

    if (invitationEvent.event === "accepted") {
      return await acceptInvitationStep(input, invitationId, invitationEvent, {
        firstName: registration.contactFirstName,
        lastName: registration.contactLastName,
      });
    }

    return registration;
  }

  const registration = await rejectRegistrationStep(input, decision);
  await notifyRejectedStep(input);
  return registration;
}
