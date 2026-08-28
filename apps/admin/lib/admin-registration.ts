import "server-only";
import { toError } from "@repo/errors/boundary";
import { RegistrationId } from "@repo/registration";
import type {
  RegistrationDetailStatus,
  RegistrationDetailView,
} from "@repo/registration/components/admin/registration-view-models";
import {
  ListRegistrationsQuery,
  PublicRegistrationNotFound,
} from "@repo/registration/http/registration-api";
import type { RegistrationDetailResponse } from "@repo/registration/http/registration-api";
import { Effect, Schema } from "effect";

import {
  ADMIN_REGISTRATION_READ_PERMISSION,
  requireAdminPermission,
} from "./admin-auth";
import {
  RegistrationClient,
  registrationClientLayer,
} from "./registration-rest-client";

export {
  decideAdminRegistration,
  decideAdminRegistrationWithClient,
} from "./admin-registration-decide";

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

const ADMIN_REGISTRATION_STATUSES = [
  "awaiting_approval",
  "approved",
  "rejected",
] as const satisfies readonly RegistrationDetailStatus[];

const toRegistrationRequestError = (cause: unknown) =>
  toError(cause, "The registration request failed.");

const runRegistrationRequest = async <A, E>(
  program: Effect.Effect<A, E>
): Promise<A> =>
  await Effect.runPromise(
    program.pipe(
      Effect.mapError(toRegistrationRequestError),
      Effect.catchDefect((defect) =>
        Effect.die(toRegistrationRequestError(defect))
      )
    )
  );

const isRegistrationReviewStatus = (
  status: RegistrationDetailStatus | undefined
): status is (typeof ADMIN_REGISTRATION_STATUSES)[number] => {
  if (status === undefined) {
    return false;
  }

  for (const reviewStatus of ADMIN_REGISTRATION_STATUSES) {
    if (status === reviewStatus) {
      return true;
    }
  }

  return false;
};

const buildListRegistrationsQuery = (input: ListAdminRegistrationsInput) => {
  const query = {};

  if (isRegistrationReviewStatus(input.status)) {
    Object.assign(query, { status: input.status });
  }
  if (input.search !== undefined && input.search !== "") {
    Object.assign(query, { search: input.search });
  }
  if (input.cursor !== undefined && input.cursor !== "") {
    Object.assign(query, { cursor: input.cursor });
  }
  if (input.limit !== undefined && input.limit !== 0) {
    Object.assign(query, { limit: input.limit });
  }

  return query;
};

const toRegistrationDetailView = (
  registration: RegistrationDetailResponse
): RegistrationDetailView => {
  const detail: RegistrationDetailView = {
    address: registration.address,
    companyName: registration.companyName,
    companyPhone: registration.companyPhone,
    contactFirstName: registration.contactFirstName,
    contactLastName: registration.contactLastName,
    createdAt: registration.createdAt,
    email: registration.email,
    registrationId: String(registration.registrationId),
    status: registration.status,
    updatedAt: registration.updatedAt,
    vatId: registration.vatId,
  };

  if (registration.invitationId !== undefined) {
    Object.assign(detail, {
      invitationId: String(registration.invitationId),
    });
  }
  if (registration.approvedAt !== undefined && registration.approvedAt !== "") {
    Object.assign(detail, { approvedAt: registration.approvedAt });
  }
  if (registration.rejectedAt !== undefined && registration.rejectedAt !== "") {
    Object.assign(detail, { rejectedAt: registration.rejectedAt });
  }
  if (
    registration.approvalReason !== undefined &&
    registration.approvalReason !== ""
  ) {
    Object.assign(detail, { approvalReason: registration.approvalReason });
  }
  if (registration.actorEmail !== undefined && registration.actorEmail !== "") {
    Object.assign(detail, { actorEmail: registration.actorEmail });
  }
  if (registration.actorName !== undefined && registration.actorName !== "") {
    Object.assign(detail, { actorName: registration.actorName });
  }

  return detail;
};

export async function listAdminRegistrations(
  input: ListAdminRegistrationsInput
): Promise<ListAdminRegistrationsResult> {
  const session = await requireAdminPermission(
    ADMIN_REGISTRATION_READ_PERMISSION
  );

  const result = await runRegistrationRequest(
    Effect.gen(function* listAdminRegistrationsEffect() {
      const client = yield* RegistrationClient;
      return yield* client.registrations.list({
        query: new ListRegistrationsQuery(buildListRegistrationsQuery(input)),
      });
    }).pipe(Effect.provide(registrationClientLayer(session.accessToken)))
  );
  const items = result.items.map(toRegistrationDetailView);

  if (result.nextCursor !== undefined && result.nextCursor !== "") {
    return { items, nextCursor: result.nextCursor };
  }

  return { items };
}

export async function getAdminRegistration(input: {
  readonly registrationId: string;
}): Promise<RegistrationDetailView | null> {
  const session = await requireAdminPermission(
    ADMIN_REGISTRATION_READ_PERMISSION
  );

  return await runRegistrationRequest(
    Effect.gen(function* getAdminRegistrationEffect() {
      const client = yield* RegistrationClient;
      return yield* client.registrations.get({
        params: {
          registrationId: RegistrationId.make(input.registrationId),
        },
      });
    }).pipe(
      Effect.map(toRegistrationDetailView),
      Effect.catchIf(Schema.is(PublicRegistrationNotFound), () =>
        Effect.succeed(null)
      ),
      Effect.provide(registrationClientLayer(session.accessToken))
    )
  );
}
