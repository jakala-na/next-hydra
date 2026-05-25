import "server-only";

import type {
  ApproveRegistrationInput,
  RegistrationDecisionResult,
  RegistrationDetailStatus,
  RegistrationDetailView,
  RejectRegistrationInput,
} from "@repo/registration-effect/components/admin/registration-view-models";
import type {
  ListRegistrationsResponse,
  RegistrationDecisionResponse,
  RegistrationDetailResponse,
} from "@repo/registration-effect/http/registration-api";
import { env } from "@/env";
import {
  ADMIN_REGISTRATION_DECIDE_PERMISSION,
  getAdminActor,
  requireAdminPermission,
} from "./admin-auth";
import {
  fetchRegistrationRest,
  RegistrationRestError,
} from "./registration-rest-client";

export type ListAdminRegistrationsEffectInput = {
  readonly status?: RegistrationDetailStatus;
  readonly search?: string;
  readonly cursor?: string;
  readonly limit?: number;
};

export type ListAdminRegistrationsEffectResult = {
  readonly items: RegistrationDetailView[];
  readonly nextCursor?: string;
};

const EFFECT_REGISTRATION_STATUSES = [
  "awaiting_approval",
  "approved",
  "rejected",
] as const satisfies readonly RegistrationDetailStatus[];

const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

const isEffectRegistrationStatus = (
  status: RegistrationDetailStatus | undefined
): status is (typeof EFFECT_REGISTRATION_STATUSES)[number] =>
  Boolean(
    status &&
      EFFECT_REGISTRATION_STATUSES.includes(
        status as (typeof EFFECT_REGISTRATION_STATUSES)[number]
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

const buildListPath = (input: ListAdminRegistrationsEffectInput) => {
  const params = new URLSearchParams();

  if (isEffectRegistrationStatus(input.status)) {
    params.set("status", input.status);
  }

  if (input.search) {
    params.set("search", input.search);
  }

  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  if (input.limit) {
    params.set("limit", String(input.limit));
  }

  const query = params.toString();
  return query ? `/registrations?${query}` : "/registrations";
};

export async function listAdminRegistrationsEffect(
  input: ListAdminRegistrationsEffectInput
): Promise<ListAdminRegistrationsEffectResult> {
  await requireAdminPermission("registration.read");

  const result = await fetchRegistrationRest<ListRegistrationsResponse>(
    buildListPath(input)
  );
  const items = result.items.map(toRegistrationDetailView);

  return result.nextCursor
    ? { items, nextCursor: result.nextCursor }
    : { items };
}

export async function getAdminRegistrationEffect(input: {
  readonly registrationId: string;
}): Promise<RegistrationDetailView | null> {
  await requireAdminPermission("registration.read");

  try {
    return toRegistrationDetailView(
      await fetchRegistrationRest<RegistrationDetailResponse>(
        `/registrations/${input.registrationId}`
      )
    );
  } catch (error) {
    if (
      error instanceof RegistrationRestError &&
      error.status === HTTP_NOT_FOUND
    ) {
      return null;
    }

    throw error;
  }
}

const decisionFailure = (error: unknown): RegistrationDecisionResult => {
  if (error instanceof RegistrationRestError) {
    switch (error.status) {
      case HTTP_NOT_FOUND:
        return {
          _tag: "NotFound",
          message: "This registration could not be found anymore.",
        };
      case HTTP_CONFLICT:
        return {
          _tag: "Conflict",
          message:
            "This registration cannot be updated in its current workflow state.",
        };
      default:
        break;
    }
  }

  return {
    _tag: "Failure",
    message: "The decision could not be saved. Please try again.",
  };
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
    return {
      _tag: "Failure",
      message:
        "REGISTRATION_APPROVAL_SECRET must be configured to decide registrations.",
    };
  }

  try {
    const result = await fetchRegistrationRest<RegistrationDecisionResponse>(
      `/registrations/${input.registrationId}/${input.decision === "approved" ? "approve" : "reject"}`,
      {
        method: "POST",
        headers: {
          "x-registration-approval-secret": env.REGISTRATION_APPROVAL_SECRET,
        },
        body: JSON.stringify({
          reviewer: {
            authUserId: session.user.id,
            email: actor.actorEmail,
            name: actor.actorName || actor.actorEmail,
          },
          ...(input.reason ? { reason: input.reason } : {}),
        }),
      }
    );

    return {
      _tag: "Success",
      registrationId: String(result.registrationId),
      status: result.status,
    };
  } catch (error) {
    return decisionFailure(error);
  }
};

export async function approveRegistrationEffect(
  input: ApproveRegistrationInput
): Promise<RegistrationDecisionResult> {
  return await decideRegistration({ ...input, decision: "approved" });
}

export async function rejectRegistrationEffect(
  input: RejectRegistrationInput
): Promise<RegistrationDecisionResult> {
  return await decideRegistration({ ...input, decision: "rejected" });
}
