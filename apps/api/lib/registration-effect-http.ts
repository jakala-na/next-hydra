import {
  CreateRegistrationResponse,
  ListRegistrationsResponse,
  RegistrationApiError,
  RegistrationApiUnauthorized,
  RegistrationDecisionAcceptedResponse,
  RegistrationHttpApi,
  type RegistrationReviewerInput,
  toApiError,
  toCompanyRegistrationDetails,
  toRegistrationDetailResponse,
} from "@repo/registration-effect/http/registration-api";
import type { CommerceAccounts } from "@repo/registration-effect/services/commerce-account";
import type { Invitations } from "@repo/registration-effect/services/invitations";
import { RegistrationQueries } from "@repo/registration-effect/services/registration-queries";
import { Registrations } from "@repo/registration-effect/services/registrations";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import type { RegistrationWorkflowDecision } from "./registration-workflow-contract";

type RegistrationEffectRuntimeLayer = Layer.Layer<
  Registrations | RegistrationQueries | CommerceAccounts | Invitations,
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
  error: Parameters<typeof toApiError>[0] | RegistrationApiError
) => (error instanceof RegistrationApiError ? error : toApiError(error));

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

      return handlers
        .handle("create", ({ payload }) =>
          registrations
            .createAwaitingApproval({
              details: toCompanyRegistrationDetails(payload),
            })
            .pipe(
              Effect.tap((registration) =>
                startRegistrationWorkflow(String(registration.id))
              ),
              Effect.map(
                (registration) =>
                  new CreateRegistrationResponse({
                    registrationId: registration.id,
                    status: "awaiting_approval",
                  })
              ),
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
          authorizeAdmin(
            approvalSecret,
            headers["x-registration-approval-secret"]
          ).pipe(
            Effect.andThen(
              resumeRegistrationWorkflow(String(params.registrationId), {
                decision: "approved",
                reviewer: toWorkflowReviewer(payload.reviewer),
                ...(payload.reason === undefined
                  ? {}
                  : { reason: payload.reason }),
              })
            ),
            Effect.as(
              new RegistrationDecisionAcceptedResponse({
                registrationId: params.registrationId,
                status: "approval_processing",
              })
            )
          )
        )
        .handle("reject", ({ headers, params, payload }) =>
          authorizeAdmin(
            approvalSecret,
            headers["x-registration-approval-secret"]
          ).pipe(
            Effect.andThen(
              resumeRegistrationWorkflow(String(params.registrationId), {
                decision: "rejected",
                reviewer: toWorkflowReviewer(payload.reviewer),
                ...(payload.reason === undefined
                  ? {}
                  : { reason: payload.reason }),
              })
            ),
            Effect.as(
              new RegistrationDecisionAcceptedResponse({
                registrationId: params.registrationId,
                status: "approval_processing",
              })
            )
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
