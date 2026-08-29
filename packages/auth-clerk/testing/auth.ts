import { createHash } from "node:crypto";

import { createClerkClient } from "@clerk/backend";
import { isClerkAPIResponseError } from "@clerk/backend/errors";
import { parsePublishableKey } from "@clerk/shared/keys";
import { clerk } from "@clerk/testing/playwright";
import {
  AuthTestControl,
  AuthTestFailure,
} from "@repo/auth-contract/e2e/auth-test-control";
import type { AuthTestIdentity } from "@repo/auth-contract/e2e/auth-test-control";
import type { Page } from "@repo/e2e-testing";
import { Config, Effect, Layer, Redacted } from "effect";

import { domainPermissionToClerkPermission } from "../session";

interface ClerkInvitation {
  readonly emailAddress: string;
  readonly id: string;
}

interface ClerkInvitationList {
  readonly data: readonly ClerkInvitation[];
  readonly totalCount: number;
}

export interface ClerkAuthTestApi {
  readonly createUser: (input: {
    readonly emailAddress: string[];
    readonly firstName: string;
    readonly lastName: string;
  }) => Promise<{ readonly id: string }>;
  readonly deleteUser: (userId: string) => Promise<void>;
  readonly getInvitationList: (input: {
    readonly limit: number;
    readonly offset: number;
    readonly query: string;
    readonly status: "pending";
  }) => Promise<ClerkInvitationList>;
  readonly revokeInvitation: (invitationId: string) => Promise<void>;
}

export interface ClerkAuthTestAuthorizationApi {
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

export interface ClerkAuthTestControlOptions {
  readonly api: ClerkAuthTestApi;
  readonly authorization?: ClerkAuthTestAuthorizationApi;
  readonly signIn: (input: {
    readonly emailAddress: string;
    readonly organizationId?: string;
    readonly page: Page;
  }) => Promise<void>;
}

const pageSize = 100;
const clerkTestingTokenParameter = "__clerk_testing_token";

const failure = (operation: AuthTestFailure["operation"], cause: unknown) =>
  new AuthTestFailure({
    cause,
    message: `Clerk test ${operation} failed: ${
      cause instanceof Error ? cause.message : String(cause)
    }`,
    operation,
    provider: "clerk",
  });

const ignoreNotFound = async (operation: () => Promise<void>) => {
  try {
    await operation();
  } catch (error) {
    if (!(isClerkAPIResponseError(error) && error.status === 404)) {
      throw error;
    }
  }
};

export const makeClerkAuthTestControl = (
  options: ClerkAuthTestControlOptions
) => {
  const organizationIds = new Map<string, string>();

  return AuthTestControl.of({
    createVerifiedIdentity: (input) =>
      Effect.tryPromise({
        catch: (cause) => failure("createIdentity", cause),
        try: async (): Promise<AuthTestIdentity> => {
          const user = await options.api.createUser({
            emailAddress: [input.email],
            firstName: input.firstName,
            lastName: input.lastName,
          });
          let organizationId: string | undefined;
          try {
            if (input.permissions !== undefined) {
              if (options.authorization === undefined) {
                throw new Error(
                  "Clerk test authorization is not configured for this application"
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
              organizationIds.set(user.id, organizationId);
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
              await options.api.deleteUser(user.id);
            });
            throw error;
          }

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
          const organizationId = organizationIds.get(identity.authUserId);
          const failures: unknown[] = [];
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
              await options.api.deleteUser(identity.authUserId);
            });
          } catch (error) {
            failures.push(error);
          }
          if (failures.length > 0) {
            throw new AggregateError(
              failures,
              `Failed to delete Clerk test identity ${identity.authUserId}`
            );
          }
        },
      }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            organizationIds.delete(identity.authUserId);
          })
        )
      ),
    revokePendingInvitationsFor: (email) =>
      Effect.tryPromise({
        catch: (cause) => failure("revokeInvitations", cause),
        try: async () => {
          const normalizedEmail = email.toLowerCase();
          const matchingInvitationIds: string[] = [];
          let offset = 0;
          while (true) {
            // oxlint-disable-next-line no-await-in-loop -- Clerk pagination must be read sequentially.
            const invitations = await options.api.getInvitationList({
              limit: pageSize,
              offset,
              query: email,
              status: "pending",
            });
            const matchingInvitations = invitations.data.filter(
              (invitation) =>
                invitation.emailAddress.toLowerCase() === normalizedEmail
            );
            matchingInvitationIds.push(
              ...matchingInvitations.map(({ id }) => id)
            );

            offset += invitations.data.length;
            if (
              invitations.data.length === 0 ||
              offset >= invitations.totalCount
            ) {
              break;
            }
          }

          await Promise.all(
            matchingInvitationIds.map(async (invitationId) => {
              await ignoreNotFound(async () => {
                await options.api.revokeInvitation(invitationId);
              });
            })
          );
        },
      }),
    signIn: ({ applicationUrl, identity, page }) =>
      Effect.tryPromise({
        catch: (cause) => failure("signIn", cause),
        try: async () => {
          await page.goto(new URL("/sign-in", applicationUrl).href);
          const organizationId = organizationIds.get(identity.authUserId);
          const signInInput: Parameters<
            ClerkAuthTestControlOptions["signIn"]
          >[0] = {
            emailAddress: identity.email,
            page,
          };
          if (organizationId !== undefined) {
            Object.assign(signInInput, { organizationId });
          }
          await options.signIn(signInInput);
        },
      }),
  });
};

interface ClerkAuthTestEnvironmentNames {
  readonly publishableKey: string;
  readonly secretKey: string;
}

const escapeRegularExpression = (value: string): string =>
  value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const clerkAuthTestControlLayer = (names: ClerkAuthTestEnvironmentNames) =>
  Layer.effect(
    AuthTestControl,
    Effect.gen(function* () {
      const publishableKey = yield* Config.string(names.publishableKey);
      const secretKey = yield* Config.redacted(names.secretKey);
      const secretKeyValue = Redacted.value(secretKey);
      const client = createClerkClient({ secretKey: secretKeyValue });
      const parsedPublishableKey = parsePublishableKey(publishableKey, {
        fatal: true,
      });
      const testingTokenResponse = yield* Effect.tryPromise({
        catch: (cause) => failure("signIn", cause),
        try: async () => await client.testingTokens.createTestingToken(),
      });
      const testingToken = testingTokenResponse.token;
      const configuredContexts = new WeakSet();

      return makeClerkAuthTestControl({
        api: {
          createUser: async (input) => await client.users.createUser(input),
          deleteUser: async (userId) => {
            await client.users.deleteUser(userId);
          },
          getInvitationList: async (input) =>
            await client.invitations.getInvitationList(input),
          revokeInvitation: async (invitationId) => {
            await client.invitations.revokeInvitation(invitationId);
          },
        },
        authorization: {
          createAuthorizedMembership: async (input) => {
            const permissionKeys = input.permissions.map((permission) => {
              const key = domainPermissionToClerkPermission(permission);
              if (key === null) {
                throw new Error(
                  `Cannot map domain permission ${permission} to Clerk`
                );
              }
              return key;
            });
            const permissionIds = await Promise.all(
              permissionKeys.map(async (key) => {
                const findPermission = async () => {
                  const result =
                    await client.organizationPermissions.getOrganizationPermissionList(
                      { limit: 100, query: key }
                    );
                  return result.data.find(
                    (permission) => permission.key === key
                  );
                };
                const existing = await findPermission();
                if (existing !== undefined) {
                  return existing.id;
                }
                try {
                  const created =
                    await client.organizationPermissions.createOrganizationPermission(
                      { key, name: key }
                    );
                  return created.id;
                } catch (creationError) {
                  const concurrentlyCreated = await findPermission();
                  if (concurrentlyCreated === undefined) {
                    throw creationError;
                  }
                  return concurrentlyCreated.id;
                }
              })
            );
            const permissionSetId = createHash("sha256")
              .update(JSON.stringify(permissionKeys))
              .digest("hex")
              .slice(0, 16);
            const roleKey = `org:e2e_${permissionSetId}`;
            const findRole = async () => {
              const result =
                await client.organizationRoles.getOrganizationRoleList({
                  limit: 100,
                  query: roleKey,
                });
              return result.data.find((role) => role.key === roleKey);
            };
            let role = await findRole();
            if (role === undefined) {
              try {
                role = await client.organizationRoles.createOrganizationRole({
                  key: roleKey,
                  name: `E2E ${permissionSetId}`,
                  permissions: permissionIds,
                });
              } catch (creationError) {
                role = await findRole();
                if (role === undefined) {
                  throw creationError;
                }
              }
            } else {
              role = await client.organizationRoles.updateOrganizationRole({
                organizationRoleId: role.id,
                permissions: permissionIds,
              });
            }
            await client.organizations.createOrganizationMembership({
              organizationId: input.organizationId,
              role: role.key,
              userId: input.userId,
            });
          },
          createOrganization: async (input) =>
            await client.organizations.createOrganization(input),
          deleteOrganization: async (organizationId) => {
            await client.organizations.deleteOrganization(organizationId);
          },
        },
        signIn: async ({ emailAddress, organizationId, page }) => {
          const context = page.context();
          if (!configuredContexts.has(context)) {
            const frontendApiUrl = parsedPublishableKey.frontendApi;
            const clerkApiPattern = new RegExp(
              `^https://${escapeRegularExpression(frontendApiUrl)}/v1/`,
              "u"
            );
            await context.route(clerkApiPattern, async (route) => {
              const url = new URL(route.request().url());
              url.searchParams.set(clerkTestingTokenParameter, testingToken);
              const response = await route.fetch({ url: url.href });
              await route.fulfill({ response });
            });
            configuredContexts.add(context);
          }

          await clerk.loaded({ page });
          const users = await client.users.getUserList({
            emailAddress: [emailAddress],
          });
          const [user] = users.data;
          if (user === undefined) {
            throw new Error(`No Clerk user found with email: ${emailAddress}`);
          }
          const signInToken = await client.signInTokens.createSignInToken({
            expiresInSeconds: 300,
            userId: user.id,
          });
          await page.evaluate(
            async ({ activeOrganizationId, ticket }) => {
              const attempt = await window.Clerk.client?.signIn.create({
                strategy: "ticket",
                ticket,
              });
              if (attempt?.status !== "complete") {
                throw new Error(
                  `Clerk ticket sign-in did not complete: ${attempt?.status ?? "unavailable"}`
                );
              }
              await (activeOrganizationId === undefined
                ? window.Clerk.setActive({
                    session: attempt.createdSessionId,
                  })
                : window.Clerk.setActive({
                    organization: activeOrganizationId,
                    session: attempt.createdSessionId,
                  }));
            },
            {
              activeOrganizationId: organizationId,
              ticket: signInToken.token,
            }
          );
          await page.waitForFunction(() => window.Clerk?.user !== null);
        },
      });
    })
  );

export const authTestControlLayer = clerkAuthTestControlLayer({
  publishableKey: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  secretKey: "CLERK_SECRET_KEY",
});

export const adminAuthTestControlLayer = clerkAuthTestControlLayer({
  publishableKey: "ADMIN_CLERK_PUBLISHABLE_KEY",
  secretKey: "ADMIN_CLERK_SECRET_KEY",
});

// oxlint-disable-next-line typescript/promise-function-async -- Realm-scoped Clerk setup occurs when each worker Layer is built.
export const setupAuthTesting = () => Promise.resolve();
