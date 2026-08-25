import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { clerkClient } from "@clerk/nextjs/server";
import { Email, InvitationId } from "@repo/registration/domain/identity";
import {
  AcceptedInvitation,
  InvitationDelivery,
  PendingInvitation,
  RevokedInvitation,
} from "@repo/registration/domain/invitations";
import { sameCompanyRoles } from "@repo/registration/domain/roles";
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
  RegistrationInvitationAcceptanceInput,
  RegistrationInvitationIssueInput,
  RegistrationInvitationRevocationInput,
} from "@repo/registration/services/invitations";
import { RegistrationInvitationIssueAttempts } from "@repo/registration/services/registration-invitation-issue-attempts";
import type { RegistrationInvitationIssueAttemptsService } from "@repo/registration/services/registration-invitation-issue-attempts";
import {
  Config,
  Context,
  Data,
  Effect,
  Layer,
  Option,
  Redacted,
  Schema,
} from "effect";

import {
  ClerkInvitationMetadata,
  clerkInvitationMetadataFromIntent,
} from "./invitation-metadata";

type ClerkInvitationIssueInput =
  | RegistrationInvitationIssueInput
  | CompanyMemberInvitationIssueInput;

const clerkInvitationExpirationDays = 30;
const millisecondsPerDay = 24 * 60 * 60 * 1000;

const ClerkInvitation = Schema.Struct({
  createdAt: Schema.Finite,
  emailAddress: Schema.String,
  id: Schema.NonEmptyString,
  publicMetadata: Schema.Unknown,
  status: Schema.Literals(["pending", "accepted", "revoked", "expired"]),
  updatedAt: Schema.Finite,
  url: Schema.optional(Schema.String),
});

const ClerkInvitationList = Schema.Struct({
  data: Schema.Array(ClerkInvitation),
});

export interface ClerkInvitationsApi {
  readonly createInvitation: (input: {
    readonly emailAddress: string;
    readonly expiresInDays: number;
    readonly publicMetadata: ClerkInvitationMetadata;
    readonly redirectUrl: string;
  }) => Promise<typeof ClerkInvitation.Type>;
  readonly getInvitationList: (input: {
    readonly limit: number;
    readonly query: string;
    readonly status?: "accepted" | "expired" | "pending" | "revoked";
  }) => Promise<typeof ClerkInvitationList.Type>;
  readonly revokeInvitation: (
    invitationId: string
  ) => Promise<typeof ClerkInvitation.Type>;
}

const toDate = (value: number) => new Date(value);
const expiresAtFromClerk = (invitation: typeof ClerkInvitation.Type) =>
  new Date(
    invitation.createdAt + clerkInvitationExpirationDays * millisecondsPerDay
  );

const toRedactedEmail = (email: string) =>
  Redacted.make(Email.make(email), { label: "email" });

const deliveryFromClerk = (invitation: typeof ClerkInvitation.Type) => {
  const delivery = {
    createdAt: toDate(invitation.createdAt),
    expiresAt: expiresAtFromClerk(invitation),
    id: InvitationId.make(invitation.id),
    inviteeEmail: toRedactedEmail(invitation.emailAddress),
    status: invitation.status,
    updatedAt: toDate(invitation.updatedAt),
  };

  return invitation.url === undefined
    ? new InvitationDelivery(delivery)
    : new InvitationDelivery({
        ...delivery,
        acceptInvitationUrl: invitation.url,
      });
};

const providerFailure = (
  operation: "issue" | "read" | "accept" | "revoke",
  cause: unknown
) =>
  new InvitationProviderFailure({
    cause,
    message: `Failed to ${operation} Clerk invitation: ${
      cause instanceof Error ? cause.message : String(cause)
    }`,
    operation,
  });

const issueOutcomeUnknown = (
  input: ClerkInvitationIssueInput,
  cause: unknown
) =>
  new InvitationIssueOutcomeUnknown({
    cause,
    message:
      input.intent.intent === "registration_approval"
        ? `Clerk invitation issuance outcome is unknown for registration ${input.intent.registrationId}`
        : `Clerk invitation issuance outcome is unknown for business unit ${input.intent.businessUnitId}`,
  });

const readFailure = (
  invitationId: InvitationId,
  operation: "accept" | "issue" | "read" | "revoke",
  cause: unknown
) =>
  isClerkAPIResponseError(cause) && cause.status === 404
    ? new InvitationNotFound({
        invitationId,
        message: `Invitation ${invitationId} was not found`,
      })
    : providerFailure(operation, cause);

const revokeFailure = (invitationId: InvitationId, cause: unknown) =>
  isClerkAPIResponseError(cause) && cause.status === 404
    ? new InvitationNotFound({
        invitationId,
        message: `Invitation ${invitationId} was not found`,
      })
    : providerFailure("revoke", cause);

const issueFailure = (input: ClerkInvitationIssueInput, cause: unknown) => {
  if (!isClerkAPIResponseError(cause)) {
    return issueOutcomeUnknown(input, cause);
  }

  if (cause.errors.some((error) => error.code === "form_identifier_exists")) {
    return new InvitationConflict({
      message: "Clerk already has a user for this email",
    });
  }

  return cause.status >= 400 && cause.status < 500 && cause.status !== 408
    ? providerFailure("issue", cause)
    : issueOutcomeUnknown(input, cause);
};

const isDuplicateInvitationFailure = (cause: unknown) =>
  isClerkAPIResponseError(cause) &&
  cause.errors.some((error) => error.code === "duplicate_record");

const findInvitation = (
  invitations: ClerkInvitationsApi,
  invitationId: InvitationId,
  operation: "accept" | "issue" | "read" | "revoke"
) =>
  Effect.gen(function* () {
    const readList = (
      status?: "accepted" | "expired" | "pending" | "revoked"
    ) =>
      Effect.tryPromise({
        catch: (cause) => readFailure(invitationId, operation, cause),
        try: async () =>
          await invitations.getInvitationList(
            status === undefined
              ? { limit: 10, query: String(invitationId) }
              : { limit: 10, query: String(invitationId), status }
          ),
      }).pipe(
        Effect.flatMap((response) =>
          Schema.decodeEffect(ClerkInvitationList)(response).pipe(Effect.orDie)
        )
      );

    const current = yield* readList();
    const invitation = current.data.find(
      (candidate) => candidate.id === invitationId
    );
    if (invitation) {
      return invitation;
    }

    const revoked = yield* readList("revoked");
    const revokedInvitation = revoked.data.find(
      (candidate) => candidate.id === invitationId
    );
    if (revokedInvitation) {
      return revokedInvitation;
    }

    return yield* new InvitationNotFound({
      invitationId,
      message: `Invitation ${invitationId} was not found`,
    });
  });

const normalizedEmail = (email: string) => email.trim().toLowerCase();

class ClerkInvitationRequestFailure extends Data.TaggedError(
  "ClerkInvitationRequestFailure"
)<{
  readonly cause: unknown;
}> {}

const metadataMatchesIntent = (
  metadata: ClerkInvitationMetadata,
  intent: ClerkInvitationIssueInput["intent"]
) => {
  const metadataIntent = metadata.invitation;

  if (intent.intent === "registration_approval") {
    return (
      metadataIntent.intent === "registration_approval" &&
      metadataIntent.registrationId === intent.registrationId &&
      sameCompanyRoles(metadataIntent.roles, intent.roles)
    );
  }

  return (
    metadataIntent.intent === "company_member" &&
    metadataIntent.businessUnitId === intent.businessUnitId &&
    sameCompanyRoles(metadataIntent.roles, intent.roles)
  );
};

const pendingFromClerk = (
  invitation: typeof ClerkInvitation.Type,
  input: ClerkInvitationIssueInput
) => {
  const properties = {
    _tag: "PendingInvitation",
    createdAt: toDate(invitation.createdAt),
    expiresAt: expiresAtFromClerk(invitation),
    id: InvitationId.make(invitation.id),
    intent: input.intent,
    issuedBy: input.issuedBy,
  } as const;

  return invitation.url === undefined
    ? new PendingInvitation(properties)
    : new PendingInvitation({
        ...properties,
        acceptInvitationUrl: invitation.url,
      });
};

const revokedFromClerk = (
  invitation: typeof ClerkInvitation.Type,
  input: RegistrationInvitationRevocationInput
) =>
  new RevokedInvitation({
    _tag: "RevokedInvitation",
    createdAt: toDate(invitation.createdAt),
    expiresAt: expiresAtFromClerk(invitation),
    id: InvitationId.make(invitation.id),
    intent: input.intent,
    issuedBy: input.issuedBy,
    revokedAt: toDate(invitation.updatedAt),
    revokedBy: input.revokedBy,
  });

const issueClerkInvitation = Effect.fn("InvitationCapabilities.Clerk.issue")(
  function* (
    invitations: ClerkInvitationsApi,
    redirectUrl: string,
    input: ClerkInvitationIssueInput
  ) {
    const invitation = yield* Effect.tryPromise({
      catch: (cause) => new ClerkInvitationRequestFailure({ cause }),
      try: async () =>
        await invitations.createInvitation({
          emailAddress: normalizedEmail(
            Redacted.value(input.intent.inviteeEmail)
          ),
          expiresInDays: clerkInvitationExpirationDays,
          publicMetadata: clerkInvitationMetadataFromIntent(input.intent),
          redirectUrl,
        }),
    }).pipe(
      Effect.catch((error) => {
        if (!isDuplicateInvitationFailure(error.cause)) {
          return Effect.fail(issueFailure(input, error.cause));
        }

        return Effect.fail(
          new InvitationConflict({
            message: "Clerk has another invitation for this email address",
          })
        );
      }),
      Effect.flatMap((response) =>
        Schema.decodeEffect(ClerkInvitation)(response).pipe(
          Effect.mapError((cause) => issueOutcomeUnknown(input, cause))
        )
      )
    );

    return pendingFromClerk(invitation, input);
  }
);

export const makeClerkCompanyMemberInvitations = (
  invitations: ClerkInvitationsApi,
  redirectUrl: string
) =>
  CompanyMemberInvitations.of({
    issue: Effect.fn("CompanyMemberInvitations.Clerk.issue")(
      (input: CompanyMemberInvitationIssueInput) =>
        issueClerkInvitation(invitations, redirectUrl, input)
    ),
  });

export const makeClerkInvitationCapabilities = (
  invitations: ClerkInvitationsApi,
  redirectUrl: string,
  issueAttempts: RegistrationInvitationIssueAttemptsService
) => {
  const companyMemberInvitations = makeClerkCompanyMemberInvitations(
    invitations,
    redirectUrl
  );

  const get = Effect.fn("InvitationDeliveries.Clerk.get")(
    (invitationId: InvitationId) =>
      findInvitation(invitations, invitationId, "read").pipe(
        Effect.map(deliveryFromClerk)
      )
  );

  const acceptRegistration = Effect.fn("RegistrationInvitations.Clerk.accept")(
    function* (input: RegistrationInvitationAcceptanceInput) {
      const invitation = yield* findInvitation(
        invitations,
        input.invitationId,
        "accept"
      );

      if (invitation.status === "expired") {
        return yield* new InvitationExpired({
          expiredAt: expiresAtFromClerk(invitation),
          invitationId: input.invitationId,
          message: `Invitation ${input.invitationId} has expired`,
        });
      }

      if (invitation.status === "revoked") {
        return yield* new InvitationConflict({
          message: "Invitation can no longer be accepted by Clerk",
        });
      }

      const inviteeEmail = Redacted.value(input.intent.inviteeEmail);
      const acceptedEmail = Redacted.value(input.acceptedIdentity.email);
      if (
        normalizedEmail(invitation.emailAddress) !==
          normalizedEmail(inviteeEmail) ||
        normalizedEmail(acceptedEmail) !== normalizedEmail(inviteeEmail)
      ) {
        return yield* new InvitationConflict({
          message: "Invitation was accepted by a different email address",
        });
      }

      return new AcceptedInvitation({
        _tag: "AcceptedInvitation",
        acceptedAt: toDate(invitation.updatedAt),
        acceptedBy: input.acceptedIdentity,
        createdAt: toDate(invitation.createdAt),
        expiresAt: expiresAtFromClerk(invitation),
        id: InvitationId.make(invitation.id),
        intent: input.intent,
        issuedBy: input.issuedBy,
      });
    }
  );

  const issueRegistration = Effect.fn("RegistrationInvitations.Clerk.issue")(
    function* (input: RegistrationInvitationIssueInput) {
      const { attempt, started } = yield* issueAttempts.start({
        excludedProviderInvitationIds: [],
        registrationId: input.intent.registrationId,
      });

      if (attempt.providerInvitationId !== undefined) {
        const { providerInvitationId } = attempt;
        const recovered = yield* findInvitation(
          invitations,
          providerInvitationId,
          "issue"
        ).pipe(
          Effect.catchTag(
            "InvitationNotFound",
            () =>
              new InvitationConflict({
                message: `The correlated Clerk invitation ${providerInvitationId} was not found`,
              })
          )
        );
        const metadata = Schema.decodeUnknownOption(ClerkInvitationMetadata)(
          recovered.publicMetadata
        );

        if (
          (recovered.status !== "pending" && recovered.status !== "accepted") ||
          normalizedEmail(recovered.emailAddress) !==
            normalizedEmail(Redacted.value(input.intent.inviteeEmail)) ||
          Option.isNone(metadata) ||
          !metadataMatchesIntent(metadata.value, input.intent)
        ) {
          return yield* new InvitationConflict({
            message:
              "The correlated Clerk invitation no longer matches this registration approval",
          });
        }

        return pendingFromClerk(recovered, input);
      }

      if (!started) {
        return yield* issueOutcomeUnknown(
          input,
          new Error(
            `Registration ${input.intent.registrationId} has an invitation issue attempt without an exact Clerk invitation ID`
          )
        );
      }

      const issued = yield* issueClerkInvitation(
        invitations,
        redirectUrl,
        input
      );
      yield* issueAttempts
        .recordIssued({
          providerInvitationId: issued.id,
          registrationId: input.intent.registrationId,
        })
        .pipe(Effect.mapError((error) => issueOutcomeUnknown(input, error)));

      return issued;
    }
  );

  const revokeRegistration = Effect.fn("RegistrationInvitations.Clerk.revoke")(
    function* (input: RegistrationInvitationRevocationInput) {
      const current = yield* findInvitation(
        invitations,
        input.invitationId,
        "revoke"
      );

      if (current.status === "revoked") {
        return revokedFromClerk(current, input);
      }

      if (current.status === "expired") {
        return yield* new InvitationExpired({
          expiredAt: expiresAtFromClerk(current),
          invitationId: input.invitationId,
          message: `Invitation ${input.invitationId} has expired`,
        });
      }

      if (current.status === "accepted") {
        return yield* new InvitationConflict({
          message: "Invitation can no longer be revoked by Clerk",
        });
      }

      const invitation = yield* Effect.tryPromise({
        catch: (cause) => revokeFailure(input.invitationId, cause),
        try: async () =>
          await invitations.revokeInvitation(String(input.invitationId)),
      }).pipe(
        Effect.flatMap((response) =>
          Schema.decodeEffect(ClerkInvitation)(response).pipe(Effect.orDie)
        )
      );

      if (invitation.status !== "revoked") {
        return yield* new InvitationConflict({
          message: "Invitation was not revoked by Clerk",
        });
      }

      return revokedFromClerk(invitation, input);
    }
  );

  return {
    companyMemberInvitations,
    invitationDeliveries: InvitationDeliveries.of({ get }),
    registrationInvitations: RegistrationInvitations.of({
      accept: acceptRegistration,
      issue: issueRegistration,
      revoke: revokeRegistration,
    }),
  } as const;
};

const clerkInvitationsApi: ClerkInvitationsApi = {
  createInvitation: async (input) => {
    const client = await clerkClient();
    return await client.invitations.createInvitation(input);
  },
  getInvitationList: async (input) => {
    const client = await clerkClient();
    return await client.invitations.getInvitationList(input);
  },
  revokeInvitation: async (invitationId) => {
    const client = await clerkClient();
    return await client.invitations.revokeInvitation(invitationId);
  },
};

export const companyMemberInvitationsLayer = Layer.effect(
  CompanyMemberInvitations,
  Config.url("NEXT_PUBLIC_WEB_URL").pipe(
    Effect.map((webUrl) =>
      makeClerkCompanyMemberInvitations(
        clerkInvitationsApi,
        new URL("/accept-invitation", webUrl).toString()
      )
    )
  )
);

export const invitationsLayer = Layer.effectContext(
  Effect.gen(function* () {
    const webUrl = yield* Config.url("NEXT_PUBLIC_WEB_URL");
    const issueAttempts = yield* RegistrationInvitationIssueAttempts;
    const capabilities = makeClerkInvitationCapabilities(
      clerkInvitationsApi,
      new URL("/accept-invitation", webUrl).toString(),
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
