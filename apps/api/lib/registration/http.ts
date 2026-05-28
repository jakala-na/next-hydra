import type { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import {
  CreateRegistrationResponse,
  ListRegistrationsResponse,
  RegistrationApiError,
  RegistrationApiUnauthorized,
  RegistrationApiValidationError,
  RegistrationDecisionAcceptedResponse,
  RegistrationHttpApi,
  toApiError,
  toCompanyRegistrationDetails,
  toRegistrationDetailResponse,
  toReviewerActor,
} from "@repo/registration/http/registration-api";
import {
  RegistrationIntakeValidationError,
  submitRegistrationForReview,
} from "@repo/registration/programs/registration-intake";
import { acceptRegistrationReviewDecision } from "@repo/registration/programs/registration-review";
import type { IdentityUsers } from "@repo/registration/services/identity-users";
import type { Invitations } from "@repo/registration/services/invitations";
import type { RegistrationMarketPolicy } from "@repo/registration/services/registration-market-policy";
import { RegistrationQueries } from "@repo/registration/services/registration-queries";
import { Registrations } from "@repo/registration/services/registrations";
import type { VatValidator } from "@repo/registration/services/vat-validator";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import type { RegistrationWorkflowDecision } from "../registration-workflow-contract";

type RegistrationRuntimeLayer = Layer.Layer<
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

export interface RegistrationHttpDependencies {
  readonly approvalSecret: string;
  readonly layer: RegistrationRuntimeLayer;
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
    | RegistrationIntakeValidationError
    | RegistrationApiValidationError
    | RegistrationApiUnauthorized
) => {
  if (
    error instanceof RegistrationApiError ||
    error instanceof RegistrationApiValidationError ||
    error instanceof RegistrationApiUnauthorized
  ) {
    return error;
  }

  if (error instanceof RegistrationIntakeValidationError) {
    return new RegistrationApiValidationError({
      message: error.message,
      reasons: error.reasons,
    });
  }

  return toApiError(error);
};

const makeRegistrationHttpHandlers = ({
  approvalSecret,
  resumeRegistrationWorkflow,
  startRegistrationWorkflow,
}: Pick<
  RegistrationHttpDependencies,
  "approvalSecret" | "resumeRegistrationWorkflow" | "startRegistrationWorkflow"
>) =>
  HttpApiBuilder.group(
    RegistrationHttpApi,
    "registrations",
    Effect.fn(function* (handlers) {
      const registrations = yield* Registrations;
      const queries = yield* RegistrationQueries;

      return handlers
        .handle("create", ({ payload }) =>
          Effect.gen(function* () {
            const details = toCompanyRegistrationDetails(payload);
            const registration = yield* submitRegistrationForReview({
              details,
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
            yield* acceptRegistrationReviewDecision({
              decision: "approved",
              registrationId: params.registrationId,
              resumeWorkflow: (registrationId, decision) =>
                resumeRegistrationWorkflow(String(registrationId), decision),
              reviewer: toReviewerActor(payload.reviewer),
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
            yield* acceptRegistrationReviewDecision({
              decision: "rejected",
              registrationId: params.registrationId,
              resumeWorkflow: (registrationId, decision) =>
                resumeRegistrationWorkflow(String(registrationId), decision),
              reviewer: toReviewerActor(payload.reviewer),
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

const makeRegistrationHttpApiLayer = (
  dependencies: RegistrationHttpDependencies
) =>
  HttpApiBuilder.layer(RegistrationHttpApi, {
    openapiPath: "/openapi.json",
  }).pipe(
    Layer.provide(makeRegistrationHttpHandlers(dependencies)),
    Layer.provide(dependencies.layer),
    Layer.provide(HttpServer.layerServices)
  );

export const makeRegistrationHttpHandler = (
  dependencies: RegistrationHttpDependencies
) =>
  HttpRouter.toWebHandler(makeRegistrationHttpApiLayer(dependencies), {
    disableLogger: true,
  });
