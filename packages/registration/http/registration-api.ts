import { StoreKey } from "@repo/commerce/store";
import { locales } from "@repo/i18n/config";
import { Context, Redacted, Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
  OpenApi,
} from "effect/unstable/httpapi";

import type { RegistrationReviewerActor } from "../domain/actors";
import {
  AddressLine,
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
  RegistrationStatus,
} from "../domain/registration";
import type { Registration } from "../domain/registration";
import { RegistrationIntakeValidationReason } from "../programs/registration-intake";
import type { RegistrationQueryError } from "../services/registration-queries";
import type {
  RegistrationCreateError,
  RegistrationReadError,
  RegistrationTransitionError,
} from "../services/registrations";

export const REGISTRATION_READ_PERMISSION = "registration.read";
export const REGISTRATION_DECIDE_PERMISSION = "registration.decide";

export class RegistrationApiError extends Schema.TaggedErrorClass<RegistrationApiError>()(
  "RegistrationApiError",
  {
    message: Schema.String,
  },
  { httpApiStatus: 500 }
) {}

export class RegistrationApiBadRequest extends Schema.TaggedErrorClass<RegistrationApiBadRequest>()(
  "RegistrationApiBadRequest",
  {
    message: Schema.String,
  },
  { httpApiStatus: 400 }
) {}

export class RegistrationApiInvalidCursor extends Schema.TaggedErrorClass<RegistrationApiInvalidCursor>()(
  "RegistrationApiInvalidCursor",
  {
    message: Schema.String,
  },
  { httpApiStatus: 400 }
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

export class RegistrationApiForbidden extends Schema.TaggedErrorClass<RegistrationApiForbidden>()(
  "RegistrationApiForbidden",
  {
    message: Schema.String,
  },
  { httpApiStatus: 403 }
) {}

export class RegistrationApiAuthenticationUnavailable extends Schema.TaggedErrorClass<RegistrationApiAuthenticationUnavailable>()(
  "RegistrationApiAuthenticationUnavailable",
  {
    message: Schema.String,
  },
  { httpApiStatus: 503 }
) {}

export const RegistrationApiValidationReason =
  RegistrationIntakeValidationReason;
export type RegistrationApiValidationReason =
  typeof RegistrationApiValidationReason.Type;

export {
  DuplicateRegistrationEmail,
  InvalidRegistrationVatId,
  UnsupportedRegistrationCountry,
} from "../programs/registration-intake";

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
  additionalStreetInfo: Schema.optional(Schema.String),
  city: Schema.String,
  country: Schema.String,
  postalCode: Schema.String,
  region: Schema.optional(Schema.String),
  streetName: Schema.String,
}) {}

export class CreateRegistrationRequest extends Schema.Class<CreateRegistrationRequest>(
  "CreateRegistrationRequest"
)({
  address: RegistrationAddressInput,
  companyName: Schema.String,
  companyPhone: Schema.optional(Schema.String),
  contactFirstName: Schema.String,
  contactLastName: Schema.String,
  email: Schema.String,
  vatId: Schema.optional(Schema.String),
}) {}

export const RegistrationLocale = Schema.Literals(locales);
export type RegistrationLocale = typeof RegistrationLocale.Type;

export class CreateRegistrationResponse extends Schema.Class<CreateRegistrationResponse>(
  "CreateRegistrationResponse"
)({
  registrationId: RegistrationId,
  status: Schema.Literal("awaiting_approval"),
  storeKey: StoreKey,
}) {}

export class RegistrationDecisionRequest extends Schema.Class<RegistrationDecisionRequest>(
  "RegistrationDecisionRequest"
)({
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
  actorEmail: Schema.optional(Schema.String),
  actorName: Schema.optional(Schema.String),
  address: Schema.Struct({
    streetName: Schema.String,
    additionalStreetInfo: Schema.String,
    postalCode: Schema.String,
    city: Schema.String,
    region: Schema.String,
    country: Schema.String,
  }),
  approvalReason: Schema.optional(Schema.String),
  approvedAt: Schema.optional(Schema.String),
  companyName: Schema.String,
  companyPhone: Schema.String,
  contactFirstName: Schema.String,
  contactLastName: Schema.String,
  createdAt: Schema.String,
  email: Schema.String,
  invitationId: Schema.optional(InvitationId),
  registrationId: RegistrationId,
  rejectedAt: Schema.optional(Schema.String),
  status: RegistrationStatus,
  storeKey: StoreKey,
  updatedAt: Schema.String,
  vatId: Schema.String,
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
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.NumberFromString),
  search: Schema.optional(Schema.String),
  status: Schema.optional(RegistrationStatus),
}) {}

export class RegistrationReviewerContext extends Context.Service<
  RegistrationReviewerContext,
  RegistrationReviewerActor
>()("@repo/registration/http/RegistrationReviewerContext") {}

export class RegistrationSchemaErrorMiddleware extends HttpApiMiddleware.Service<
  RegistrationSchemaErrorMiddleware,
  { readonly requires: never }
>()("@repo/registration/http/RegistrationSchemaErrorMiddleware", {
  error: RegistrationApiBadRequest,
}) {}

const RegistrationAccessErrors = [
  RegistrationApiAuthenticationUnavailable,
  RegistrationApiForbidden,
  RegistrationApiUnauthorized,
] as const;

export class RegistrationReadAccessMiddleware extends HttpApiMiddleware.Service<
  RegistrationReadAccessMiddleware,
  { readonly requires: never }
>()("@repo/registration/http/RegistrationReadAccessMiddleware", {
  error: RegistrationAccessErrors,
  security: {
    accessToken: HttpApiSecurity.bearer,
  },
}) {}

export class RegistrationDecisionAccessMiddleware extends HttpApiMiddleware.Service<
  RegistrationDecisionAccessMiddleware,
  {
    readonly provides: RegistrationReviewerContext;
    readonly requires: never;
  }
>()("@repo/registration/http/RegistrationDecisionAccessMiddleware", {
  error: RegistrationAccessErrors,
  security: {
    accessToken: HttpApiSecurity.bearer,
  },
}) {}

const RegistrationCreateErrors = [
  RegistrationApiConflict,
  RegistrationApiError,
  RegistrationApiValidationError,
] as const;

const RegistrationReadErrors = [
  RegistrationApiError,
  RegistrationApiInvalidCursor,
] as const;

const RegistrationGetErrors = [
  RegistrationApiError,
  RegistrationApiNotFound,
] as const;

const RegistrationDecisionErrors = [
  RegistrationApiError,
  RegistrationAlreadyApproved,
  RegistrationAlreadyRejected,
  RegistrationApiConflict,
  RegistrationDecisionAlreadyProcessing,
  RegistrationApiNotFound,
] as const;

export class RegistrationApiGroup extends HttpApiGroup.make("registrations")
  .add(
    HttpApiEndpoint.post("create", "/registrations", {
      error: RegistrationCreateErrors,
      headers: {
        "x-context-locale": RegistrationLocale,
      },
      payload: CreateRegistrationRequest,
      success: CreateRegistrationResponse.pipe(HttpApiSchema.status("Created")),
    }),
    HttpApiEndpoint.get("list", "/registrations", {
      error: RegistrationReadErrors,
      query: ListRegistrationsQuery,
      success: ListRegistrationsResponse,
    }).middleware(RegistrationReadAccessMiddleware),
    HttpApiEndpoint.get("get", "/registrations/:registrationId", {
      error: RegistrationGetErrors,
      params: {
        registrationId: RegistrationId,
      },
      success: RegistrationDetailResponse,
    }).middleware(RegistrationReadAccessMiddleware),
    HttpApiEndpoint.post("approve", "/registrations/:registrationId/approve", {
      error: RegistrationDecisionErrors,
      params: {
        registrationId: RegistrationId,
      },
      payload: RegistrationDecisionRequest,
      success: RegistrationDecisionAcceptedResponse,
    }).middleware(RegistrationDecisionAccessMiddleware),
    HttpApiEndpoint.post("reject", "/registrations/:registrationId/reject", {
      error: RegistrationDecisionErrors,
      params: {
        registrationId: RegistrationId,
      },
      payload: RegistrationDecisionRequest,
      success: RegistrationDecisionAcceptedResponse,
    }).middleware(RegistrationDecisionAccessMiddleware)
  )
  .middleware(RegistrationSchemaErrorMiddleware)
  .annotateMerge(
    OpenApi.annotations({
      description: "Effect registration submission and approval endpoints",
      title: "Registrations",
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
  const { details } = registration;

  return new RegistrationDetailResponse({
    registrationId: registration.id,
    status: registration.status,
    storeKey: registration.storeKey,
    companyName: String(details.companyName),
    companyPhone: details.companyPhone
      ? Redacted.value(details.companyPhone)
      : "",
    vatId: details.vatId ? Redacted.value(details.vatId) : "",
    contactFirstName: Redacted.value(details.contactFirstName),
    contactLastName: Redacted.value(details.contactLastName),
    email: Redacted.value(details.email),
    address: {
      additionalStreetInfo: details.address.additionalStreetInfo
        ? Redacted.value(details.address.additionalStreetInfo)
        : "",
      city: Redacted.value(details.address.city),
      country: String(details.address.country),
      postalCode: Redacted.value(details.address.postalCode),
      region: details.address.region
        ? Redacted.value(details.address.region)
        : "",
      streetName: Redacted.value(details.address.streetName),
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

const internalRegistrationError = () =>
  new RegistrationApiError({
    message: "The registration service is temporarily unavailable.",
  });

export const toRegistrationCreateApiError = (
  error: RegistrationCreateError
): RegistrationApiConflict | RegistrationApiError => {
  switch (error._tag) {
    case "RegistrationAlreadyExists": {
      return new RegistrationApiConflict({
        message: error.message,
      });
    }
    case "RegistrationPersistenceFailure": {
      return internalRegistrationError();
    }
  }
};

export const toRegistrationReadApiError = (
  error: RegistrationReadError
): RegistrationApiNotFound | RegistrationApiError => {
  switch (error._tag) {
    case "RegistrationNotFound": {
      return new RegistrationApiNotFound({ message: error.message });
    }
    case "RegistrationPersistenceFailure": {
      return internalRegistrationError();
    }
  }
};

export const toRegistrationQueryApiError = (
  error: RegistrationQueryError
): RegistrationApiInvalidCursor | RegistrationApiError => {
  switch (error._tag) {
    case "RegistrationQueryInvalidCursor": {
      return new RegistrationApiInvalidCursor({
        message: "The registration cursor is invalid.",
      });
    }
    case "RegistrationQueryFailure": {
      return internalRegistrationError();
    }
  }
};

export const toRegistrationTransitionApiError = (
  error: RegistrationTransitionError
):
  | RegistrationAlreadyApproved
  | RegistrationAlreadyRejected
  | RegistrationApiConflict
  | RegistrationApiError
  | RegistrationApiNotFound
  | RegistrationDecisionAlreadyProcessing => {
  switch (error._tag) {
    case "RegistrationNotFound": {
      return new RegistrationApiNotFound({ message: error.message });
    }
    case "RegistrationConcurrentModification": {
      return new RegistrationApiConflict({ message: error.message });
    }
    case "RegistrationTransitionConflict": {
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
            message: error.message,
          });
      }
    }
    case "RegistrationPersistenceFailure": {
      return internalRegistrationError();
    }
  }
};

export const toRegistrationInternalApiError = internalRegistrationError;
