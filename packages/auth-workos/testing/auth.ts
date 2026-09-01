import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import {
  AuthTestControl,
  AuthTestFailure,
} from "@repo/auth-contract/e2e/auth-test-control";
import type {
  AcceptPendingAuthInvitationInput,
  AuthTestIdentity,
} from "@repo/auth-contract/e2e/auth-test-control";
import { localE2EUrl } from "@repo/e2e-testing";
import { NotFoundException, WorkOS } from "@workos-inc/node";
import { Config, Effect, Layer, Option, Redacted, Schema } from "effect";

import { workosHostedInvitationDriver } from "./hosted-invitation-driver";
import type { WorkosHostedInvitationDriver } from "./hosted-invitation-driver";
import { localWorkosInvitationWebhookRelay } from "./local-webhook-relay";
import type { WorkosInvitationWebhookRelay } from "./local-webhook-relay";

type Page = AcceptPendingAuthInvitationInput["page"];

export interface WorkosTestUserManagement {
  readonly authenticateWithPassword: (input: {
    readonly clientId: string;
    readonly email: string;
    readonly invitationToken?: string;
    readonly password: string;
    readonly session: {
      readonly cookiePassword: string;
      readonly sealSession: true;
    };
  }) => Promise<{
    readonly accessToken?: string;
    readonly sealedSession?: string;
  }>;
  readonly createUser: (input: {
    readonly email: string;
    readonly emailVerified: true;
    readonly firstName: string;
    readonly lastName: string;
    readonly password: string;
  }) => Promise<{ readonly id: string }>;
  readonly deleteUser: (userId: string) => Promise<void>;
  readonly listInvitations: (input: { readonly email: string }) => Promise<{
    readonly data: readonly {
      readonly email: string;
      readonly id: string;
      readonly state: "accepted" | "expired" | "pending" | "revoked";
      readonly token: string;
    }[];
  }>;
  readonly listUsers: (input: { readonly email: string }) => Promise<{
    readonly data: readonly {
      readonly email: string;
      readonly emailVerified: boolean;
      readonly id: string;
    }[];
  }>;
  readonly revokeInvitation: (
    invitationId: string
  ) => Promise<{ readonly id: string }>;
}

export interface WorkosTestAuthorizationApi {
  readonly createOrganization: (input: {
    readonly name: string;
  }) => Promise<{ readonly id: string }>;
  readonly createAuthorizedMembership: (input: {
    readonly organizationId: string;
    readonly permissions: readonly string[];
    readonly userId: string;
  }) => Promise<void>;
  readonly deleteOrganization: (organizationId: string) => Promise<void>;
}

export interface WorkosAuthTestControlOptions {
  readonly acceptInvitation?: WorkosHostedInvitationDriver;
  readonly authorization?: WorkosTestAuthorizationApi;
  readonly clientId: string;
  readonly cookieName: string;
  readonly cookiePassword: string;
  readonly deliverAcceptedInvitation?: WorkosInvitationWebhookRelay;
  readonly makePassword?: () => string;
  readonly userManagement: WorkosTestUserManagement;
  readonly waitForAuthorization?: () => Promise<void>;
}

interface WorkosTestCredentials {
  readonly email: string;
  readonly organizationId?: string;
  readonly password: string;
  readonly permissions?: readonly string[];
}

const defaultPassword = () => `E2E-A9!-${randomUUID()}`;
const defaultWaitForAuthorization = async () => {
  await delay(500);
};

const emailIdentityPart = (value: string) => {
  const normalized = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "")
    .slice(0, 10);
  const readablePart = normalized.length === 0 ? "test" : normalized;
  const fingerprint = createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 8);
  return `${readablePart}-${fingerprint}`;
};

const AccessTokenPermissions = Schema.Struct({
  permissions: Schema.optional(Schema.Array(Schema.String)),
});

const accessTokenPermissions = (accessToken: string): readonly string[] => {
  const [, encodedPayload] = accessToken.split(".");
  if (encodedPayload === undefined) {
    return [];
  }
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf-8")
    );
    return (
      Schema.decodeUnknownSync(AccessTokenPermissions)(payload).permissions ??
      []
    );
  } catch {
    return [];
  }
};

const hasPermissions = (
  granted: readonly string[],
  required: readonly string[]
) => required.every((permission) => granted.includes(permission));

const failure = (operation: AuthTestFailure["operation"], cause: unknown) =>
  new AuthTestFailure({
    cause,
    message: `WorkOS test ${operation} failed: ${
      cause instanceof Error ? cause.message : String(cause)
    }`,
    operation,
    provider: "workos",
  });

const ignoreNotFound = async (operation: () => Promise<void>) => {
  try {
    await operation();
  } catch (error) {
    if (!(error instanceof NotFoundException)) {
      throw error;
    }
  }
};

export const makeWorkosAuthTestControl = (
  options: WorkosAuthTestControlOptions
) => {
  const credentials = new Map<string, WorkosTestCredentials>();
  const cleanupIdentityIdsByEmail = new Map<string, Set<string>>();
  const makePassword = options.makePassword ?? defaultPassword;
  const waitForAuthorization =
    options.waitForAuthorization ?? defaultWaitForAuthorization;

  const trackIdentityForCleanup = (email: string, userId: string) => {
    const normalizedEmail = email.toLowerCase();
    const existing = cleanupIdentityIdsByEmail.get(normalizedEmail);
    if (existing === undefined) {
      cleanupIdentityIdsByEmail.set(normalizedEmail, new Set([userId]));
      return;
    }
    existing.add(userId);
  };

  const releaseIdentityFromCleanup = (email: string, userId: string) => {
    const normalizedEmail = email.toLowerCase();
    const existing = cleanupIdentityIdsByEmail.get(normalizedEmail);
    existing?.delete(userId);
    if (existing?.size === 0) {
      cleanupIdentityIdsByEmail.delete(normalizedEmail);
    }
  };

  const authenticate = async (
    identityCredentials: WorkosTestCredentials,
    applicationUrl: string,
    page: Page,
    invitationToken?: string
  ) => {
    let sealedSession: string | undefined;
    let grantedPermissions: readonly string[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const authenticationInput: Parameters<
        WorkosTestUserManagement["authenticateWithPassword"]
      >[0] = {
        clientId: options.clientId,
        email: identityCredentials.email,
        password: identityCredentials.password,
        session: {
          cookiePassword: options.cookiePassword,
          sealSession: true,
        },
      };
      if (invitationToken !== undefined) {
        Object.assign(authenticationInput, { invitationToken });
      }
      const authentication =
        // oxlint-disable-next-line no-await-in-loop -- Each bounded retry validates a newly issued WorkOS token after eventual-consistency delay.
        await options.userManagement.authenticateWithPassword(
          authenticationInput
        );
      const { accessToken, sealedSession: authenticatedSession } =
        authentication;
      grantedPermissions =
        accessToken === undefined ? [] : accessTokenPermissions(accessToken);
      if (
        identityCredentials.permissions === undefined ||
        hasPermissions(grantedPermissions, identityCredentials.permissions)
      ) {
        sealedSession = authenticatedSession;
        break;
      }
      if (attempt < 4) {
        // oxlint-disable-next-line no-await-in-loop -- This bounded delay lets WorkOS authorization changes propagate.
        await waitForAuthorization();
      }
    }
    if (sealedSession === undefined) {
      if (identityCredentials.permissions !== undefined) {
        throw new Error(
          `WorkOS session did not receive permissions ${identityCredentials.permissions.join(", ")}; received ${grantedPermissions.join(", ") || "none"}`
        );
      }
      throw new Error("WorkOS did not return a sealed session");
    }

    const url = new URL(applicationUrl);
    await page.context().addCookies([
      {
        httpOnly: true,
        name: options.cookieName,
        sameSite: "Lax",
        secure: url.protocol === "https:",
        url: url.origin,
        value: sealedSession,
      },
    ]);
  };

  return AuthTestControl.of({
    acceptPendingInvitation: ({
      applicationUrl,
      email,
      firstName,
      lastName,
      page,
    }) =>
      Effect.tryPromise({
        catch: (cause) => failure("acceptInvitation", cause),
        try: async () => {
          const invitations = await options.userManagement.listInvitations({
            email,
          });
          const invitation = invitations.data.find(
            ({ email: invitationEmail, state }) =>
              state === "pending" &&
              invitationEmail.toLowerCase() === email.toLowerCase()
          );
          if (invitation === undefined) {
            throw new Error(`No pending WorkOS invitation exists for ${email}`);
          }
          const password = makePassword();
          const normalizedEmail = email.toLowerCase();
          const users = await options.userManagement.listUsers({ email });
          const matchingUsers = users.data.filter(
            (candidate) => candidate.email.toLowerCase() === normalizedEmail
          );
          if (matchingUsers.length > 1) {
            throw new Error(`Multiple WorkOS users exist for ${email}`);
          }
          const [provisionalUser] = matchingUsers;
          if (provisionalUser?.emailVerified === true) {
            throw new Error(
              `A verified WorkOS user already exists for ${email}`
            );
          }
          if (provisionalUser === undefined) {
            throw new Error(
              `WorkOS invitation for ${email} has no provisional user`
            );
          }
          if (options.acceptInvitation === undefined) {
            throw new Error(
              "WorkOS hosted invitation testing is not configured"
            );
          }
          const identityCredentials: WorkosTestCredentials = {
            email,
            password,
          };
          trackIdentityForCleanup(email, provisionalUser.id);
          await options.acceptInvitation({
            applicationUrl,
            email,
            firstName,
            invitationToken: invitation.token,
            lastName,
            page,
            password,
          });
          await options.deliverAcceptedInvitation?.({
            authUserId: provisionalUser.id,
            invitationId: invitation.id,
            page,
          });
          credentials.set(provisionalUser.id, identityCredentials);
          releaseIdentityFromCleanup(email, provisionalUser.id);
          return {
            authUserId: provisionalUser.id,
            email,
            firstName,
            lastName,
          };
        },
      }),
    createVerifiedIdentity: (input) =>
      Effect.tryPromise({
        catch: (cause) => failure("createIdentity", cause),
        try: async (): Promise<AuthTestIdentity> => {
          const password = makePassword();
          const user = await options.userManagement.createUser({
            email: input.email,
            emailVerified: true,
            firstName: input.firstName,
            lastName: input.lastName,
            password,
          });
          let organizationId: string | undefined;
          try {
            if (input.permissions !== undefined) {
              if (options.authorization === undefined) {
                throw new Error(
                  "WorkOS test authorization is not configured for this application"
                );
              }
              const organization =
                await options.authorization.createOrganization({
                  name: `${input.firstName} ${input.lastName} E2E`,
                });
              organizationId = organization.id;
              await options.authorization.createAuthorizedMembership({
                organizationId,
                permissions: input.permissions,
                userId: user.id,
              });
            }
          } catch (error) {
            if (organizationId !== undefined) {
              const failedOrganizationId = organizationId;
              await ignoreNotFound(async () => {
                await options.authorization?.deleteOrganization(
                  failedOrganizationId
                );
              });
            }
            await ignoreNotFound(async () => {
              await options.userManagement.deleteUser(user.id);
            });
            throw error;
          }
          const identityCredentials: WorkosTestCredentials = {
            email: input.email,
            password,
          };
          if (organizationId !== undefined) {
            Object.assign(identityCredentials, { organizationId });
          }
          if (input.permissions !== undefined) {
            Object.assign(identityCredentials, {
              permissions: input.permissions,
            });
          }
          credentials.set(user.id, identityCredentials);

          return {
            authUserId: user.id,
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
          };
        },
      }),
    deleteIdentity: (identity) =>
      Effect.tryPromise({
        catch: (cause) => failure("deleteIdentity", cause),
        try: async () => {
          const identityCredentials = credentials.get(identity.authUserId);
          const failures: unknown[] = [];
          const organizationId = identityCredentials?.organizationId;
          if (organizationId !== undefined) {
            try {
              await ignoreNotFound(async () => {
                await options.authorization?.deleteOrganization(organizationId);
              });
            } catch (error) {
              failures.push(error);
            }
          }
          try {
            await ignoreNotFound(async () => {
              await options.userManagement.deleteUser(identity.authUserId);
            });
          } catch (error) {
            failures.push(error);
          }
          if (failures.length > 0) {
            throw new AggregateError(
              failures,
              `Failed to delete WorkOS test identity ${identity.authUserId}`
            );
          }
        },
      }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            credentials.delete(identity.authUserId);
            releaseIdentityFromCleanup(identity.email, identity.authUserId);
          })
        )
      ),
    emailAddressFor: (uniqueSeed) =>
      `delivered+${emailIdentityPart(uniqueSeed)}@resend.dev`,
    revokePendingInvitationsFor: (email) =>
      Effect.tryPromise({
        catch: (cause) => failure("revokeInvitations", cause),
        try: async () => {
          const normalizedEmail = email.toLowerCase();
          const failures: unknown[] = [];
          try {
            const invitations = await options.userManagement.listInvitations({
              email,
            });
            await Promise.all(
              invitations.data
                .filter(({ state }) => state === "pending")
                .map(async ({ id }) => {
                  await ignoreNotFound(async () => {
                    await options.userManagement.revokeInvitation(id);
                  });
                })
            );
          } catch (error) {
            failures.push(error);
          }

          const identityIds = new Set(
            cleanupIdentityIdsByEmail.get(normalizedEmail)
          );
          try {
            const users = await options.userManagement.listUsers({ email });
            for (const user of users.data) {
              if (
                user.email.toLowerCase() === normalizedEmail &&
                !user.emailVerified
              ) {
                identityIds.add(user.id);
              }
            }
          } catch (error) {
            failures.push(error);
          }

          const deletionResults = await Promise.allSettled(
            [...identityIds].map(async (userId) => {
              await ignoreNotFound(async () => {
                await options.userManagement.deleteUser(userId);
              });
              releaseIdentityFromCleanup(email, userId);
            })
          );
          for (const result of deletionResults) {
            if (result.status === "rejected") {
              failures.push(result.reason);
            }
          }
          if (failures.length > 0) {
            throw new AggregateError(
              failures,
              `Failed to clean WorkOS invitations for ${email}`
            );
          }
        },
      }),
    signIn: ({ applicationUrl, identity, page }) => {
      const identityCredentials = credentials.get(identity.authUserId);
      if (identityCredentials === undefined) {
        const cause = new Error(
          `No WorkOS test credentials exist for ${identity.authUserId}`
        );
        return Effect.fail(failure("signIn", cause));
      }

      return Effect.tryPromise({
        catch: (cause) => failure("signIn", cause),
        try: async () => {
          await authenticate(identityCredentials, applicationUrl, page);
        },
      });
    },
  });
};

interface WorkosAuthTestEnvironmentNames {
  readonly apiKey: string;
  readonly clientId: string;
  readonly cookieName: string;
  readonly cookiePassword: string;
  readonly webhookSecret?: string;
}

const workosAuthTestControlLayer = (names: WorkosAuthTestEnvironmentNames) =>
  Layer.effect(
    AuthTestControl,
    Effect.gen(function* () {
      const apiKey = yield* Config.redacted(names.apiKey);
      const clientId = yield* Config.string(names.clientId);
      const cookieName = yield* Config.string(names.cookieName).pipe(
        Config.withDefault("wos-session")
      );
      const cookiePassword = yield* Config.redacted(names.cookiePassword);
      const e2eApiUrl = Option.getOrUndefined(
        yield* Config.option(Config.string("E2E_API_URL"))
      );
      const localE2EApiUrl = localE2EUrl(e2eApiUrl);
      const localWebhookSecret =
        names.webhookSecret !== undefined && localE2EApiUrl !== undefined
          ? Redacted.value(yield* Config.redacted(names.webhookSecret))
          : undefined;
      const workos = new WorkOS({
        apiKey: Redacted.value(apiKey),
        clientId,
      });

      const deliverAcceptedInvitation =
        localWebhookSecret === undefined || localE2EApiUrl === undefined
          ? undefined
          : localWorkosInvitationWebhookRelay({
              apiUrl: localE2EApiUrl,
              webhookSecret: localWebhookSecret,
              workos,
            });

      return makeWorkosAuthTestControl({
        acceptInvitation: workosHostedInvitationDriver({
          clientId,
          userManagement: workos.userManagement,
        }),
        authorization: {
          createAuthorizedMembership: async (input) => {
            const permissions = [...input.permissions];
            await Promise.all(
              permissions.map(async (permission) => {
                try {
                  await workos.authorization.getPermission(permission);
                } catch (error) {
                  if (!(error instanceof NotFoundException)) {
                    throw error;
                  }
                  try {
                    await workos.authorization.createPermission({
                      name: permission,
                      slug: permission,
                    });
                  } catch (creationError) {
                    await workos.authorization
                      .getPermission(permission)
                      .catch(() => {
                        throw creationError;
                      });
                  }
                }
              })
            );
            const permissionSetId = createHash("sha256")
              .update(JSON.stringify(permissions))
              .digest("hex")
              .slice(0, 16);
            const roleSlug = `e2e-${permissionSetId}`;
            try {
              await workos.authorization.getEnvironmentRole(roleSlug);
            } catch (error) {
              if (!(error instanceof NotFoundException)) {
                throw error;
              }
              try {
                await workos.authorization.createEnvironmentRole({
                  name: `E2E ${permissionSetId}`,
                  slug: roleSlug,
                });
              } catch (creationError) {
                await workos.authorization
                  .getEnvironmentRole(roleSlug)
                  .catch(() => {
                    throw creationError;
                  });
              }
            }
            await workos.authorization.setEnvironmentRolePermissions(roleSlug, {
              permissions,
            });
            await workos.userManagement.createOrganizationMembership({
              organizationId: input.organizationId,
              roleSlug,
              userId: input.userId,
            });
          },
          createOrganization: async (input) =>
            await workos.organizations.createOrganization(input),
          deleteOrganization: async (organizationId) => {
            await workos.organizations.deleteOrganization(organizationId);
          },
        },
        clientId,
        cookieName,
        cookiePassword: Redacted.value(cookiePassword),
        deliverAcceptedInvitation,
        userManagement: workos.userManagement,
      });
    })
  );

export const authTestControlLayer = workosAuthTestControlLayer({
  apiKey: "WORKOS_API_KEY",
  clientId: "WORKOS_CLIENT_ID",
  cookieName: "WORKOS_COOKIE_NAME",
  cookiePassword: "WORKOS_COOKIE_PASSWORD",
  webhookSecret: "WORKOS_WEBHOOK_SECRET",
});

export const adminAuthTestControlLayer = workosAuthTestControlLayer({
  apiKey: "ADMIN_WORKOS_API_KEY",
  clientId: "ADMIN_WORKOS_CLIENT_ID",
  cookieName: "ADMIN_WORKOS_COOKIE_NAME",
  cookiePassword: "ADMIN_WORKOS_COOKIE_PASSWORD",
});

// oxlint-disable-next-line typescript/promise-function-async -- WorkOS hosted testing needs no process-wide setup but implements the shared async entrypoint.
export const setupAuthTesting = () => Promise.resolve();
