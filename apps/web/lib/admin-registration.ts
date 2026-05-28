import "server-only";

import { sentryEffectTelemetryLayer } from "@repo/observability/effect";
import { RegistrationId } from "@repo/registration";
import type {
  ApproveRegistrationInput,
  RegistrationDecisionResult,
  RegistrationDetailStatus,
  RegistrationDetailView,
  RejectRegistrationInput,
} from "@repo/registration/components/admin/registration-view-models";
import {
  ListRegistrationsQuery,
  RegistrationAlreadyApproved,
  RegistrationAlreadyRejected,
  RegistrationApiConflict,
  RegistrationApiNotFound,
  RegistrationDecisionAlreadyProcessing,
  RegistrationDecisionRequest,
  type RegistrationDetailResponse,
  RegistrationReviewerInput,
} from "@repo/registration/http/registration-api";
import { Effect } from "effect";
import { env } from "@/env";
import {
  ADMIN_REGISTRATION_DECIDE_PERMISSION,
  getAdminActor,
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
  input: (ApproveRegistrationInput | RejectRegistrationInput) & {
    readonly decision: "approved" | "rejected";
  },
  error: unknown
): Promise<void> => {
  return Effect.runPromise(
    Effect.logError("Failed to save registration decision", error).pipe(
      Effect.annotateLogs({
        operation: "registration.admin.decision.save",
        "registration.decision": input.decision,
        "registration.id": input.registrationId,
        service: "web-admin",
      }),
      Effect.withLogSpan("registration.admin.decision.save"),
      Effect.provide(sentryEffectTelemetryLayer)
    )
  );
};

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
  await requireAdminPermission("registration.read");

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* makeRegistrationRestClient();
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
  await requireAdminPermission("registration.read");

  try {
    return toRegistrationDetailView(
      await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* makeRegistrationRestClient();
          return yield* client.registrations.get({
            params: {
              registrationId: RegistrationId.make(input.registrationId),
            },
          });
        })
      )
    );
  } catch (error) {
    if (error instanceof RegistrationApiNotFound) {
      return null;
    }

    throw error;
  }
}

const decisionFailure = (error: unknown): RegistrationDecisionResult => {
  if (error instanceof RegistrationApiNotFound) {
    return {
      status: "invalid",
      fieldErrors: [],
      formErrors: [
        {
          code: "registrationNotFound",
        },
      ],
    };
  }

  if (error instanceof RegistrationAlreadyApproved) {
    return {
      status: "invalid",
      fieldErrors: [],
      formErrors: [
        {
          code: "registrationAlreadyApproved",
        },
      ],
    };
  }

  if (error instanceof RegistrationAlreadyRejected) {
    return {
      status: "invalid",
      fieldErrors: [],
      formErrors: [
        {
          code: "registrationAlreadyRejected",
        },
      ],
    };
  }

  if (
    error instanceof RegistrationDecisionAlreadyProcessing ||
    error instanceof RegistrationApiConflict
  ) {
    return {
      status: "invalid",
      fieldErrors: [],
      formErrors: [
        {
          code: "registrationDecisionAlreadyProcessing",
        },
      ],
    };
  }

  throw error;
};

const decideRegistration = async (
  input: (ApproveRegistrationInput | RejectRegistrationInput) & {
    readonly decision: "approved" | "rejected";
  }
): Promise<RegistrationDecisionResult> => {
  const session = await requireAdminPermission(
    ADMIN_REGISTRATION_DECIDE_PERMISSION
  );
  const actor = await getAdminActor();

  if (!env.REGISTRATION_APPROVAL_SECRET) {
    throw new Error(
      "REGISTRATION_APPROVAL_SECRET must be configured to decide registrations."
    );
  }

  const approvalSecret = env.REGISTRATION_APPROVAL_SECRET;

  try {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* makeRegistrationRestClient();
        const request = {
          params: {
            registrationId: RegistrationId.make(input.registrationId),
          },
          headers: {
            "x-registration-approval-secret": approvalSecret,
          },
          payload: new RegistrationDecisionRequest({
            reviewer: new RegistrationReviewerInput({
              authUserId: session.user.id,
              email: actor.actorEmail,
              name: actor.actorName || actor.actorEmail,
            }),
            ...(input.reason ? { reason: input.reason } : {}),
          }),
        };

        return input.decision === "approved"
          ? yield* client.registrations.approve(request)
          : yield* client.registrations.reject(request);
      }).pipe(
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
        Effect.withSpan("registration.admin.decision.submit"),
        Effect.provide(sentryEffectTelemetryLayer)
      )
    );

    return {
      status: "accepted",
      registrationId: String(result.registrationId),
      registrationStatus: result.status,
    };
  } catch (error) {
    await logDecisionFailure(input, error);
    return decisionFailure(error);
  }
};

export async function approveRegistration(
  input: ApproveRegistrationInput
): Promise<RegistrationDecisionResult> {
  return await decideRegistration({ ...input, decision: "approved" });
}

export async function rejectRegistration(
  input: RejectRegistrationInput
): Promise<RegistrationDecisionResult> {
  return await decideRegistration({ ...input, decision: "rejected" });
}
