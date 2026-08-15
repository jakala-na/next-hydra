import { AccessTokenVerifier } from "@repo/auth/access-token";
import type {
  AccessTokenInvalid,
  AccessTokenVerificationFailure,
  VerifiedAccessToken,
} from "@repo/auth/access-token";
import type { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import { CommerceLocale, resolveStore } from "@repo/commerce/store";
import { registrationReviewerActorFromIdentityUser } from "@repo/registration/domain/actors";
import { AuthUserId } from "@repo/registration/domain/identity";
import type { RegistrationId } from "@repo/registration/domain/identity";
import {
  CreateRegistrationResponse,
  ListRegistrationsResponse,
  REGISTRATION_DECIDE_PERMISSION,
  REGISTRATION_READ_PERMISSION,
  RegistrationApiAuthenticationUnavailable,
  RegistrationApiBadRequest,
  RegistrationApiForbidden,
  RegistrationApiUnauthorized,
  RegistrationApiValidationError,
  RegistrationDecisionAccessMiddleware,
  RegistrationDecisionAcceptedResponse,
  RegistrationHttpApi,
  RegistrationReadAccessMiddleware,
  RegistrationReviewerContext,
  RegistrationSchemaErrorMiddleware,
  toCompanyRegistrationDetails,
  toRegistrationDetailResponse,
  toRegistrationCreateApiError,
  toRegistrationInternalApiError,
  toRegistrationQueryApiError,
  toRegistrationReadApiError,
  toRegistrationTransitionApiError,
} from "@repo/registration/http/registration-api";
import type { RegistrationApiError } from "@repo/registration/http/registration-api";
import { submitRegistrationForReview } from "@repo/registration/programs/registration-intake";
import { acceptRegistrationReviewDecision } from "@repo/registration/programs/registration-review";
import type { RegistrationReviewWorkflowDecision } from "@repo/registration/programs/registration-review";
import { IdentityUsers } from "@repo/registration/services/identity-users";
import type { Invitations } from "@repo/registration/services/invitations";
import type { RegistrationMarketPolicy } from "@repo/registration/services/registration-market-policy";
import { RegistrationQueries } from "@repo/registration/services/registration-queries";
import { Registrations } from "@repo/registration/services/registrations";
import type { VatValidator } from "@repo/registration/services/vat-validator";
import { Cause, Effect, Layer } from "effect";
import type { Config, Redacted } from "effect";
import {
  HttpRouter,
  HttpServer,
  HttpServerRequest,
} from "effect/unstable/http";
import { HttpApiBuilder, HttpApiMiddleware } from "effect/unstable/httpapi";

import { parseBearerAuthorization } from "../auth/bearer-token";

type RegistrationRuntimeLayer = Layer.Layer<
  | Registrations
  | RegistrationQueries
  | CommerceAccounts
  | IdentityUsers
  | RegistrationMarketPolicy
  | VatValidator
  | Invitations,
  unknown
>;
type RegistrationAuthenticationLayer = Layer.Layer<
  AccessTokenVerifier,
  Config.ConfigError
>;

export interface RegistrationHttpDependencies {
  readonly authenticationLayer: RegistrationAuthenticationLayer;
  readonly layer: RegistrationRuntimeLayer;
  readonly resumeRegistrationWorkflow: (
    registrationId: string,
    decision: RegistrationReviewWorkflowDecision
  ) => Effect.Effect<void, RegistrationApiError>;
  readonly startRegistrationWorkflow: (
    registrationId: string
  ) => Effect.Effect<unknown, RegistrationApiError>;
}

const unauthorized = () =>
  new RegistrationApiUnauthorized({ message: "Authentication is required." });

const forbidden = () =>
  new RegistrationApiForbidden({
    message: "Registration administration access is denied.",
  });

const authenticationUnavailable = () =>
  new RegistrationApiAuthenticationUnavailable({
    message: "Authentication is temporarily unavailable.",
  });

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
  Effect.gen(function* verifyRegistrationAccess() {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const authorization = parseBearerAuthorization(
      request.headers.authorization,
      credential
    );

    if (authorization._tag !== "Token") {
      return yield* Effect.fail(unauthorized());
    }

    return yield* verifier.verify(authorization.token).pipe(
      Effect.tapError((error) =>
        error._tag === "AccessTokenVerificationFailure"
          ? logRegistrationAuthenticationFailure(error)
          : Effect.void
      ),
      Effect.mapError((error) =>
        error._tag === "AccessTokenInvalid"
          ? unauthorized()
          : authenticationUnavailable()
      ),
      Effect.flatMap((verifiedToken) =>
        verifiedToken.permissions?.includes(requiredPermission)
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
              Effect.tapError((error) =>
                error._tag === "IdentityUserLookupFailure"
                  ? logRegistrationAuthenticationFailure(error)
                  : Effect.void
              ),
              Effect.mapError((error) =>
                error._tag === "IdentityUserNotFound"
                  ? unauthorized()
                  : authenticationUnavailable()
              ),
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
    () =>
      Effect.fail(
        new RegistrationApiBadRequest({
          message: "The registration request is invalid.",
        })
      )
  );

const makeRegistrationHttpHandlers = ({
  resumeRegistrationWorkflow,
  startRegistrationWorkflow,
}: Pick<
  RegistrationHttpDependencies,
  "resumeRegistrationWorkflow" | "startRegistrationWorkflow"
>) =>
  HttpApiBuilder.group(
    RegistrationHttpApi,
    "registrations",
    Effect.fn(function* buildRegistrationHttpHandlers(handlers) {
      const registrations = yield* Registrations;
      const queries = yield* RegistrationQueries;

      const acceptDecision = (input: {
        readonly decision: "approved" | "rejected";
        readonly reason?: string;
        readonly registrationId: RegistrationId;
      }) =>
        Effect.gen(function* acceptRegistrationDecision() {
          const reviewer = yield* RegistrationReviewerContext;
          yield* acceptRegistrationReviewDecision({
            decision: input.decision,
            registrationId: input.registrationId,
            resumeWorkflow: (registrationId, decision) =>
              resumeRegistrationWorkflow(String(registrationId), decision),
            reviewer,
            ...(input.reason === undefined ? {} : { reason: input.reason }),
          });

          return new RegistrationDecisionAcceptedResponse({
            registrationId: input.registrationId,
            status: "approval_processing",
          });
        }).pipe(
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
          Effect.mapError((error) =>
            error._tag === "RegistrationApiError"
              ? toRegistrationInternalApiError()
              : toRegistrationTransitionApiError(error)
          )
        );

      return handlers
        .handle("create", ({ headers, payload }) =>
          Effect.gen(function* createRegistration() {
            const details = toCompanyRegistrationDetails(payload);
            const registration = yield* submitRegistrationForReview({
              details,
              storeKey: resolveStore({
                locale: CommerceLocale.make(headers["x-context-locale"]),
              }).storeKey,
            }).pipe(Effect.withSpan("registration.api.create.submit"));
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
              storeKey: registration.storeKey,
            });
          }).pipe(
            Effect.tapCause((cause) =>
              cause.reasons.some(
                (reason) =>
                  Cause.isDieReason(reason) ||
                  (Cause.isFailReason(reason) &&
                    reason.error._tag === "RegistrationPersistenceFailure")
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
            Effect.mapError((error) =>
              error._tag === "RegistrationIntakeValidationError"
                ? new RegistrationApiValidationError({
                    message: error.message,
                    reasons: error.reasons,
                  })
                : toRegistrationCreateApiError(error)
            )
          )
        )
        .handle("list", ({ query }) =>
          queries
            .list({
              ...(query.status === undefined ? {} : { status: query.status }),
              ...(query.search === undefined ? {} : { search: query.search }),
              ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
              ...(query.limit === undefined ? {} : { limit: query.limit }),
            })
            .pipe(
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
              Effect.annotateLogs({
                operation: "registration.api.list",
                service: "registration-api",
              }),
              Effect.mapError(toRegistrationQueryApiError)
            )
        )
        .handle("get", ({ params }) =>
          registrations
            .get(params.registrationId)
            .pipe(
              Effect.map(toRegistrationDetailResponse),
              Effect.mapError(toRegistrationReadApiError)
            )
        )
        .handle("approve", ({ params, payload }) =>
          acceptDecision({
            decision: "approved",
            registrationId: params.registrationId,
            ...(payload.reason === undefined ? {} : { reason: payload.reason }),
          })
        )
        .handle("reject", ({ params, payload }) =>
          acceptDecision({
            decision: "rejected",
            registrationId: params.registrationId,
            ...(payload.reason === undefined ? {} : { reason: payload.reason }),
          })
        );
    })
  );

const makeRegistrationHttpApiLayer = (
  dependencies: RegistrationHttpDependencies
) =>
  HttpApiBuilder.layer(RegistrationHttpApi).pipe(
    Layer.provide(makeRegistrationHttpHandlers(dependencies)),
    Layer.provide(registrationSchemaErrorMiddlewareLayer),
    Layer.provide(registrationReadAccessMiddlewareLayer),
    Layer.provide(registrationDecisionAccessMiddlewareLayer),
    Layer.provideMerge(dependencies.authenticationLayer),
    Layer.provideMerge(dependencies.layer),
    Layer.provide(HttpServer.layerServices)
  );

export const makeRegistrationHttpHandler = (
  dependencies: RegistrationHttpDependencies
) =>
  HttpRouter.toWebHandler(makeRegistrationHttpApiLayer(dependencies), {
    disableLogger: true,
  });
