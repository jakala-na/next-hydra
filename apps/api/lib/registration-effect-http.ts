import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import type {
  CompanyRegistrationDetails,
  RegistrationStatus,
} from "@repo/registration-effect/domain/registration";
import {
  CreateRegistrationResponse,
  DuplicateRegistrationEmail,
  InvalidRegistrationVatId,
  ListRegistrationsResponse,
  RegistrationApiError,
  RegistrationApiUnauthorized,
  RegistrationApiValidationError,
  type RegistrationApiValidationReason,
  RegistrationDecisionAcceptedResponse,
  RegistrationHttpApi,
  type RegistrationReviewerInput,
  toApiError,
  toCompanyRegistrationDetails,
  toRegistrationDetailResponse,
  UnsupportedRegistrationCountry,
} from "@repo/registration-effect/http/registration-api";
import { IdentityUsers } from "@repo/registration-effect/services/identity-users";
import type { Invitations } from "@repo/registration-effect/services/invitations";
import { RegistrationMarketPolicy } from "@repo/registration-effect/services/registration-market-policy";
import { RegistrationQueries } from "@repo/registration-effect/services/registration-queries";
import { Registrations } from "@repo/registration-effect/services/registrations";
import { VatValidator } from "@repo/registration-effect/services/vat-validator";
import { type Context, Effect, Layer, Redacted } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import type { RegistrationWorkflowDecision } from "./registration-workflow-contract";

type RegistrationEffectRuntimeLayer = Layer.Layer<
  | Registrations
  | RegistrationQueries
  | CommerceAccounts
  | IdentityUsers
  | RegistrationMarketPolicy
  | VatValidator
  | Invitations,
  unknown,
  never
>;

export interface RegistrationEffectHttpDependencies {
  readonly approvalSecret: string;
  readonly layer: RegistrationEffectRuntimeLayer;
  readonly resumeRegistrationWorkflow: (
    registrationId: string,
    decision: RegistrationWorkflowDecision
  ) => Effect.Effect<void, RegistrationApiError>;
  readonly startRegistrationWorkflow: (
    registrationId: string
  ) => Effect.Effect<unknown, RegistrationApiError>;
}

const authorizeAdmin = (
  expectedApprovalSecret: string,
  approvalSecret: string | undefined
): Effect.Effect<void, RegistrationApiUnauthorized> =>
  approvalSecret === expectedApprovalSecret
    ? Effect.void
    : Effect.fail(
        new RegistrationApiUnauthorized({
          message: "Unauthorized",
        })
      );

const toRegistrationHttpError = (
  error:
    | Parameters<typeof toApiError>[0]
    | RegistrationApiError
    | RegistrationApiValidationError
    | RegistrationApiUnauthorized
) =>
  error instanceof RegistrationApiError ||
  error instanceof RegistrationApiValidationError ||
  error instanceof RegistrationApiUnauthorized
    ? error
    : toApiError(error);

const matchesSearch = (
  registration: ReturnType<typeof toRegistrationDetailResponse>,
  search: string | undefined
) => {
  if (!search) {
    return true;
  }

  const normalized = search.toLowerCase();

  return [
    registration.companyName,
    registration.contactFirstName,
    registration.contactLastName,
    registration.email,
    registration.vatId,
  ].some((value) => value.toLowerCase().includes(normalized));
};

const toWorkflowReviewer = (reviewer: RegistrationReviewerInput) => ({
  authUserId: reviewer.authUserId,
  email: reviewer.email,
  name: reviewer.name,
});

const duplicateRegistrationStatuses = [
  "awaiting_approval",
  "approval_processing",
] as const satisfies readonly RegistrationStatus[];

const normalizedEmail = (email: string) => email.trim().toLowerCase();

type RegistrationQueriesService = Context.Service.Shape<
  typeof RegistrationQueries
>;

type CommerceAccountsService = Context.Service.Shape<typeof CommerceAccounts>;

type IdentityUsersService = Context.Service.Shape<typeof IdentityUsers>;
type RegistrationMarketPolicyService = Context.Service.Shape<
  typeof RegistrationMarketPolicy
>;
type VatValidatorService = Context.Service.Shape<typeof VatValidator>;

const registrationEmailMatches = (
  registration: ReturnType<typeof toRegistrationDetailResponse>,
  email: string
) => normalizedEmail(registration.email) === email;

const hasRegistrationWithEmail = (
  queries: RegistrationQueriesService,
  status: (typeof duplicateRegistrationStatuses)[number],
  email: string,
  cursor?: string
): Effect.Effect<boolean> =>
  queries
    .list({
      status,
      limit: 100,
      ...(cursor === undefined ? {} : { cursor }),
    })
    .pipe(
      Effect.flatMap((result) => {
        const hasMatch = result.items.some((item) =>
          registrationEmailMatches(
            toRegistrationDetailResponse(item.registration),
            email
          )
        );

        if (hasMatch || result.nextCursor === undefined) {
          return Effect.succeed(hasMatch);
        }

        return hasRegistrationWithEmail(
          queries,
          status,
          email,
          result.nextCursor
        );
      })
    )
    .pipe(Effect.orDie);

const hasCustomerWithEmail = (
  commerceAccounts: CommerceAccountsService,
  details: CompanyRegistrationDetails
) => commerceAccounts.hasCustomerWithEmail(details.email).pipe(Effect.orDie);

const hasIdentityUserWithEmail = (
  identityUsers: IdentityUsersService,
  details: CompanyRegistrationDetails
) => identityUsers.hasUserWithEmail(details.email).pipe(Effect.orDie);

const isInvalidVatId = (
  vatValidator: VatValidatorService,
  details: CompanyRegistrationDetails
) =>
  details.vatId
    ? vatValidator.isValid(details.vatId).pipe(Effect.map((valid) => !valid))
    : Effect.succeed(false);

const isUnsupportedRegistrationCountry = (
  marketPolicy: RegistrationMarketPolicyService,
  details: CompanyRegistrationDetails
) =>
  marketPolicy
    .canRegisterCompany(details.address.country)
    .pipe(Effect.map((supported) => !supported));

const hasPendingRegistrationWithEmail = (
  queries: RegistrationQueriesService,
  email: string
) =>
  Effect.forEach(duplicateRegistrationStatuses, (status) =>
    hasRegistrationWithEmail(queries, status, email)
  ).pipe(Effect.map((matches) => matches.some(Boolean)));

const toNonEmptyValidationReasons = (
  reasons: readonly RegistrationApiValidationReason[]
) =>
  reasons.length > 0
    ? ([reasons[0], ...reasons.slice(1)] as [
        RegistrationApiValidationReason,
        ...RegistrationApiValidationReason[],
      ])
    : undefined;

const validateCreateRegistration = (
  payload: Parameters<typeof toCompanyRegistrationDetails>[0],
  queries: RegistrationQueriesService,
  commerceAccounts: CommerceAccountsService,
  identityUsers: IdentityUsersService,
  marketPolicy: RegistrationMarketPolicyService,
  vatValidator: VatValidatorService
): Effect.Effect<CompanyRegistrationDetails, RegistrationApiValidationError> =>
  Effect.gen(function* () {
    const details = toCompanyRegistrationDetails(payload);
    const email = normalizedEmail(String(Redacted.value(details.email)));
    const [
      hasCustomer,
      hasIdentityUser,
      hasPendingEmailRegistration,
      unsupportedRegistrationCountry,
      invalidVatId,
    ] = yield* Effect.all(
      [
        hasCustomerWithEmail(commerceAccounts, details),
        hasIdentityUserWithEmail(identityUsers, details),
        hasPendingRegistrationWithEmail(queries, email),
        isUnsupportedRegistrationCountry(marketPolicy, details),
        isInvalidVatId(vatValidator, details),
      ],
      { concurrency: "unbounded" }
    );
    const validationReasons = toNonEmptyValidationReasons([
      ...(hasCustomer || hasIdentityUser || hasPendingEmailRegistration
        ? [
            new DuplicateRegistrationEmail({
              path: "email",
              code: "duplicateEmail",
            }),
          ]
        : []),
      ...(invalidVatId
        ? [
            new InvalidRegistrationVatId({
              path: "vatId",
              code: "invalidVatId",
            }),
          ]
        : []),
      ...(unsupportedRegistrationCountry
        ? [
            new UnsupportedRegistrationCountry({
              code: "unsupportedRegistrationCountry",
              country: details.address.country,
            }),
          ]
        : []),
    ]);

    if (validationReasons) {
      return yield* Effect.fail(
        new RegistrationApiValidationError({
          message: "Registration has field validation errors",
          reasons: validationReasons,
        })
      );
    }

    return details;
  });

const makeRegistrationEffectHttpHandlers = ({
  approvalSecret,
  resumeRegistrationWorkflow,
  startRegistrationWorkflow,
}: Pick<
  RegistrationEffectHttpDependencies,
  "approvalSecret" | "resumeRegistrationWorkflow" | "startRegistrationWorkflow"
>) =>
  HttpApiBuilder.group(
    RegistrationHttpApi,
    "registrations",
    Effect.fn(function* (handlers) {
      const registrations = yield* Registrations;
      const queries = yield* RegistrationQueries;
      const commerceAccounts = yield* CommerceAccounts;
      const identityUsers = yield* IdentityUsers;
      const marketPolicy = yield* RegistrationMarketPolicy;
      const vatValidator = yield* VatValidator;

      return handlers
        .handle("create", ({ payload }) =>
          Effect.gen(function* () {
            const details = yield* validateCreateRegistration(
              payload,
              queries,
              commerceAccounts,
              identityUsers,
              marketPolicy,
              vatValidator
            ).pipe(Effect.withSpan("registration.api.create.validate"));
            const registration = yield* registrations.createAwaitingApproval({
              details,
            });
            yield* Effect.annotateCurrentSpan({
              "registration.id": String(registration.id),
            });

            yield* startRegistrationWorkflow(String(registration.id)).pipe(
              Effect.withSpan("registration.workflow.start", {
                attributes: {
                  "registration.id": String(registration.id),
                },
              }),
              Effect.orDie
            );

            return new CreateRegistrationResponse({
              registrationId: registration.id,
              status: "awaiting_approval",
            });
          }).pipe(
            Effect.annotateLogs({
              operation: "registration.api.create",
              service: "registration-api",
            }),
            Effect.annotateSpans({
              "registration.operation": "create",
            }),
            Effect.withSpan("registration.api.create"),
            Effect.mapError(toRegistrationHttpError)
          )
        )
        .handle("list", ({ query }) =>
          queries
            .list({
              ...(query.status === undefined ? {} : { status: query.status }),
              ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
              ...(query.limit === undefined ? {} : { limit: query.limit }),
            })
            .pipe(
              Effect.map((result) => {
                const items = result.items
                  .map((item) =>
                    toRegistrationDetailResponse(item.registration)
                  )
                  .filter((registration) =>
                    matchesSearch(registration, query.search)
                  );

                return new ListRegistrationsResponse(
                  result.nextCursor
                    ? { items, nextCursor: result.nextCursor }
                    : { items }
                );
              }),
              Effect.mapError(toRegistrationHttpError)
            )
        )
        .handle("get", ({ params }) =>
          registrations
            .get(params.registrationId)
            .pipe(
              Effect.map(toRegistrationDetailResponse),
              Effect.mapError(toRegistrationHttpError)
            )
        )
        .handle("approve", ({ headers, params, payload }) =>
          Effect.gen(function* () {
            yield* authorizeAdmin(
              approvalSecret,
              headers["x-registration-approval-secret"]
            );
            yield* registrations.markApprovalProcessing({
              registrationId: params.registrationId,
              decision: "approved",
            });
            yield* resumeRegistrationWorkflow(String(params.registrationId), {
              decision: "approved",
              reviewer: toWorkflowReviewer(payload.reviewer),
              ...(payload.reason === undefined
                ? {}
                : { reason: payload.reason }),
            });

            return new RegistrationDecisionAcceptedResponse({
              registrationId: params.registrationId,
              status: "approval_processing",
            });
          }).pipe(
            Effect.tapCause((cause) =>
              Effect.logError("Failed to accept registration decision", cause)
            ),
            Effect.annotateLogs({
              operation: "registration.api.decision.accept",
              "registration.decision": "approved",
              "registration.id": String(params.registrationId),
              service: "registration-api",
            }),
            Effect.annotateSpans({
              "registration.decision": "approved",
              "registration.id": String(params.registrationId),
              "registration.operation": "decision.accept",
            }),
            Effect.withSpan("registration.api.decision.accept"),
            Effect.withLogSpan("registration.api.decision.accept"),
            Effect.mapError(toRegistrationHttpError)
          )
        )
        .handle("reject", ({ headers, params, payload }) =>
          Effect.gen(function* () {
            yield* authorizeAdmin(
              approvalSecret,
              headers["x-registration-approval-secret"]
            );
            yield* registrations.markApprovalProcessing({
              registrationId: params.registrationId,
              decision: "rejected",
            });
            yield* resumeRegistrationWorkflow(String(params.registrationId), {
              decision: "rejected",
              reviewer: toWorkflowReviewer(payload.reviewer),
              ...(payload.reason === undefined
                ? {}
                : { reason: payload.reason }),
            });

            return new RegistrationDecisionAcceptedResponse({
              registrationId: params.registrationId,
              status: "approval_processing",
            });
          }).pipe(
            Effect.tapCause((cause) =>
              Effect.logError("Failed to accept registration decision", cause)
            ),
            Effect.annotateLogs({
              operation: "registration.api.decision.accept",
              "registration.decision": "rejected",
              "registration.id": String(params.registrationId),
              service: "registration-api",
            }),
            Effect.annotateSpans({
              "registration.decision": "rejected",
              "registration.id": String(params.registrationId),
              "registration.operation": "decision.accept",
            }),
            Effect.withSpan("registration.api.decision.accept"),
            Effect.withLogSpan("registration.api.decision.accept"),
            Effect.mapError(toRegistrationHttpError)
          )
        );
    })
  );

const makeRegistrationEffectHttpApiLayer = (
  dependencies: RegistrationEffectHttpDependencies
) =>
  HttpApiBuilder.layer(RegistrationHttpApi, {
    openapiPath: "/openapi.json",
  }).pipe(
    Layer.provide(makeRegistrationEffectHttpHandlers(dependencies)),
    Layer.provide(dependencies.layer),
    Layer.provide(HttpServer.layerServices)
  );

export const makeRegistrationEffectHttpHandler = (
  dependencies: RegistrationEffectHttpDependencies
) =>
  HttpRouter.toWebHandler(makeRegistrationEffectHttpApiLayer(dependencies), {
    disableLogger: true,
  });
