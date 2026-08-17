import { makeActionResultSchema } from "@repo/actions";
import { Redacted, Schema } from "effect";

import type { RegistrationReviewerActor } from "../../domain/actors";
import { RegistrationId } from "../../domain/identity";
import type {
  ApprovedRegistration,
  RegistrationStatus as DomainRegistrationStatus,
  Registration,
} from "../../domain/registration";
import { RegistrationDecisionPublicError } from "../../public-errors";
import { REGISTRATION_FIELD_LIMITS } from "../registration-form-schema";

export type RegistrationDetailStatus =
  | DomainRegistrationStatus
  | "approval_processing";

export type RegistrationDetailView = {
  readonly registrationId: string;
  readonly status: RegistrationDetailStatus;
  readonly companyName: string;
  readonly companyPhone: string;
  readonly vatId: string;
  readonly contactFirstName: string;
  readonly contactLastName: string;
  readonly email: string;
  readonly address: {
    readonly streetName: string;
    readonly additionalStreetInfo: string;
    readonly postalCode: string;
    readonly city: string;
    readonly region: string;
    readonly country: string;
  };
  readonly invitationId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly approvedAt?: string;
  readonly rejectedAt?: string;
  readonly approvalReason?: string;
  readonly actorEmail?: string;
  readonly actorName?: string;
};

export const registrationStatusLabels: Record<
  RegistrationDetailStatus,
  string
> = {
  awaiting_approval: "Awaiting approval",
  approval_processing: "Approval processing",
  approved: "Approved",
  rejected: "Rejected",
};

export const registrationStatusFilters = [
  "awaiting_approval",
  "approved",
  "rejected",
] as const satisfies readonly RegistrationDetailStatus[];

export const DecisionFormSchema = Schema.Struct({
  reason: Schema.Trim.pipe(
    Schema.check(
      Schema.isMaxLength(REGISTRATION_FIELD_LIMITS.approvalReason, {
        message: `Keep the reason under ${REGISTRATION_FIELD_LIMITS.approvalReason} characters.`,
      })
    )
  ),
});

export type DecisionFormValues = typeof DecisionFormSchema.Type;

const RegistrationDecisionInput = Schema.Struct({
  reason: Schema.optional(DecisionFormSchema.fields.reason),
  registrationId: RegistrationId,
});

export const ApproveRegistrationInputSchema = RegistrationDecisionInput;
export type ApproveRegistrationInput =
  typeof ApproveRegistrationInputSchema.Encoded;
export const RejectRegistrationInputSchema = RegistrationDecisionInput;
export type RejectRegistrationInput =
  typeof RejectRegistrationInputSchema.Encoded;

export const RegistrationDecisionSuccess = Schema.Struct({
  registrationId: RegistrationId,
  registrationStatus: Schema.Literal("approval_processing"),
});

export const RegistrationDecisionActionError = RegistrationDecisionPublicError;
export type RegistrationDecisionActionError =
  typeof RegistrationDecisionActionError.Type;

export const RegistrationDecisionResult = makeActionResultSchema(
  RegistrationDecisionSuccess,
  RegistrationDecisionActionError
);
export type RegistrationDecisionResult =
  typeof RegistrationDecisionResult.Encoded;
export type RegistrationDecisionActionFailure = Extract<
  RegistrationDecisionResult,
  { readonly _tag: "Failure" }
>["failure"];

const reviewerEmail = (actor: RegistrationReviewerActor) =>
  String(Redacted.value(actor.email));

const decisionFields = (
  registration:
    | ApprovedRegistration
    | Extract<Registration, { status: "rejected" }>
) => {
  const decision = registration.decision;
  const decidedAt = decision.decidedAt.toISOString();

  return {
    actorEmail: reviewerEmail(decision.actor),
    actorName: decision.actor.name,
    ...(decision.reason ? { approvalReason: decision.reason } : {}),
    ...(decision.decision === "approved"
      ? { approvedAt: decidedAt }
      : { rejectedAt: decidedAt }),
  };
};

export const toRegistrationDetailView = (
  registration: Registration
): RegistrationDetailView => {
  const details = registration.details;

  return {
    registrationId: String(registration.id),
    status: registration.status,
    companyName: String(details.companyName),
    companyPhone: details.companyPhone
      ? Redacted.value(details.companyPhone)
      : "",
    vatId: details.vatId ? Redacted.value(details.vatId) : "",
    contactFirstName: Redacted.value(details.contactFirstName),
    contactLastName: Redacted.value(details.contactLastName),
    email: Redacted.value(details.email),
    address: {
      streetName: Redacted.value(details.address.streetName),
      additionalStreetInfo: details.address.additionalStreetInfo
        ? Redacted.value(details.address.additionalStreetInfo)
        : "",
      postalCode: Redacted.value(details.address.postalCode),
      city: Redacted.value(details.address.city),
      region: details.address.region
        ? Redacted.value(details.address.region)
        : "",
      country: String(details.address.country),
    },
    ...(registration._tag === "ApprovedRegistration"
      ? {
          invitationId: String(registration.invitationId),
          ...decisionFields(registration),
        }
      : {}),
    ...(registration._tag === "RejectedRegistration"
      ? decisionFields(registration)
      : {}),
    createdAt: registration.createdAt.toISOString(),
    updatedAt: registration.updatedAt.toISOString(),
  };
};

export const canDecideRegistration = (status: RegistrationDetailStatus) =>
  status === "awaiting_approval";

export const getRegistrationDecisionUnavailableMessage = (
  status: RegistrationDetailStatus
) => {
  switch (status) {
    case "approval_processing":
      return "This registration decision is already being processed.";
    case "approved":
    case "rejected":
      return "This registration is finalized and cannot be updated from the dashboard.";
    case "awaiting_approval":
      return undefined;
    default:
      return status satisfies never;
  }
};
