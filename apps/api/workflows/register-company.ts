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
} from "@repo/registration";
import {
  AcceptedAuthIdentity,
  AuthUserId,
  Email,
  InvitationId,
  PersonName,
} from "@repo/registration/domain/identity";
import { toRegistrationDetailResponse } from "@repo/registration/http/registration-api";
import type { RegistrationDetailResponse } from "@repo/registration/http/registration-api";
import {
  RegistrationReviewWorkflowDecision,
  registrationReviewerActorFromWorkflow,
} from "@repo/registration/programs/registration-review";
import { Effect, Redacted, Schema } from "effect";
import { createHook } from "workflow";

import type {
  RegistrationInvitationEvent,
  RegistrationWorkflowInput,
} from "@/lib/registration-workflow-contract";
import { registrationLayer } from "@/lib/registration/runtime";

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

const runWorkflowStep = async <A, R>(
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
    Effect.provide(registrationLayer)
  ) as Effect.Effect<A, unknown>;

  return await Effect.runPromise(runnable);
};

async function approveRegistrationStep(
  input: RegistrationWorkflowInput,
  decision: RegistrationReviewWorkflowDecision
) {
  "use step";

  const registration = await runWorkflowStep(
    approveRegistration({
      actor: registrationReviewerActorFromWorkflow(decision.reviewer),
      registrationId: RegistrationId.make(input.registrationId),
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
      acceptedIdentity: toAcceptedAuthIdentity(event, fallback),
      invitationId: InvitationId.make(invitationId),
      registrationId: RegistrationId.make(input.registrationId),
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
  decision: RegistrationReviewWorkflowDecision
) {
  "use step";

  const registration = await runWorkflowStep(
    rejectRegistration({
      actor: registrationReviewerActorFromWorkflow(decision.reviewer),
      registrationId: RegistrationId.make(input.registrationId),
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

  const decisionInput = await createHook<unknown>({
    token: getRegistrationApprovalHookToken(input.registrationId),
  });
  const decision = Schema.decodeUnknownSync(RegistrationReviewWorkflowDecision)(
    decisionInput
  );

  if (decision.decision === "approved") {
    const registration = await approveRegistrationStep(input, decision);
    await notifyApprovedStep(input);
    const { invitationId } = registration;
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
