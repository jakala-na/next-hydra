import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import {
  AuthTestControl,
  AuthTestFailure,
} from "@repo/auth-contract/e2e/auth-test-control";
import type { AuthTestIdentity } from "@repo/auth-contract/e2e/auth-test-control";
import { NotFoundException, WorkOS } from "@workos-inc/node";
import { Config, Effect, Layer, Redacted, Schema } from "effect";

export interface WorkosTestUserManagement {
  readonly authenticateWithPassword: (input: {
    readonly clientId: string;
    readonly email: string;
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
      readonly id: string;
      readonly state: "accepted" | "expired" | "pending" | "revoked";
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
  readonly authorization?: WorkosTestAuthorizationApi;
  readonly clientId: string;
  readonly cookieName: string;
  readonly cookiePassword: string;
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
  const makePassword = options.makePassword ?? defaultPassword;
  const waitForAuthorization =
    options.waitForAuthorization ?? defaultWaitForAuthorization;

  return AuthTestControl.of({
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
          })
        )
      ),
    revokePendingInvitationsFor: (email) =>
      Effect.tryPromise({
        catch: (cause) => failure("revokeInvitations", cause),
        try: async () => {
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
          let sealedSession: string | undefined;
          let grantedPermissions: readonly string[] = [];
          for (let attempt = 0; attempt < 5; attempt += 1) {
            const authentication =
              // oxlint-disable-next-line no-await-in-loop -- Each bounded retry validates a newly issued WorkOS token after eventual-consistency delay.
              await options.userManagement.authenticateWithPassword({
                clientId: options.clientId,
                email: identityCredentials.email,
                password: identityCredentials.password,
                session: {
                  cookiePassword: options.cookiePassword,
                  sealSession: true,
                },
              });
            const { accessToken, sealedSession: authenticatedSession } =
              authentication;
            grantedPermissions =
              accessToken === undefined
                ? []
                : accessTokenPermissions(accessToken);
            if (
              identityCredentials.permissions === undefined ||
              hasPermissions(
                grantedPermissions,
                identityCredentials.permissions
              )
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
      const workos = new WorkOS({
        apiKey: Redacted.value(apiKey),
        clientId,
      });

      return makeWorkosAuthTestControl({
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
        userManagement: workos.userManagement,
      });
    })
  );

export const authTestControlLayer = workosAuthTestControlLayer({
  apiKey: "WORKOS_API_KEY",
  clientId: "WORKOS_CLIENT_ID",
  cookieName: "WORKOS_COOKIE_NAME",
  cookiePassword: "WORKOS_COOKIE_PASSWORD",
});

export const adminAuthTestControlLayer = workosAuthTestControlLayer({
  apiKey: "ADMIN_WORKOS_API_KEY",
  clientId: "ADMIN_WORKOS_CLIENT_ID",
  cookieName: "ADMIN_WORKOS_COOKIE_NAME",
  cookiePassword: "ADMIN_WORKOS_COOKIE_PASSWORD",
});

// oxlint-disable-next-line typescript/promise-function-async -- WorkOS hosted testing needs no process-wide setup but implements the shared async entrypoint.
export const setupAuthTesting = () => Promise.resolve();
