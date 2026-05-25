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
import { Registrations } from "@repo/registration-effect/services/registrations";
import { Effect, Redacted } from "effect";
import { createHook } from "workflow";
import { registrationEffectLayer } from "@/lib/registration-effect-runtime";
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

async function approveRegistrationStep(
  input: RegistrationWorkflowInput,
  decision: RegistrationWorkflowDecision
) {
  "use step";

  const registration = await Effect.runPromise(
    approveRegistration({
      registrationId: RegistrationId.make(input.registrationId),
      actor: toReviewerActor(new RegistrationReviewerInput(decision.reviewer)),
      ...(decision.reason === undefined ? {} : { reason: decision.reason }),
    }).pipe(Effect.provide(registrationEffectLayer))
  );

  return toPlainRegistrationDetailResponse(
    toRegistrationDetailResponse(registration)
  );
}

async function notifyAwaitingApprovalStep(input: RegistrationWorkflowInput) {
  "use step";

  await Effect.runPromise(
    notifyRegistrationAwaitingApproval({
      registrationId: RegistrationId.make(input.registrationId),
    }).pipe(Effect.provide(registrationEffectLayer))
  );
}

async function notifyApprovedStep(input: RegistrationWorkflowInput) {
  "use step";

  await Effect.runPromise(
    notifyRegistrationApproved({
      registrationId: RegistrationId.make(input.registrationId),
    }).pipe(Effect.provide(registrationEffectLayer))
  );
}

async function acceptInvitationStep(
  invitationId: string,
  event: Extract<RegistrationInvitationEvent, { readonly event: "accepted" }>
) {
  "use step";

  const registration = await Effect.runPromise(
    Effect.gen(function* () {
      const invitationIdValue = InvitationId.make(invitationId);
      const registrations = yield* Registrations;
      const approved =
        yield* registrations.findByInvitationId(invitationIdValue);

      return yield* acceptRegistrationInvitation({
        invitationId: invitationIdValue,
        acceptedIdentity: toAcceptedAuthIdentity(event, {
          firstName: Redacted.value(approved.details.contactFirstName),
          lastName: Redacted.value(approved.details.contactLastName),
        }),
      });
    }).pipe(Effect.provide(registrationEffectLayer))
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

  const registration = await Effect.runPromise(
    rejectRegistration({
      registrationId: RegistrationId.make(input.registrationId),
      actor: toReviewerActor(new RegistrationReviewerInput(decision.reviewer)),
      ...(decision.reason === undefined ? {} : { reason: decision.reason }),
    }).pipe(Effect.provide(registrationEffectLayer))
  );

  return toPlainRegistrationDetailResponse(
    toRegistrationDetailResponse(registration)
  );
}

async function notifyRejectedStep(input: RegistrationWorkflowInput) {
  "use step";

  await Effect.runPromise(
    notifyRegistrationRejected({
      registrationId: RegistrationId.make(input.registrationId),
    }).pipe(Effect.provide(registrationEffectLayer))
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
      return await acceptInvitationStep(invitationId, invitationEvent);
    }

    return registration;
  }

  const registration = await rejectRegistrationStep(input, decision);
  await notifyRejectedStep(input);
  return registration;
}
