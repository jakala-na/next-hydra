import {
  acceptRegistrationInvitation,
  approveRegistration,
  expireRegistrationInvitation,
  InvitationDeliveries,
  InvitationExpired,
  notifyRegistrationApproved,
  notifyRegistrationAwaitingApproval,
  notifyRegistrationInvitationExpired,
  notifyRegistrationRejected,
  recordRegistrationInvitationRevoked,
  RegistrationInvitationEvent,
  RegistrationId,
  RegistrationReviewWorkflowDecision,
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
import { registrationReviewerActorFromWorkflow } from "@repo/registration/programs/registration-review";
import { Effect, Redacted, Schema } from "effect";
import { defineHook, sleep } from "workflow";

import { registrationLayer } from "@/lib/registration/runtime";

type RegistrationWorkflowInput = {
  readonly registrationId: string;
};

const RegistrationWorkflowHookName = Schema.Literals([
  "approval",
  "invitation",
]);
type RegistrationWorkflowHookName = typeof RegistrationWorkflowHookName.Type;

class RegistrationWorkflowHookPayloadValidationError extends Schema.TaggedError<RegistrationWorkflowHookPayloadValidationError>()(
  "RegistrationWorkflowHookPayloadValidationError",
  {
    hook: RegistrationWorkflowHookName,
    issues: Schema.Array(Schema.Unknown),
    message: Schema.String,
  }
) {}

export const isRegistrationWorkflowHookPayloadValidationError = Schema.is(
  RegistrationWorkflowHookPayloadValidationError
);

const approvalSchema = Schema.toStandardSchemaV1(
  RegistrationReviewWorkflowDecision
);
const invitationSchema = Schema.toStandardSchemaV1(RegistrationInvitationEvent);

const registrationApprovalHook = defineHook({ schema: approvalSchema });
const registrationInvitationHook = defineHook({ schema: invitationSchema });

const approvalToken = (registrationId: string) =>
  `registration-approval:${registrationId}`;
const invitationToken = (invitationId: string) =>
  `registration-invitation:${invitationId}`;

const validateHookPayload = async <Output>(
  hook: RegistrationWorkflowHookName,
  validation:
    | { readonly value: Output }
    | { readonly issues: readonly unknown[] }
    | PromiseLike<
        { readonly value: Output } | { readonly issues: readonly unknown[] }
      >
) => {
  const result = await validation;
  if ("issues" in result) {
    throw new RegistrationWorkflowHookPayloadValidationError({
      hook,
      issues: [...result.issues],
      message: `Registration ${hook} hook payload failed validation`,
    });
  }
};

const createRegistrationApprovalHook = (registrationId: string) =>
  registrationApprovalHook.create({ token: approvalToken(registrationId) });

export const resumeRegistrationApprovalHook = async (
  registrationId: string,
  payload: RegistrationReviewWorkflowDecision
): Promise<void> => {
  await validateHookPayload(
    "approval",
    approvalSchema["~standard"].validate(payload)
  );
  await registrationApprovalHook.resume(approvalToken(registrationId), payload);
};

const createRegistrationInvitationHook = (invitationId: string) =>
  registrationInvitationHook.create({ token: invitationToken(invitationId) });

export const resumeRegistrationInvitationHook = async (
  invitationId: string,
  payload: RegistrationInvitationEvent
): Promise<void> => {
  await validateHookPayload(
    "invitation",
    invitationSchema["~standard"].validate(payload)
  );
  await registrationInvitationHook.resume(
    invitationToken(invitationId),
    payload
  );
};

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

async function readInvitationDeliveryStep(
  input: RegistrationWorkflowInput,
  invitationId: string
) {
  "use step";

  const invitation = await runWorkflowStep(
    InvitationDeliveries.pipe(
      Effect.flatMap((deliveries) =>
        deliveries.get(InvitationId.make(invitationId))
      )
    ),
    input,
    "read-invitation-delivery",
    { invitationId }
  );

  return {
    expiresAt: invitation.expiresAt.toISOString(),
    status: invitation.status,
  };
}

async function notifyInvitationExpiredStep(
  input: RegistrationWorkflowInput,
  invitationId: string
) {
  "use step";

  await runWorkflowStep(
    notifyRegistrationInvitationExpired({
      registrationId: RegistrationId.make(input.registrationId),
    }),
    input,
    "notify-invitation-expired",
    { invitationId }
  );
}

async function expireInvitationStep(
  input: RegistrationWorkflowInput,
  invitationId: string
) {
  "use step";

  await runWorkflowStep(
    expireRegistrationInvitation({
      invitationId: InvitationId.make(invitationId),
      registrationId: RegistrationId.make(input.registrationId),
    }),
    input,
    "expire-invitation",
    { invitationId }
  );
}

async function recordInvitationRevokedStep(
  input: RegistrationWorkflowInput,
  invitationId: string
) {
  "use step";

  const registration = await runWorkflowStep(
    recordRegistrationInvitationRevoked({
      invitationId: InvitationId.make(invitationId),
      registrationId: RegistrationId.make(input.registrationId),
    }),
    input,
    "record-invitation-revoked",
    { invitationId }
  );

  return toPlainRegistrationDetailResponse(
    toRegistrationDetailResponse(registration)
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

  const decision = await createRegistrationApprovalHook(input.registrationId);

  if (decision.decision === "approved") {
    const registration = await approveRegistrationStep(input, decision);
    await notifyApprovedStep(input);
    const { invitationId } = registration;
    if (!invitationId) {
      return registration;
    }

    const invitationHook = createRegistrationInvitationHook(invitationId);

    try {
      const initialDelivery = await readInvitationDeliveryStep(
        input,
        invitationId
      );

      if (initialDelivery.status === "accepted") {
        const event = await invitationHook;
        if (event.event === "accepted") {
          return await acceptInvitationStep(input, invitationId, event, {
            firstName: registration.contactFirstName,
            lastName: registration.contactLastName,
          });
        }

        return registration;
      }

      if (initialDelivery.status === "revoked") {
        return await recordInvitationRevokedStep(input, invitationId);
      }

      const outcome = await Promise.race([
        invitationHook.then((event) => ({ event, outcome: "event" as const })),
        sleep(new Date(initialDelivery.expiresAt)).then(() => ({
          outcome: "deadline" as const,
        })),
      ]);

      if (outcome.outcome === "event") {
        if (outcome.event.event === "accepted") {
          return await acceptInvitationStep(
            input,
            invitationId,
            outcome.event,
            {
              firstName: registration.contactFirstName,
              lastName: registration.contactLastName,
            }
          );
        }

        return await recordInvitationRevokedStep(input, invitationId);
      }

      const currentDelivery = await readInvitationDeliveryStep(
        input,
        invitationId
      );

      if (currentDelivery.status === "accepted") {
        const event = await invitationHook;
        if (event.event === "accepted") {
          return await acceptInvitationStep(input, invitationId, event, {
            firstName: registration.contactFirstName,
            lastName: registration.contactLastName,
          });
        }

        return registration;
      }

      if (currentDelivery.status === "revoked") {
        return await recordInvitationRevokedStep(input, invitationId);
      }

      await expireInvitationStep(input, invitationId);
      await notifyInvitationExpiredStep(input, invitationId);
      throw new InvitationExpired({
        expiredAt: new Date(initialDelivery.expiresAt),
        invitationId: InvitationId.make(invitationId),
        message: `Registration invitation ${invitationId} expired before acceptance`,
      });
    } finally {
      invitationHook.dispose();
    }
  }

  const registration = await rejectRegistrationStep(input, decision);
  await notifyRejectedStep(input);
  return registration;
}
