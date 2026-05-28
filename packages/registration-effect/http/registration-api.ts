import type { CommerceAccountError } from "@repo/commerce/services/commerce-accounts";
import { Redacted, Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
  OpenApi,
} from "effect/unstable/httpapi";
import { RegistrationReviewerActor } from "../domain/actors";
import {
  AddressLine,
  AuthUserId,
  City,
  CompanyName,
  CountryCode,
  Email,
  InvitationId,
  PersonName,
  PhoneNumber,
  PostalCode,
  Region,
  RegistrationId,
  VatId,
} from "../domain/identity";
import {
  CompanyAddress,
  CompanyRegistrationDetails,
  type Registration,
  RegistrationStatus,
} from "../domain/registration";
import type { IdentityUserLookupFailure } from "../services/identity-users";
import type { InvitationIssueError } from "../services/invitations";
import type { RegistrationQueryError } from "../services/registration-queries";
import type {
  RegistrationCreateError,
  RegistrationReadError,
  RegistrationTransitionError,
} from "../services/registrations";

export class RegistrationApiError extends Schema.TaggedErrorClass<RegistrationApiError>()(
  "RegistrationApiError",
  {
    message: Schema.String,
  },
  { httpApiStatus: 500 }
) {}

export class RegistrationApiConflict extends Schema.TaggedErrorClass<RegistrationApiConflict>()(
  "RegistrationApiConflict",
  {
    message: Schema.String,
  },
  { httpApiStatus: 409 }
) {}

export class RegistrationAlreadyApproved extends Schema.TaggedErrorClass<RegistrationAlreadyApproved>()(
  "RegistrationAlreadyApproved",
  {
    message: Schema.String,
  },
  { httpApiStatus: 409 }
) {}

export class RegistrationAlreadyRejected extends Schema.TaggedErrorClass<RegistrationAlreadyRejected>()(
  "RegistrationAlreadyRejected",
  {
    message: Schema.String,
  },
  { httpApiStatus: 409 }
) {}

export class RegistrationDecisionAlreadyProcessing extends Schema.TaggedErrorClass<RegistrationDecisionAlreadyProcessing>()(
  "RegistrationDecisionAlreadyProcessing",
  {
    message: Schema.String,
  },
  { httpApiStatus: 409 }
) {}

export class RegistrationApiNotFound extends Schema.TaggedErrorClass<RegistrationApiNotFound>()(
  "RegistrationApiNotFound",
  {
    message: Schema.String,
  },
  { httpApiStatus: 404 }
) {}

export class RegistrationApiUnauthorized extends Schema.TaggedErrorClass<RegistrationApiUnauthorized>()(
  "RegistrationApiUnauthorized",
  {
    message: Schema.String,
  },
  { httpApiStatus: 401 }
) {}

export const RegistrationApiFieldPath = Schema.Literals(["email", "vatId"]);
export type RegistrationApiFieldPath = typeof RegistrationApiFieldPath.Type;

export class DuplicateRegistrationEmail extends Schema.TaggedClass<DuplicateRegistrationEmail>()(
  "DuplicateRegistrationEmail",
  {
    path: RegistrationApiFieldPath,
    code: Schema.Literal("duplicateEmail"),
  }
) {}

export class InvalidRegistrationVatId extends Schema.TaggedClass<InvalidRegistrationVatId>()(
  "InvalidRegistrationVatId",
  {
    path: RegistrationApiFieldPath,
    code: Schema.Literal("invalidVatId"),
  }
) {}

export class UnsupportedRegistrationCountry extends Schema.TaggedClass<UnsupportedRegistrationCountry>()(
  "UnsupportedRegistrationCountry",
  {
    code: Schema.Literal("unsupportedRegistrationCountry"),
    country: CountryCode,
  }
) {}

export const RegistrationApiValidationReason = Schema.Union([
  DuplicateRegistrationEmail,
  InvalidRegistrationVatId,
  UnsupportedRegistrationCountry,
]);
export type RegistrationApiValidationReason =
  typeof RegistrationApiValidationReason.Type;

export class RegistrationApiValidationError extends Schema.TaggedErrorClass<RegistrationApiValidationError>()(
  "RegistrationApiValidationError",
  {
    message: Schema.String,
    reasons: Schema.NonEmptyArray(RegistrationApiValidationReason),
  },
  { httpApiStatus: 422 }
) {}

export class RegistrationAddressInput extends Schema.Class<RegistrationAddressInput>(
  "RegistrationAddressInput"
)({
  streetName: Schema.String,
  additionalStreetInfo: Schema.optional(Schema.String),
  postalCode: Schema.String,
  city: Schema.String,
  region: Schema.optional(Schema.String),
  country: Schema.String,
}) {}

export class CreateRegistrationRequest extends Schema.Class<CreateRegistrationRequest>(
  "CreateRegistrationRequest"
)({
  companyName: Schema.String,
  companyPhone: Schema.optional(Schema.String),
  vatId: Schema.optional(Schema.String),
  contactFirstName: Schema.String,
  contactLastName: Schema.String,
  email: Schema.String,
  address: RegistrationAddressInput,
}) {}

export class CreateRegistrationResponse extends Schema.Class<CreateRegistrationResponse>(
  "CreateRegistrationResponse"
)({
  registrationId: RegistrationId,
  status: Schema.Literal("awaiting_approval"),
}) {}

export class RegistrationReviewerInput extends Schema.Class<RegistrationReviewerInput>(
  "RegistrationReviewerInput"
)({
  authUserId: Schema.String,
  email: Schema.String,
  name: Schema.String,
}) {}

export class RegistrationDecisionRequest extends Schema.Class<RegistrationDecisionRequest>(
  "RegistrationDecisionRequest"
)({
  reviewer: RegistrationReviewerInput,
  reason: Schema.optional(Schema.String),
}) {}

export class RegistrationDecisionAcceptedResponse extends Schema.Class<RegistrationDecisionAcceptedResponse>(
  "RegistrationDecisionAcceptedResponse"
)({
  registrationId: RegistrationId,
  status: Schema.Literal("approval_processing"),
}) {}

export const RegistrationDecisionResponse =
  RegistrationDecisionAcceptedResponse;
export type RegistrationDecisionResponse =
  typeof RegistrationDecisionResponse.Type;

export class RegistrationDetailResponse extends Schema.Class<RegistrationDetailResponse>(
  "RegistrationDetailResponse"
)({
  registrationId: RegistrationId,
  status: RegistrationStatus,
  companyName: Schema.String,
  companyPhone: Schema.String,
  vatId: Schema.String,
  contactFirstName: Schema.String,
  contactLastName: Schema.String,
  email: Schema.String,
  address: Schema.Struct({
    streetName: Schema.String,
    additionalStreetInfo: Schema.String,
    postalCode: Schema.String,
    city: Schema.String,
    region: Schema.String,
    country: Schema.String,
  }),
  invitationId: Schema.optional(InvitationId),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  approvedAt: Schema.optional(Schema.String),
  rejectedAt: Schema.optional(Schema.String),
  approvalReason: Schema.optional(Schema.String),
  actorEmail: Schema.optional(Schema.String),
  actorName: Schema.optional(Schema.String),
}) {}

export class ListRegistrationsResponse extends Schema.Class<ListRegistrationsResponse>(
  "ListRegistrationsResponse"
)({
  items: Schema.Array(RegistrationDetailResponse),
  nextCursor: Schema.optional(Schema.String),
}) {}

export class ListRegistrationsQuery extends Schema.Class<ListRegistrationsQuery>(
  "ListRegistrationsQuery"
)({
  status: Schema.optional(RegistrationStatus),
  search: Schema.optional(Schema.String),
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.NumberFromString),
}) {}

const RegistrationApiErrors = [
  RegistrationApiError,
  RegistrationAlreadyApproved,
  RegistrationAlreadyRejected,
  RegistrationApiConflict,
  RegistrationDecisionAlreadyProcessing,
  RegistrationApiNotFound,
  RegistrationApiUnauthorized,
  RegistrationApiValidationError,
] as const;

export class RegistrationApiGroup extends HttpApiGroup.make("registrations")
  .add(
    HttpApiEndpoint.post("create", "/registrations", {
      payload: CreateRegistrationRequest,
      success: CreateRegistrationResponse.pipe(HttpApiSchema.status("Created")),
      error: RegistrationApiErrors,
    }),
    HttpApiEndpoint.get("list", "/registrations", {
      query: ListRegistrationsQuery,
      success: ListRegistrationsResponse,
      error: RegistrationApiErrors,
    }),
    HttpApiEndpoint.get("get", "/registrations/:registrationId", {
      params: {
        registrationId: RegistrationId,
      },
      success: RegistrationDetailResponse,
      error: RegistrationApiErrors,
    }),
    HttpApiEndpoint.post("approve", "/registrations/:registrationId/approve", {
      params: {
        registrationId: RegistrationId,
      },
      headers: {
        "x-registration-approval-secret": Schema.optional(Schema.String),
      },
      payload: RegistrationDecisionRequest,
      success: RegistrationDecisionAcceptedResponse,
      error: RegistrationApiErrors,
    }),
    HttpApiEndpoint.post("reject", "/registrations/:registrationId/reject", {
      params: {
        registrationId: RegistrationId,
      },
      headers: {
        "x-registration-approval-secret": Schema.optional(Schema.String),
      },
      payload: RegistrationDecisionRequest,
      success: RegistrationDecisionAcceptedResponse,
      error: RegistrationApiErrors,
    })
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "Registrations",
      description: "Effect registration submission and approval endpoints",
    })
  ) {}

export class RegistrationHttpApi extends HttpApi.make("registration-http-api")
  .add(RegistrationApiGroup)
  .annotateMerge(
    OpenApi.annotations({
      title: "Registration HTTP API",
      version: "1.0.0",
    })
  ) {}

export const toCompanyRegistrationDetails = (
  input: CreateRegistrationRequest
) =>
  new CompanyRegistrationDetails({
    companyName: CompanyName.make(input.companyName),
    ...(input.companyPhone === undefined || input.companyPhone === ""
      ? {}
      : {
          companyPhone: Redacted.make(PhoneNumber.make(input.companyPhone), {
            label: "companyPhone",
          }),
        }),
    ...(input.vatId === undefined || input.vatId === ""
      ? {}
      : {
          vatId: Redacted.make(VatId.make(input.vatId), {
            label: "vatId",
          }),
        }),
    contactFirstName: Redacted.make(PersonName.make(input.contactFirstName), {
      label: "personName",
    }),
    contactLastName: Redacted.make(PersonName.make(input.contactLastName), {
      label: "personName",
    }),
    email: Redacted.make(Email.make(input.email), { label: "email" }),
    address: new CompanyAddress({
      streetName: Redacted.make(AddressLine.make(input.address.streetName), {
        label: "addressLine",
      }),
      ...(input.address.additionalStreetInfo === undefined ||
      input.address.additionalStreetInfo === ""
        ? {}
        : {
            additionalStreetInfo: Redacted.make(
              AddressLine.make(input.address.additionalStreetInfo),
              { label: "addressLine" }
            ),
          }),
      postalCode: Redacted.make(PostalCode.make(input.address.postalCode), {
        label: "postalCode",
      }),
      city: Redacted.make(City.make(input.address.city), { label: "city" }),
      ...(input.address.region === undefined || input.address.region === ""
        ? {}
        : {
            region: Redacted.make(Region.make(input.address.region), {
              label: "region",
            }),
          }),
      country: CountryCode.make(input.address.country),
    }),
  });

export const toReviewerActor = (input: RegistrationReviewerInput) =>
  new RegistrationReviewerActor({
    actorType: "registration_reviewer",
    authUserId: AuthUserId.make(input.authUserId),
    email: Redacted.make(Email.make(input.email), { label: "email" }),
    name: input.name,
  });

const reviewerEmail = (actor: RegistrationReviewerActor) =>
  String(Redacted.value(actor.email));

const decisionFields = (
  registration: Extract<Registration, { status: "approved" | "rejected" }>
) => {
  const decidedAt = registration.decision.decidedAt.toISOString();

  return {
    actorEmail: reviewerEmail(registration.decision.actor),
    actorName: registration.decision.actor.name,
    ...(registration.decision.reason
      ? { approvalReason: registration.decision.reason }
      : {}),
    ...(registration.decision.decision === "approved"
      ? { approvedAt: decidedAt }
      : { rejectedAt: decidedAt }),
  };
};

export const toRegistrationDetailResponse = (
  registration: Registration
): RegistrationDetailResponse => {
  const details = registration.details;

  return new RegistrationDetailResponse({
    registrationId: registration.id,
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
          invitationId: registration.invitationId,
          ...decisionFields(registration),
        }
      : {}),
    ...(registration._tag === "RejectedRegistration"
      ? decisionFields(registration)
      : {}),
    createdAt: registration.createdAt.toISOString(),
    updatedAt: registration.updatedAt.toISOString(),
  });
};

export const toApiError = (
  error:
    | RegistrationCreateError
    | RegistrationReadError
    | RegistrationTransitionError
    | RegistrationQueryError
    | CommerceAccountError
    | IdentityUserLookupFailure
    | InvitationIssueError
) => {
  switch (error._tag) {
    case "RegistrationNotFound":
      return new RegistrationApiNotFound({
        message: "Registration was not found",
      });
    case "RegistrationAlreadyExists":
    case "RegistrationConcurrentModification":
    case "RegistrationQueryInvalidCursor":
    case "InvitationConflict":
      return new RegistrationApiConflict({
        message: error._tag,
      });
    case "RegistrationTransitionConflict":
      switch (error.currentState) {
        case "ApprovedRegistration":
          return new RegistrationAlreadyApproved({
            message: error.message,
          });
        case "RejectedRegistration":
          return new RegistrationAlreadyRejected({
            message: error.message,
          });
        case "ApprovalProcessingRegistration":
          return new RegistrationDecisionAlreadyProcessing({
            message: error.message,
          });
        default:
          return new RegistrationApiConflict({
            message: error._tag,
          });
      }
    default:
      return new RegistrationApiError({
        message: error._tag,
      });
  }
};
