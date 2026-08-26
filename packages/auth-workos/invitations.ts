import {
  CompanyMemberInvitationId,
  CommerceBusinessUnitId,
  Email,
  InvitationId,
  RegistrationId,
} from "@repo/registration/domain/identity";
import {
  AcceptedInvitation,
  InvitationDelivery,
  PendingInvitation,
  RevokedInvitation,
} from "@repo/registration/domain/invitations";
import { CompanyRoles } from "@repo/registration/domain/roles";
import { CompanyMemberIdentityProjection } from "@repo/registration/services/company-member-identity-projection";
import type { ProjectAcceptedCompanyMemberIdentityInput } from "@repo/registration/services/company-member-identity-projection";
import {
  CompanyMemberInvitations,
  InvitationConflict,
  InvitationDeliveries,
  InvitationExpired,
  InvitationIssueOutcomeUnknown,
  InvitationNotFound,
  InvitationProviderFailure,
  RegistrationInvitations,
} from "@repo/registration/services/invitations";
import type {
  CompanyMemberInvitationIssueInput,
  CompanyMemberInvitationRevocationInput,
  RegistrationInvitationAcceptanceInput,
  RegistrationInvitationIssueInput,
  RegistrationInvitationRevocationInput,
} from "@repo/registration/services/invitations";
import { RegistrationInvitationIssueAttempts } from "@repo/registration/services/registration-invitation-issue-attempts";
import type { RegistrationInvitationIssueAttemptsService } from "@repo/registration/services/registration-invitation-issue-attempts";
import {
  ApiKeyRequiredException,
  BadRequestException,
  NoApiKeyProvidedException,
  NotFoundException,
  RateLimitExceededException,
  UnauthorizedException,
  UnprocessableEntityException,
  WorkOS,
} from "@workos-inc/node";
import type {
  Invitation as WorkosInvitation,
  SendInvitationOptions as WorkosSendInvitationOptions,
} from "@workos-inc/node";
import {
  Config,
  Context,
  DateTime,
  Effect,
  Layer,
  Option,
  Redacted,
  Schema,
} from "effect";

export type {
  Invitation as WorkosInvitation,
  SendInvitationOptions as WorkosSendInvitationOptions,
} from "@workos-inc/node";

type WorkosSdk = Pick<WorkOS, "userManagement">;
type WorkosInvitationIssueInput =
  | RegistrationInvitationIssueInput
  | CompanyMemberInvitationIssueInput;

export type WorkosInvitationSender = Pick<
  WorkosSdk["userManagement"],
  "sendInvitation"
>;

export type WorkosCompanyMemberInvitationUserManagement = Pick<
  WorkosSdk["userManagement"],
  "getInvitation" | "revokeInvitation" | "sendInvitation"
>;

export type WorkosInvitationUserManagement = WorkosInvitationSender &
  Pick<
    WorkosSdk["userManagement"],
    "getInvitation" | "revokeInvitation" | "updateUser"
  > & {
    readonly listInvitations: (input: { readonly email: string }) => Promise<{
      readonly autoPagination?: (() => Promise<WorkosInvitation[]>) | undefined;
      readonly data: readonly WorkosInvitation[];
    }>;
  };

const toDate = (value: string | null | undefined) =>
  DateTime.toDateUtc(DateTime.makeUnsafe(value ?? 0));

const invitationIdFromWorkos = (invitation: WorkosInvitation) =>
  InvitationId.make(invitation.id);

const workosIssueInputFromIntent = (
  input: WorkosInvitationIssueInput
): WorkosSendInvitationOptions => {
  const inviterUserId =
    "authUserId" in input.issuedBy ? input.issuedBy.authUserId : undefined;

  if (inviterUserId) {
    return {
      email: Redacted.value(input.intent.inviteeEmail),
      inviterUserId,
    };
  }

  return {
    email: Redacted.value(input.intent.inviteeEmail),
  };
};

const WorkosRegistrationInvitationMetadata = Schema.Struct({
  intent: Schema.Literal("registration_approval"),
  registrationId: RegistrationId,
  roles: CompanyRoles,
});

const WorkosRegistrationInvitationMetadataJson = Schema.fromJsonString(
  Schema.toCodecJson(WorkosRegistrationInvitationMetadata)
);

const WorkosCompanyMemberInvitationMetadata = Schema.Struct({
  businessUnitId: CommerceBusinessUnitId,
  companyMemberInvitationId: CompanyMemberInvitationId,
  intent: Schema.Literal("company_member"),
  roles: CompanyRoles,
});

const WorkosCompanyMemberInvitationMetadataJson = Schema.fromJsonString(
  Schema.toCodecJson(WorkosCompanyMemberInvitationMetadata)
);

const workosCompanyMemberInvitationMetadata = (
  input: ProjectAcceptedCompanyMemberIdentityInput
) =>
  Schema.encodeSync(WorkosCompanyMemberInvitationMetadataJson)({
    businessUnitId: input.intent.businessUnitId,
    companyMemberInvitationId: input.intent.companyMemberInvitationId,
    intent: input.intent.intent,
    roles: input.intent.roles,
  });

const workosRegistrationInvitationMetadata = (
  input: RegistrationInvitationAcceptanceInput
) =>
  Schema.encodeSync(WorkosRegistrationInvitationMetadataJson)({
    intent: input.intent.intent,
    registrationId: input.intent.registrationId,
    roles: input.intent.roles,
  });

const pendingFromWorkos = (
  invitation: WorkosInvitation,
  input: WorkosInvitationIssueInput
) =>
  new PendingInvitation({
    _tag: "PendingInvitation",
    acceptInvitationUrl: invitation.acceptInvitationUrl,
    createdAt: toDate(invitation.createdAt),
    expiresAt: toDate(invitation.expiresAt),
    id: invitationIdFromWorkos(invitation),
    intent: input.intent,
    issuedBy: input.issuedBy,
  });

const deliveryFromWorkos = (invitation: WorkosInvitation) =>
  new InvitationDelivery({
    acceptInvitationUrl: invitation.acceptInvitationUrl ?? undefined,
    createdAt: toDate(invitation.createdAt),
    expiresAt: toDate(invitation.expiresAt),
    id: invitationIdFromWorkos(invitation),
    inviteeEmail: Redacted.make(Email.make(invitation.email), {
      label: "email",
    }),
    status: invitation.state,
    updatedAt: toDate(invitation.updatedAt),
  });

const providerFailure = (
  operation: "issue" | "read" | "accept" | "revoke",
  cause: unknown
) =>
  new InvitationProviderFailure({
    cause,
    message: `Failed to ${operation} invitation: ${
      cause instanceof Error ? cause.message : String(cause)
    }`,
    operation,
  });

const issueOutcomeUnknown = (
  input: WorkosInvitationIssueInput,
  cause: unknown
) =>
  new InvitationIssueOutcomeUnknown({
    cause,
    message:
      input.intent.intent === "registration_approval"
        ? `WorkOS invitation issuance outcome is unknown for registration ${input.intent.registrationId}`
        : `WorkOS invitation issuance outcome is unknown for business unit ${input.intent.businessUnitId}`,
  });

const isWorkosRejectedRequest = (cause: unknown) =>
  cause instanceof ApiKeyRequiredException ||
  cause instanceof BadRequestException ||
  cause instanceof NoApiKeyProvidedException ||
  cause instanceof NotFoundException ||
  cause instanceof RateLimitExceededException ||
  cause instanceof UnauthorizedException ||
  cause instanceof UnprocessableEntityException;

const WorkosConflictException = Schema.Struct({
  status: Schema.Literal(409),
});

const issueFailure = (input: WorkosInvitationIssueInput, cause: unknown) => {
  if (Schema.is(WorkosConflictException)(cause)) {
    return new InvitationConflict({
      message: "WorkOS already has a conflicting invitation",
    });
  }

  return isWorkosRejectedRequest(cause)
    ? providerFailure("issue", cause)
    : issueOutcomeUnknown(input, cause);
};

const readFailure = (invitationId: InvitationId, cause: unknown) =>
  cause instanceof NotFoundException
    ? new InvitationNotFound({
        invitationId,
        message: `Invitation ${invitationId} was not found`,
      })
    : providerFailure("read", cause);

const revokeFailure = (invitationId: InvitationId, cause: unknown) =>
  cause instanceof NotFoundException
    ? new InvitationNotFound({
        invitationId,
        message: `Invitation ${invitationId} was not found`,
      })
    : providerFailure("revoke", cause);

const normalizedEmail = (email: string) => email.trim().toLowerCase();

const isActiveRegistrationInvitation = (
  invitation: WorkosInvitation,
  input: RegistrationInvitationIssueInput
) =>
  (invitation.state === "pending" || invitation.state === "accepted") &&
  invitation.inviterUserId === null &&
  normalizedEmail(invitation.email) ===
    normalizedEmail(Redacted.value(input.intent.inviteeEmail));

const makeWorkosInvitationSender = (userManagement: WorkosInvitationSender) =>
  Effect.fn("InvitationCapabilities.Workos.send")(function* (
    input: WorkosInvitationIssueInput
  ) {
    const invitation = yield* Effect.tryPromise({
      catch: (cause) => issueFailure(input, cause),
      try: async () =>
        await userManagement.sendInvitation(workosIssueInputFromIntent(input)),
    });

    return yield* Effect.try({
      catch: (cause) => issueOutcomeUnknown(input, cause),
      try: () => pendingFromWorkos(invitation, input),
    });
  });

const revokeWorkosInvitation = Effect.fn(
  "InvitationCapabilities.Workos.revoke"
)(function* (
  userManagement: Pick<
    WorkosInvitationUserManagement,
    "getInvitation" | "revokeInvitation"
  >,
  input:
    | CompanyMemberInvitationRevocationInput
    | RegistrationInvitationRevocationInput
) {
  const current = yield* Effect.tryPromise({
    catch: (cause) => revokeFailure(input.invitationId, cause),
    try: async () => await userManagement.getInvitation(input.invitationId),
  });

  if (current.state === "expired") {
    return yield* new InvitationExpired({
      expiredAt: toDate(current.expiresAt),
      invitationId: input.invitationId,
      message: `Invitation ${input.invitationId} has expired`,
    });
  }

  if (current.state === "accepted") {
    return yield* new InvitationConflict({
      message: "Invitation can no longer be revoked by the provider",
    });
  }

  if (current.state === "revoked") {
    return new RevokedInvitation({
      _tag: "RevokedInvitation",
      createdAt: toDate(current.createdAt),
      expiresAt: toDate(current.expiresAt),
      id: invitationIdFromWorkos(current),
      intent: input.intent,
      issuedBy: input.issuedBy,
      revokedAt: toDate(current.revokedAt),
      revokedBy: input.revokedBy,
    });
  }

  const invitation = yield* Effect.tryPromise({
    catch: (cause) => revokeFailure(input.invitationId, cause),
    try: async () => await userManagement.revokeInvitation(input.invitationId),
  });
  if (invitation.state === "expired") {
    return yield* new InvitationExpired({
      expiredAt: toDate(invitation.expiresAt),
      invitationId: input.invitationId,
      message: `Invitation ${input.invitationId} has expired`,
    });
  }

  if (invitation.state !== "revoked") {
    return yield* new InvitationConflict({
      message: "Invitation was not revoked by the provider",
    });
  }

  return new RevokedInvitation({
    _tag: "RevokedInvitation",
    createdAt: toDate(invitation.createdAt),
    expiresAt: toDate(invitation.expiresAt),
    id: invitationIdFromWorkos(invitation),
    intent: input.intent,
    issuedBy: input.issuedBy,
    revokedAt: toDate(invitation.revokedAt),
    revokedBy: input.revokedBy,
  });
});

export const makeWorkosCompanyMemberInvitations = (
  userManagement: WorkosCompanyMemberInvitationUserManagement
) => {
  const sendInvitation = makeWorkosInvitationSender(userManagement);

  return CompanyMemberInvitations.of({
    issue: Effect.fn("CompanyMemberInvitations.Workos.issue")(
      (input: CompanyMemberInvitationIssueInput) => sendInvitation(input)
    ),
    revoke: Effect.fn("CompanyMemberInvitations.Workos.revoke")(
      (input: CompanyMemberInvitationRevocationInput) =>
        revokeWorkosInvitation(userManagement, input)
    ),
  });
};

export const makeWorkosInvitationDeliveries = (
  userManagement: Pick<WorkosInvitationUserManagement, "getInvitation">
) =>
  InvitationDeliveries.of({
    get: Effect.fn("InvitationDeliveries.Workos.get")(
      (invitationId: InvitationId) =>
        Effect.tryPromise({
          catch: (cause) => readFailure(invitationId, cause),
          try: async () => await userManagement.getInvitation(invitationId),
        }).pipe(Effect.map(deliveryFromWorkos))
    ),
  });

export const makeWorkosInvitationCapabilities = (
  userManagement: WorkosInvitationUserManagement,
  issueAttempts: RegistrationInvitationIssueAttemptsService
) => {
  const sendInvitation = makeWorkosInvitationSender(userManagement);
  const companyMemberInvitations =
    makeWorkosCompanyMemberInvitations(userManagement);

  const listActiveRegistrationInvitations = Effect.fn(
    "RegistrationInvitations.Workos.listActive"
  )((input: RegistrationInvitationIssueInput) =>
    Effect.tryPromise({
      catch: (cause) => providerFailure("issue", cause),
      try: async () => {
        const response = await userManagement.listInvitations({
          email: normalizedEmail(Redacted.value(input.intent.inviteeEmail)),
        });

        return response.autoPagination
          ? await response.autoPagination()
          : response.data;
      },
    }).pipe(
      Effect.map((invitations) =>
        invitations.filter((invitation) =>
          isActiveRegistrationInvitation(invitation, input)
        )
      )
    )
  );

  const issueRegistration = Effect.fn("RegistrationInvitations.Workos.issue")(
    function* (input: RegistrationInvitationIssueInput) {
      const active = yield* listActiveRegistrationInvitations(input);
      const { attempt, started } = yield* issueAttempts.start({
        excludedProviderInvitationIds: active.map(invitationIdFromWorkos),
        registrationId: input.intent.registrationId,
      });
      const excluded = new Set(
        attempt.excludedProviderInvitationIds.map(String)
      );

      if (attempt.providerInvitationId !== undefined) {
        const { providerInvitationId } = attempt;
        const recovered = yield* Effect.tryPromise({
          catch: (cause) => providerFailure("issue", cause),
          try: async () =>
            await userManagement.getInvitation(providerInvitationId),
        });

        if (!isActiveRegistrationInvitation(recovered, input)) {
          return yield* new InvitationConflict({
            message:
              "The correlated WorkOS invitation no longer matches this registration approval",
          });
        }

        return pendingFromWorkos(recovered, input);
      }

      if (started && active.length > 0) {
        return yield* new InvitationConflict({
          message:
            "WorkOS already has an uncorrelated invitation for this email address",
        });
      }

      if (!started) {
        const uncorrelatedCandidates = active.filter(
          (invitation) => !excluded.has(invitation.id)
        );
        return yield* issueOutcomeUnknown(
          input,
          new Error(
            `Provider invitation outcome is unknown for registration ${input.intent.registrationId}; refusing email-only recovery from ${uncorrelatedCandidates.length} candidate(s)`
          )
        );
      }

      const issued = yield* sendInvitation(input);
      yield* issueAttempts
        .recordIssued({
          providerInvitationId: issued.id,
          registrationId: input.intent.registrationId,
        })
        .pipe(Effect.mapError((error) => issueOutcomeUnknown(input, error)));

      return issued;
    }
  );

  const accept = Effect.fn("RegistrationInvitations.Workos.accept")(function* (
    input: RegistrationInvitationAcceptanceInput
  ) {
    const invitation = yield* Effect.tryPromise({
      catch: (cause) => readFailure(input.invitationId, cause),
      try: async () => await userManagement.getInvitation(input.invitationId),
    });

    if (invitation.state === "expired") {
      return yield* new InvitationExpired({
        expiredAt: toDate(invitation.expiresAt),
        invitationId: input.invitationId,
        message: `Invitation ${input.invitationId} has expired`,
      });
    }

    if (invitation.state === "revoked") {
      return yield* new InvitationConflict({
        message: "Invitation can no longer be accepted by the provider",
      });
    }

    const inviteeEmail = Redacted.value(input.intent.inviteeEmail);
    const acceptedEmail = Redacted.value(input.acceptedIdentity.email);
    if (
      normalizedEmail(invitation.email) !== normalizedEmail(inviteeEmail) ||
      normalizedEmail(acceptedEmail) !== normalizedEmail(inviteeEmail) ||
      (invitation.acceptedUserId !== null &&
        invitation.acceptedUserId !== input.acceptedIdentity.authUserId)
    ) {
      return yield* new InvitationConflict({
        message: "Invitation was accepted by a different identity",
      });
    }

    const acceptedAt =
      invitation.state === "accepted"
        ? toDate(invitation.acceptedAt)
        : DateTime.toDateUtc(yield* DateTime.now);

    yield* Effect.tryPromise({
      catch: (cause) => providerFailure("accept", cause),
      try: async () =>
        await userManagement.updateUser({
          metadata: {
            invitation: workosRegistrationInvitationMetadata(input),
          },
          userId: input.acceptedIdentity.authUserId,
        }),
    });

    return new AcceptedInvitation({
      _tag: "AcceptedInvitation",
      acceptedAt,
      acceptedBy: input.acceptedIdentity,
      createdAt: toDate(invitation.createdAt),
      expiresAt: toDate(invitation.expiresAt),
      id: invitationIdFromWorkos(invitation),
      intent: input.intent,
      issuedBy: input.issuedBy,
    });
  });

  const revoke = Effect.fn("RegistrationInvitations.Workos.revoke")(function* (
    input: RegistrationInvitationRevocationInput
  ) {
    return yield* revokeWorkosInvitation(userManagement, input);
  });

  return {
    companyMemberInvitations,
    invitationDeliveries: makeWorkosInvitationDeliveries(userManagement),
    registrationInvitations: RegistrationInvitations.of({
      accept,
      issue: issueRegistration,
      revoke,
    }),
  };
};

const configuredWorkosUserManagement = Effect.gen(function* () {
  const apiKey = yield* Config.redacted("WORKOS_API_KEY");
  const clientId = yield* Config.option(Config.string("WORKOS_CLIENT_ID"));

  return new WorkOS({
    apiKey: Redacted.value(apiKey),
    clientId: Option.getOrUndefined(clientId),
  }).userManagement;
});

export const companyMemberInvitationsLayer = Layer.effectContext(
  configuredWorkosUserManagement.pipe(
    Effect.map((userManagement) =>
      Context.make(
        CompanyMemberInvitations,
        makeWorkosCompanyMemberInvitations(userManagement)
      ).pipe(
        Context.add(
          InvitationDeliveries,
          makeWorkosInvitationDeliveries(userManagement)
        )
      )
    )
  )
);

export const makeWorkosCompanyMemberIdentityProjection = (
  userManagement: Pick<WorkosInvitationUserManagement, "updateUser">
) =>
  CompanyMemberIdentityProjection.of({
    projectAcceptedInvitation: Effect.fn(
      "CompanyMemberIdentityProjection.Workos.projectAcceptedInvitation"
    )((input) =>
      Effect.tryPromise({
        catch: (cause) => providerFailure("accept", cause),
        try: async () => {
          await userManagement.updateUser({
            metadata: {
              invitation: workosCompanyMemberInvitationMetadata(input),
            },
            userId: input.acceptedIdentity.authUserId,
          });
        },
      })
    ),
  });

export const companyMemberIdentityProjectionLayer = Layer.effect(
  CompanyMemberIdentityProjection,
  configuredWorkosUserManagement.pipe(
    Effect.map(makeWorkosCompanyMemberIdentityProjection)
  )
);

export const invitationsLayer = Layer.effectContext(
  Effect.gen(function* () {
    const userManagement = yield* configuredWorkosUserManagement;
    const issueAttempts = yield* RegistrationInvitationIssueAttempts;

    const capabilities = makeWorkosInvitationCapabilities(
      userManagement,
      issueAttempts
    );

    return Context.make(
      RegistrationInvitations,
      capabilities.registrationInvitations
    ).pipe(
      Context.add(
        CompanyMemberInvitations,
        capabilities.companyMemberInvitations
      ),
      Context.add(InvitationDeliveries, capabilities.invitationDeliveries)
    );
  })
);
