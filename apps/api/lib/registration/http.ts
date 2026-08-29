import { AccessTokenVerifier } from "@repo/auth/access-token";
import type {
  AccessTokenInvalid,
  AccessTokenVerificationFailure,
  VerifiedAccessToken,
} from "@repo/auth/access-token";
import type { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import { CommerceLocale, resolveStore } from "@repo/commerce/store";
import { makeSchemaErrorIssues } from "@repo/errors";
import { unexpectedHttpErrorsLayer } from "@repo/errors/http";
import { registrationReviewerActorFromIdentityUser } from "@repo/registration/domain/actors";
import { AuthUserId } from "@repo/registration/domain/identity";
import type { RegistrationId } from "@repo/registration/domain/identity";
import {
  CreateRegistrationResponse,
  ListRegistrationsResponse,
  REGISTRATION_DECIDE_PERMISSION,
  REGISTRATION_READ_PERMISSION,
  RegistrationDecisionAccessMiddleware,
  RegistrationDecisionAcceptedResponse,
  RegistrationHttpApi,
  RegistrationInvitationRevokedResponse,
  RegistrationReadAccessMiddleware,
  RegistrationReviewerContext,
  RegistrationSchemaErrorMiddleware,
  toCompanyRegistrationDetails,
  toRegistrationDetailResponse,
  toRegistrationCreateApiError,
  toRegistrationInternalApiError,
  toRegistrationInvitationRevocationApiError,
  toRegistrationQueryApiError,
  toRegistrationReadApiError,
  toRegistrationTransitionApiError,
} from "@repo/registration/http/registration-api";
import { submitRegistrationForReview } from "@repo/registration/programs/registration-intake";
import type { RegistrationEligibilityProviderError } from "@repo/registration/programs/registration-intake";
import { revokeRegistrationInvitation } from "@repo/registration/programs/registration-onboarding";
import { acceptRegistrationReviewDecision } from "@repo/registration/programs/registration-review";
import type { AcceptRegistrationReviewDecisionInput } from "@repo/registration/programs/registration-review";
import {
  projectRegistrationIntakeValidation,
  registrationAuthenticationUnavailable,
  registrationBadRequest,
  registrationDecisionOutcomeUnknown,
  registrationForbidden,
  registrationUnavailable,
  registrationUnauthorized,
} from "@repo/registration/public-errors";
import type { CompanyMemberIdentityProjection } from "@repo/registration/services/company-member-identity-projection";
import {
  IdentityUsers,
  isRecoverableIdentityUserLookupFailure,
} from "@repo/registration/services/identity-users";
import type {
  CompanyMemberInvitations,
  InvitationDeliveries,
  RegistrationInvitations,
} from "@repo/registration/services/invitations";
import type { RegistrationMarketPolicy } from "@repo/registration/services/registration-market-policy";
import { RegistrationQueries } from "@repo/registration/services/registration-queries";
import type {
  ListRegistrationsInput,
  RegistrationQueryFailure,
} from "@repo/registration/services/registration-queries";
import type { RegistrationWorkflow } from "@repo/registration/services/registration-workflow";
import { Registrations } from "@repo/registration/services/registrations";
import type { RegistrationPersistenceFailure } from "@repo/registration/services/registrations";
import type { VatValidator } from "@repo/registration/services/vat-validator";
import { Cause, Effect, Layer, Option, Redacted } from "effect";
import type { Config } from "effect";
import {
  HttpRouter,
  HttpServer,
  HttpServerRequest,
} from "effect/unstable/http";
import { HttpApiBuilder, HttpApiMiddleware } from "effect/unstable/httpapi";

import {
  parseBearerAuthorization,
  readBearerAuthorization,
} from "../auth/bearer-token";

type RegistrationRuntimeLayer = Layer.Layer<
  | Registrations
  | RegistrationQueries
  | CommerceAccounts
  | CompanyMemberIdentityProjection
  | IdentityUsers
  | RegistrationMarketPolicy
  | VatValidator
  | RegistrationInvitations
  | CompanyMemberInvitations
  | InvitationDeliveries
  | RegistrationWorkflow,
  unknown
>;
type RegistrationAuthenticationLayer = Layer.Layer<
  AccessTokenVerifier,
  Config.ConfigError
>;
type RegistrationReviewerIdentityLayer = Layer.Layer<
  IdentityUsers,
  Config.ConfigError
>;

export interface RegistrationHttpDependencies {
  readonly customerAuthenticationLayer: RegistrationAuthenticationLayer;
  readonly layer: RegistrationRuntimeLayer;
  readonly reviewerAuthenticationLayer: RegistrationAuthenticationLayer;
  readonly reviewerIdentityLayer: RegistrationReviewerIdentityLayer;
}

const unauthorized = registrationUnauthorized;

const forbidden = registrationForbidden;

const authenticationUnavailable = registrationAuthenticationUnavailable;

const logRegistrationAuthenticationFailure = (error: {
  readonly _tag: string;
  readonly message: string;
}) =>
  Effect.logError(error.message, error).pipe(
    Effect.annotateLogs({
      operation: "registration.api.authenticate",
      "registration.error.tag": error._tag,
      service: "registration-api",
    })
  );

const logInvalidRegistrationAccessToken = (error: AccessTokenInvalid) =>
  Effect.logWarning(error.message).pipe(
    Effect.annotateLogs({
      "auth.surface": "registration",
      "auth.token.invalid.reason": error.reason,
    })
  );

const isRegistrationEligibilityProviderError = (error: {
  readonly _tag: string;
}): error is RegistrationEligibilityProviderError =>
  error._tag === "CommerceAccountUnavailable" ||
  error._tag === "IdentityUserLookupFailure" ||
  error._tag === "RegistrationQueryFailure";

type ClassifiedRegistrationInfrastructureFailure =
  | RegistrationQueryFailure
  | RegistrationPersistenceFailure;

const retainRecoverableRegistrationInfrastructureFailure = <
  Failure extends ClassifiedRegistrationInfrastructureFailure,
>(
  error: Failure
): Effect.Effect<never, Failure> =>
  Effect.logError(error.message, error.cause).pipe(
    Effect.annotateLogs({
      "registration.error.tag": error._tag,
      "registration.failure.reason": error.reason,
    }),
    Effect.andThen(
      error.reason === "unavailable" ? Effect.fail(error) : Effect.die(error)
    )
  );

interface RegistrationAccessTokenVerifier {
  readonly verify: (
    token: string
  ) => Effect.Effect<
    VerifiedAccessToken,
    AccessTokenInvalid | AccessTokenVerificationFailure
  >;
}

const verifyRegistrationAccess = (
  verifier: RegistrationAccessTokenVerifier,
  credential: Redacted.Redacted,
  requiredPermission: string
) =>
  Effect.gen(function* verifyRegistrationAccessEffect() {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const authorization = parseBearerAuthorization(
      request.headers.authorization,
      credential
    );

    if (authorization._tag !== "Token") {
      return yield* Effect.fail(unauthorized());
    }

    return yield* verifier.verify(authorization.token).pipe(
      Effect.catchTags({
        AccessTokenInvalid: (error) =>
          logInvalidRegistrationAccessToken(error).pipe(
            Effect.andThen(Effect.fail(unauthorized()))
          ),
        AccessTokenVerificationFailure: (error) =>
          logRegistrationAuthenticationFailure(error).pipe(
            Effect.andThen(
              error.reason === "unavailable"
                ? Effect.fail(authenticationUnavailable())
                : Effect.die(error)
            )
          ),
      }),
      Effect.flatMap((verifiedToken) =>
        verifiedToken.permissions.has(requiredPermission)
          ? Effect.succeed(verifiedToken)
          : Effect.fail(forbidden())
      )
    );
  });

const registrationReadAccessMiddlewareLayer = Layer.effect(
  RegistrationReadAccessMiddleware,
  Effect.gen(function* registrationReadAccessMiddlewareLayer() {
    const verifier = yield* AccessTokenVerifier;

    return {
      accessToken: (httpEffect, { credential }) =>
        verifyRegistrationAccess(
          verifier,
          credential,
          REGISTRATION_READ_PERMISSION
        ).pipe(Effect.andThen(httpEffect)),
    };
  })
);

const registrationDecisionAccessMiddlewareLayer = Layer.effect(
  RegistrationDecisionAccessMiddleware,
  Effect.gen(function* registrationDecisionAccessMiddlewareLayer() {
    const verifier = yield* AccessTokenVerifier;
    const identityUsers = yield* IdentityUsers;

    return {
      accessToken: (httpEffect, { credential }) =>
        Effect.gen(function* accessToken() {
          const verifiedToken = yield* verifyRegistrationAccess(
            verifier,
            credential,
            REGISTRATION_DECIDE_PERMISSION
          );
          const reviewer = yield* identityUsers
            .getById(AuthUserId.make(verifiedToken.authUserId))
            .pipe(
              Effect.catchTags({
                IdentityUserLookupFailure: (error) =>
                  logRegistrationAuthenticationFailure(error).pipe(
                    Effect.andThen(
                      isRecoverableIdentityUserLookupFailure(error)
                        ? Effect.fail(authenticationUnavailable())
                        : Effect.die(error)
                    )
                  ),
                IdentityUserNotFound: () => Effect.fail(unauthorized()),
              }),
              Effect.map(registrationReviewerActorFromIdentityUser)
            );

          return yield* Effect.provideService(
            httpEffect,
            RegistrationReviewerContext,
            reviewer
          );
        }),
    };
  })
);

const registrationSchemaErrorMiddlewareLayer =
  HttpApiMiddleware.layerSchemaErrorTransform(
    RegistrationSchemaErrorMiddleware,
    (error) =>
      error.kind === "Body"
        ? Effect.die(error)
        : Effect.fail(
            registrationBadRequest(
              "The registration request is invalid.",
              makeSchemaErrorIssues(
                error.cause,
                "The registration request is invalid."
              )
            )
          )
  );

const makeRegistrationHttpHandlers = () =>
  HttpApiBuilder.group(
    RegistrationHttpApi,
    "registrations",
    Effect.fn(function* buildRegistrationHttpHandlers(handlers) {
      const registrations = yield* Registrations;
      const queries = yield* RegistrationQueries;
      const accessTokenVerifier = yield* AccessTokenVerifier;
      const identityUsers = yield* IdentityUsers;

      const submittedByAuthUserId = Effect.fn(
        "RegistrationHttp.submittedByAuthUserId"
      )(function* (details: ReturnType<typeof toCompanyRegistrationDetails>) {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const authorization = readBearerAuthorization(
          request.headers.authorization
        );
        if (authorization._tag !== "Token") {
          return undefined;
        }

        const verified = yield* accessTokenVerifier
          .verify(authorization.token)
          .pipe(
            Effect.map(Option.some),
            Effect.catchTag("AccessTokenInvalid", () =>
              Effect.succeed(Option.none())
            )
          );
        if (Option.isNone(verified)) {
          return undefined;
        }

        const identity = yield* identityUsers.getById(
          AuthUserId.make(verified.value.authUserId)
        );
        return Redacted.value(identity.email).trim().toLowerCase() ===
          Redacted.value(details.email).trim().toLowerCase()
          ? identity.authUserId
          : undefined;
      });

      const acceptDecision = (input: {
        readonly decision: "approved" | "rejected";
        readonly reason?: string;
        readonly registrationId: RegistrationId;
      }) =>
        Effect.gen(function* acceptRegistrationDecision() {
          const reviewer = yield* RegistrationReviewerContext;
          const decision: AcceptRegistrationReviewDecisionInput = {
            decision: input.decision,
            registrationId: input.registrationId,
            reviewer,
          };
          if (input.reason !== undefined) {
            Object.assign(decision, { reason: input.reason });
          }
          yield* acceptRegistrationReviewDecision(decision);

          return new RegistrationDecisionAcceptedResponse({
            registrationId: input.registrationId,
            status: "approval_processing",
          });
        }).pipe(
          Effect.catchTag(
            "RegistrationPersistenceFailure",
            retainRecoverableRegistrationInfrastructureFailure
          ),
          Effect.tapCause((cause) =>
            Effect.logError("Failed to accept registration decision", cause)
          ),
          Effect.annotateLogs({
            operation: "registration.api.decision.accept",
            "registration.decision": input.decision,
            "registration.id": String(input.registrationId),
            service: "registration-api",
          }),
          Effect.annotateSpans({
            "registration.decision": input.decision,
            "registration.id": String(input.registrationId),
            "registration.operation": "decision.accept",
          }),
          Effect.withSpan("registration.api.decision.accept"),
          Effect.withLogSpan("registration.api.decision.accept"),
          Effect.mapError((error) => {
            if (error._tag === "RegistrationWorkflowResumeOutcomeUnknown") {
              return registrationDecisionOutcomeUnknown(error.registrationId);
            }

            return toRegistrationTransitionApiError(error);
          })
        );

      return handlers
        .handle("create", ({ headers, payload }) =>
          Effect.gen(function* createRegistration() {
            const details = toCompanyRegistrationDetails(payload);
            const submittedBy = yield* submittedByAuthUserId(details).pipe(
              Effect.catchTag("IdentityUserNotFound", () => Effect.void)
            );
            const { storeKey } = resolveStore({
              locale: CommerceLocale.make(headers["x-context-locale"]),
            });
            const registration = yield* submitRegistrationForReview(
              submittedBy === undefined
                ? { details, storeKey }
                : { details, storeKey, submittedByAuthUserId: submittedBy }
            ).pipe(Effect.withSpan("registration.api.create.submit"));
            yield* Effect.annotateCurrentSpan({
              "registration.id": String(registration.id),
            });

            return new CreateRegistrationResponse({
              registrationId: registration.id,
              status: "awaiting_approval",
              storeKey: registration.storeKey,
            });
          }).pipe(
            // oxlint-disable-next-line promise/prefer-await-to-callbacks -- This is an Effect error-channel handler, not Promise control flow.
            Effect.catchTag("AccessTokenVerificationFailure", (error) =>
              logRegistrationAuthenticationFailure(error).pipe(
                Effect.andThen(
                  error.reason === "unavailable"
                    ? Effect.fail(
                        registrationUnavailable(headers["x-context-locale"])
                      )
                    : Effect.die(error)
                )
              )
            ),
            Effect.catchTag("IdentityUserLookupFailure", (error) =>
              isRecoverableIdentityUserLookupFailure(error)
                ? Effect.fail(error)
                : Effect.die(error)
            ),
            Effect.catchTags({
              RegistrationPersistenceFailure:
                retainRecoverableRegistrationInfrastructureFailure,
              RegistrationQueryFailure:
                retainRecoverableRegistrationInfrastructureFailure,
            }),
            Effect.tapCause((cause) =>
              cause.reasons.some(
                (reason) =>
                  Cause.isDieReason(reason) ||
                  (Cause.isFailReason(reason) &&
                    (reason.error._tag === "RegistrationPersistenceFailure" ||
                      isRegistrationEligibilityProviderError(reason.error)))
              )
                ? Effect.logError("Failed to create registration", cause)
                : Effect.void
            ),
            Effect.annotateLogs({
              operation: "registration.api.create",
              service: "registration-api",
            }),
            Effect.annotateSpans({
              "registration.operation": "create",
            }),
            Effect.withSpan("registration.api.create"),
            Effect.withLogSpan("registration.api.create"),
            Effect.mapError((error) => {
              switch (error._tag) {
                case "RegistrationApiError": {
                  return error;
                }
                case "RegistrationIntakeValidationError": {
                  return projectRegistrationIntakeValidation(
                    error,
                    headers["x-context-locale"]
                  );
                }
                case "RegistrationPersistenceFailure": {
                  return toRegistrationCreateApiError(error);
                }
                case "CommerceAccountUnavailable":
                case "IdentityUserLookupFailure":
                case "RegistrationQueryFailure": {
                  return toRegistrationInternalApiError();
                }
                case "RegistrationWorkflowStartUnavailable": {
                  return registrationUnavailable(headers["x-context-locale"]);
                }
                default: {
                  return error satisfies never;
                }
              }
            })
          )
        )
        .handle("list", ({ query }) => {
          const input: ListRegistrationsInput = {};
          if (query.status !== undefined) {
            Object.assign(input, { status: query.status });
          }
          if (query.search !== undefined) {
            Object.assign(input, { search: query.search });
          }
          if (query.cursor !== undefined) {
            Object.assign(input, { cursor: query.cursor });
          }
          if (query.limit !== undefined) {
            Object.assign(input, { limit: query.limit });
          }

          return queries.list(input).pipe(
            Effect.map((result) => {
              const items = result.items.map((item) =>
                toRegistrationDetailResponse(item.registration)
              );

              return new ListRegistrationsResponse(
                result.nextCursor
                  ? { items, nextCursor: result.nextCursor }
                  : { items }
              );
            }),
            Effect.tapErrorTag("RegistrationQueryFailure", (error) =>
              Effect.logError(error.message)
            ),
            Effect.catchTag(
              "RegistrationQueryFailure",
              retainRecoverableRegistrationInfrastructureFailure
            ),
            Effect.annotateLogs({
              operation: "registration.api.list",
              service: "registration-api",
            }),
            Effect.mapError(toRegistrationQueryApiError)
          );
        })
        .handle("get", ({ params }) =>
          registrations
            .get(params.registrationId)
            .pipe(
              Effect.catchTag(
                "RegistrationPersistenceFailure",
                retainRecoverableRegistrationInfrastructureFailure
              ),
              Effect.map(toRegistrationDetailResponse),
              Effect.mapError(toRegistrationReadApiError)
            )
        )
        .handle("approve", ({ params, payload }) => {
          const decision: Parameters<typeof acceptDecision>[0] = {
            decision: "approved",
            registrationId: params.registrationId,
          };
          if (payload.reason !== undefined) {
            Object.assign(decision, { reason: payload.reason });
          }
          return acceptDecision(decision);
        })
        .handle("reject", ({ params, payload }) => {
          const decision: Parameters<typeof acceptDecision>[0] = {
            decision: "rejected",
            registrationId: params.registrationId,
          };
          if (payload.reason !== undefined) {
            Object.assign(decision, { reason: payload.reason });
          }
          return acceptDecision(decision);
        })
        .handle("revokeInvitation", ({ params }) =>
          Effect.gen(function* revokeInvitation() {
            const reviewer = yield* RegistrationReviewerContext;
            yield* revokeRegistrationInvitation({
              actor: reviewer,
              registrationId: params.registrationId,
            });

            return new RegistrationInvitationRevokedResponse({
              onboardingStatus: "revoked",
              registrationId: params.registrationId,
            });
          }).pipe(
            Effect.catchTag(
              "RegistrationPersistenceFailure",
              retainRecoverableRegistrationInfrastructureFailure
            ),
            Effect.tapCause((cause) =>
              Effect.logError("Failed to revoke registration invitation", cause)
            ),
            Effect.annotateLogs({
              operation: "registration.api.invitation.revoke",
              "registration.id": String(params.registrationId),
              service: "registration-api",
            }),
            Effect.withSpan("registration.api.invitation.revoke"),
            Effect.withLogSpan("registration.api.invitation.revoke"),
            Effect.mapError(toRegistrationInvitationRevocationApiError)
          )
        );
    })
  );

const makeRegistrationHttpApiLayer = (
  dependencies: RegistrationHttpDependencies
) => {
  const registrationReadAccessLayer =
    registrationReadAccessMiddlewareLayer.pipe(
      Layer.provide(dependencies.reviewerAuthenticationLayer)
    );
  const registrationDecisionAccessLayer =
    registrationDecisionAccessMiddlewareLayer.pipe(
      Layer.provide(dependencies.reviewerAuthenticationLayer),
      Layer.provide(dependencies.reviewerIdentityLayer)
    );

  return HttpApiBuilder.layer(RegistrationHttpApi).pipe(
    Layer.provide(
      makeRegistrationHttpHandlers().pipe(
        Layer.provide(dependencies.customerAuthenticationLayer)
      )
    ),
    Layer.provide(registrationSchemaErrorMiddlewareLayer),
    Layer.provide(registrationReadAccessLayer),
    Layer.provide(registrationDecisionAccessLayer),
    Layer.provide(unexpectedHttpErrorsLayer),
    Layer.provideMerge(dependencies.layer),
    Layer.provide(HttpServer.layerServices)
  );
};

export const makeRegistrationHttpHandler = (
  dependencies: RegistrationHttpDependencies
) =>
  HttpRouter.toWebHandler(makeRegistrationHttpApiLayer(dependencies), {
    disableLogger: true,
  });
