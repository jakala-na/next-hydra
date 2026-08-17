import "server-only";
import { RegistrationId } from "@repo/registration";
import type {
  ApproveRegistrationInput,
  RegistrationDetailStatus,
  RegistrationDetailView,
} from "@repo/registration/components/admin/registration-view-models";
import {
  ListRegistrationsQuery,
  PublicRegistrationNotFound,
  RegistrationDecisionRequest,
} from "@repo/registration/http/registration-api";
import type { RegistrationDetailResponse } from "@repo/registration/http/registration-api";
import { registrationDecisionOutcomeUnknown } from "@repo/registration/public-errors";
import { Effect, Schema } from "effect";

import {
  ADMIN_REGISTRATION_READ_PERMISSION,
  requireAdminPermission,
} from "./admin-auth";
import { makeRegistrationRestClient } from "./registration-rest-client";

export type ListAdminRegistrationsInput = {
  readonly status?: RegistrationDetailStatus;
  readonly search?: string;
  readonly cursor?: string;
  readonly limit?: number;
};

export type ListAdminRegistrationsResult = {
  readonly items: RegistrationDetailView[];
  readonly nextCursor?: string;
};

const REGISTRATION_REVIEW_STATUSES = [
  "awaiting_approval",
  "approved",
  "rejected",
] as const satisfies readonly RegistrationDetailStatus[];

const logDecisionFailure = (
  input: ApproveRegistrationInput & {
    readonly decision: "approved" | "rejected";
  },
  error: unknown
) =>
  Effect.logError("Failed to save registration decision", error).pipe(
    Effect.annotateLogs({
      operation: "registration.admin.decision.save",
      "registration.decision": input.decision,
      "registration.id": input.registrationId,
      service: "web-admin",
    }),
    Effect.withLogSpan("registration.admin.decision.save")
  );

const isRegistrationReviewStatus = (
  status: RegistrationDetailStatus | undefined
): status is (typeof REGISTRATION_REVIEW_STATUSES)[number] =>
  Boolean(
    status &&
    REGISTRATION_REVIEW_STATUSES.includes(
      status as (typeof REGISTRATION_REVIEW_STATUSES)[number]
    )
  );

const toRegistrationDetailView = (
  registration: RegistrationDetailResponse
): RegistrationDetailView => ({
  registrationId: String(registration.registrationId),
  status: registration.status,
  companyName: registration.companyName,
  companyPhone: registration.companyPhone,
  vatId: registration.vatId,
  contactFirstName: registration.contactFirstName,
  contactLastName: registration.contactLastName,
  email: registration.email,
  address: registration.address,
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

export async function listAdminRegistrations(
  input: ListAdminRegistrationsInput
): Promise<ListAdminRegistrationsResult> {
  const session = await requireAdminPermission(
    ADMIN_REGISTRATION_READ_PERMISSION
  );

  const result = await Effect.runPromise(
    Effect.gen(function* result() {
      const client = yield* makeRegistrationRestClient(session.accessToken);
      return yield* client.registrations.list({
        query: new ListRegistrationsQuery({
          ...(isRegistrationReviewStatus(input.status)
            ? { status: input.status }
            : {}),
          ...(input.search ? { search: input.search } : {}),
          ...(input.cursor ? { cursor: input.cursor } : {}),
          ...(input.limit ? { limit: input.limit } : {}),
        }),
      });
    })
  );
  const items = result.items.map(toRegistrationDetailView);

  return result.nextCursor
    ? { items, nextCursor: result.nextCursor }
    : { items };
}

export async function getAdminRegistration(input: {
  readonly registrationId: string;
}): Promise<RegistrationDetailView | null> {
  const session = await requireAdminPermission(
    ADMIN_REGISTRATION_READ_PERMISSION
  );

  try {
    return toRegistrationDetailView(
      await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* makeRegistrationRestClient(session.accessToken);
          return yield* client.registrations.get({
            params: {
              registrationId: RegistrationId.make(input.registrationId),
            },
          });
        })
      )
    );
  } catch (error) {
    if (Schema.is(PublicRegistrationNotFound)(error)) {
      return null;
    }

    throw error;
  }
}

export const decideAdminRegistration = Effect.fn("AdminRegistration.decide")(
  function* decideAdminRegistrationEffect(
    input: ApproveRegistrationInput & {
      readonly decision: "approved" | "rejected";
    },
    accessToken: string
  ) {
    const client = yield* makeRegistrationRestClient(accessToken);
    const request = {
      params: {
        registrationId: RegistrationId.make(input.registrationId),
      },
      payload: new RegistrationDecisionRequest(
        input.reason ? { reason: input.reason } : {}
      ),
    };
    const result = yield* (
      input.decision === "approved"
        ? client.registrations.approve(request)
        : client.registrations.reject(request)
    ).pipe(
      Effect.catchTags({
        HttpClientError: (error) =>
          error.reason._tag === "TransportError"
            ? Effect.fail(
                registrationDecisionOutcomeUnknown(
                  RegistrationId.make(input.registrationId)
                )
              )
            : Effect.die(error),
        InputInvalid: Effect.die,
        RegistrationHttpResponseError: (error) =>
          Effect.logError(
            "Registration decision response violated its HTTP contract",
            error.cause
          ).pipe(
            Effect.andThen(
              Effect.fail(
                registrationDecisionOutcomeUnknown(
                  RegistrationId.make(input.registrationId)
                )
              )
            )
          ),
        SchemaError: Effect.die,
        Unexpected: Effect.die,
      }),
      Effect.tapError((error) => logDecisionFailure(input, error)),
      Effect.annotateLogs({
        operation: "registration.admin.decision.submit",
        "registration.decision": input.decision,
        "registration.id": input.registrationId,
        service: "web-admin",
      }),
      Effect.annotateSpans({
        "registration.decision": input.decision,
        "registration.id": input.registrationId,
        "registration.operation": "decision.submit",
      }),
      Effect.withSpan("registration.admin.decision.submit")
    );

    return {
      registrationId: result.registrationId,
      registrationStatus: result.status,
    };
  }
);
