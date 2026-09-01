import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { createClerkClient } from "@clerk/backend";
import { isClerkAPIResponseError } from "@clerk/backend/errors";
import { parsePublishableKey } from "@clerk/shared/keys";
import { clerk } from "@clerk/testing/playwright";
import {
  AuthTestControl,
  AuthTestFailure,
} from "@repo/auth-contract/e2e/auth-test-control";
import type {
  AcceptPendingAuthInvitationInput,
  AuthTestIdentity,
} from "@repo/auth-contract/e2e/auth-test-control";
import { expect, localE2EUrl } from "@repo/e2e-testing";
import {
  Config,
  DateTime,
  Effect,
  Layer,
  Option,
  Redacted,
  Schema,
} from "effect";
import { Webhook } from "svix";

import { domainPermissionToClerkPermission } from "../session";

type Page = AcceptPendingAuthInvitationInput["page"];

interface ClerkInvitation {
  readonly emailAddress: string;
  readonly id: string;
  readonly url?: string;
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
    readonly skipPasswordRequirement: boolean;
  }) => Promise<{ readonly id: string }>;
  readonly deleteUser: (userId: string) => Promise<void>;
  readonly getInvitationList: (input: {
    readonly limit: number;
    readonly offset: number;
    readonly query: string;
    readonly status: "pending";
  }) => Promise<ClerkInvitationList>;
  readonly getUserList: (input: {
    readonly emailAddress: readonly string[];
  }) => Promise<{ readonly data: readonly { readonly id: string }[] }>;
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
  readonly acceptInvitation: (input: {
    readonly applicationUrl: string;
    readonly email: string;
    readonly firstName: string;
    readonly invitationUrl: string;
    readonly lastName: string;
    readonly page: Page;
  }) => Promise<{ readonly authUserId: string }>;
  readonly api: ClerkAuthTestApi;
  readonly authorization?: ClerkAuthTestAuthorizationApi;
  readonly deliverAcceptedInvitation?: (input: {
    readonly authUserId: string;
    readonly page: Page;
  }) => Promise<void>;
  readonly signIn: (input: {
    readonly emailAddress: string;
    readonly organizationId?: string;
    readonly page: Page;
  }) => Promise<void>;
}

const pageSize = 100;
const clerkTestingTokenParameter = "__clerk_testing_token";
const cleanupRetryAttempts = 3;
const cleanupRetryDelayMilliseconds = 250;

const TransportFailure = Schema.Struct({
  cause: Schema.optionalKey(Schema.Unknown),
  code: Schema.optionalKey(Schema.String),
});
type TransportFailure = typeof TransportFailure.Type;

const transientTransportFailureCodes = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const hasTransientTransportFailureCode = (
  transportFailure: TransportFailure
): boolean => {
  let candidate: TransportFailure | undefined = transportFailure;

  for (let depth = 0; candidate !== undefined && depth < 8; depth += 1) {
    if (
      candidate.code !== undefined &&
      transientTransportFailureCodes.has(candidate.code)
    ) {
      return true;
    }
    candidate = Option.getOrUndefined(
      Schema.decodeUnknownOption(TransportFailure)(candidate.cause)
    );
  }

  return false;
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

const failure = (operation: AuthTestFailure["operation"], cause: unknown) =>
  new AuthTestFailure({
    cause,
    message: `Clerk test ${operation} failed: ${
      cause instanceof Error ? cause.message : String(cause)
    }`,
    operation,
    provider: "clerk",
  });

const retryClerkCleanup = async <Result>(
  operation: () => Promise<Result>,
  attempt = 0
): Promise<Result> => {
  try {
    return await operation();
  } catch (error) {
    const clerkResponseError = isClerkAPIResponseError(error)
      ? error
      : undefined;
    const transportFailure = Option.getOrUndefined(
      Schema.decodeUnknownOption(TransportFailure)(error)
    );
    const retryable =
      (clerkResponseError !== undefined &&
        (clerkResponseError.status === 429 ||
          clerkResponseError.status >= 500)) ||
      (transportFailure !== undefined &&
        hasTransientTransportFailureCode(transportFailure));
    if (!retryable || attempt >= cleanupRetryAttempts - 1) {
      throw error;
    }

    const delayMilliseconds =
      clerkResponseError?.retryAfter === undefined
        ? cleanupRetryDelayMilliseconds * 2 ** attempt
        : clerkResponseError.retryAfter * 1000;
    await delay(delayMilliseconds);
    return await retryClerkCleanup(operation, attempt + 1);
  }
};

const ignoreNotFound = async (operation: () => Promise<void>) => {
  try {
    await retryClerkCleanup(operation);
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
  const getPendingInvitations = async (
    email: string,
    offset: number
  ): Promise<ClerkInvitationList> =>
    await retryClerkCleanup(
      async () =>
        await options.api.getInvitationList({
          limit: pageSize,
          offset,
          query: email,
          status: "pending",
        })
    );
  const pendingInvitationsFor = async (
    email: string
  ): Promise<readonly ClerkInvitation[]> => {
    const normalizedEmail = email.toLowerCase();
    const matchingInvitations: ClerkInvitation[] = [];
    let offset = 0;
    while (true) {
      // oxlint-disable-next-line no-await-in-loop -- Clerk pagination must be read sequentially.
      const invitations = await getPendingInvitations(email, offset);
      matchingInvitations.push(
        ...invitations.data.filter(
          (invitation) =>
            invitation.emailAddress.toLowerCase() === normalizedEmail
        )
      );
      offset += invitations.data.length;
      if (invitations.data.length === 0 || offset >= invitations.totalCount) {
        return matchingInvitations;
      }
    }
  };
  const userIdsForEmail = async (email: string): Promise<Set<string>> => {
    const users = await retryClerkCleanup(
      async () => await options.api.getUserList({ emailAddress: [email] })
    );
    return new Set(users.data.map(({ id }) => id));
  };
  const newlyCreatedUserIdsForEmail = async (
    email: string,
    preexistingUserIds: ReadonlySet<string>
  ): Promise<Set<string>> => {
    for (let attempt = 0; attempt < cleanupRetryAttempts; attempt += 1) {
      // oxlint-disable-next-line no-await-in-loop -- Clerk user indexing can lag behind a successful browser signup.
      const currentUserIds = await userIdsForEmail(email);
      const createdUserIds = new Set(
        [...currentUserIds].filter((id) => !preexistingUserIds.has(id))
      );
      if (createdUserIds.size > 0 || attempt === cleanupRetryAttempts - 1) {
        return createdUserIds;
      }
      // oxlint-disable-next-line no-await-in-loop -- Bounded compensation retry waits for Clerk user indexing.
      await delay(cleanupRetryDelayMilliseconds * 2 ** attempt);
    }
    return new Set();
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
          const [invitation] = await pendingInvitationsFor(email);
          if (invitation === undefined) {
            throw new Error(`No pending Clerk invitation exists for ${email}`);
          }
          if (invitation.url === undefined) {
            throw new Error(
              `The pending Clerk invitation for ${email} has no acceptance URL`
            );
          }

          const preexistingUserIds = await userIdsForEmail(email);
          let acceptedAuthUserId: string | undefined;
          try {
            ({ authUserId: acceptedAuthUserId } =
              await options.acceptInvitation({
                applicationUrl,
                email,
                firstName,
                invitationUrl: invitation.url,
                lastName,
                page,
              }));
            await options.deliverAcceptedInvitation?.({
              authUserId: acceptedAuthUserId,
              page,
            });
          } catch (error) {
            const cleanupFailures: unknown[] = [];
            try {
              const createdUserIds =
                acceptedAuthUserId === undefined
                  ? await newlyCreatedUserIdsForEmail(email, preexistingUserIds)
                  : new Set(
                      preexistingUserIds.has(acceptedAuthUserId)
                        ? []
                        : [acceptedAuthUserId]
                    );
              const cleanupResults = await Promise.all(
                [...createdUserIds].map(async (userId) => {
                  try {
                    await ignoreNotFound(async () => {
                      await options.api.deleteUser(userId);
                    });
                    return undefined;
                  } catch (cleanupError) {
                    return cleanupError;
                  }
                })
              );
              for (const cleanupResult of cleanupResults) {
                if (cleanupResult !== undefined) {
                  cleanupFailures.push(cleanupResult);
                }
              }
            } catch (cleanupError) {
              cleanupFailures.push(cleanupError);
            }
            if (cleanupFailures.length > 0) {
              const aggregateFailure = new AggregateError(
                [error, ...cleanupFailures],
                `Failed to clean up Clerk user after invitation acceptance failed for ${email}`,
                { cause: error }
              );
              throw aggregateFailure;
            }
            throw error;
          }
          return {
            authUserId: acceptedAuthUserId,
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
          const user = await options.api.createUser({
            emailAddress: [input.email],
            firstName: input.firstName,
            lastName: input.lastName,
            skipPasswordRequirement: true,
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
    emailAddressFor: (uniqueSeed) =>
      `delivered+clerk_test_${emailIdentityPart(uniqueSeed)}@resend.dev`,
    revokePendingInvitationsFor: (email) =>
      Effect.tryPromise({
        catch: (cause) => failure("revokeInvitations", cause),
        try: async () => {
          const matchingInvitations = await pendingInvitationsFor(email);

          await Promise.all(
            matchingInvitations.map(async ({ id: invitationId }) => {
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
  readonly webhookSecret?: string;
}

const escapeRegularExpression = (value: string): string =>
  value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const ClerkTestingState = Schema.StructWithRest(
  Schema.Struct({ captcha_bypass: Schema.optionalKey(Schema.Boolean) }),
  [Schema.Record(Schema.String, Schema.Unknown)]
);

const ClerkTestingResponse = Schema.StructWithRest(
  Schema.Struct({
    client: Schema.optionalKey(Schema.NullOr(ClerkTestingState)),
    response: Schema.optionalKey(Schema.NullOr(ClerkTestingState)),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)]
);

type ClerkTestingResponse = typeof ClerkTestingResponse.Type;

const withClerkCaptchaBypass = (
  value: ClerkTestingResponse
): ClerkTestingResponse => {
  const { client, response } = value;
  if (response?.captcha_bypass === false) {
    Object.assign(response, { captcha_bypass: true });
  }
  if (client?.captcha_bypass === false) {
    Object.assign(client, { captcha_bypass: true });
  }
  return value;
};

const clerkAuthTestControlLayer = (names: ClerkAuthTestEnvironmentNames) =>
  Layer.effect(
    AuthTestControl,
    Effect.gen(function* () {
      const publishableKey = yield* Config.string(names.publishableKey);
      const secretKey = yield* Config.redacted(names.secretKey);
      const secretKeyValue = Redacted.value(secretKey);
      const client = createClerkClient({ secretKey: secretKeyValue });
      const e2eApiUrl = Option.getOrUndefined(
        yield* Config.option(Config.string("E2E_API_URL"))
      );
      const localE2EApiUrl = localE2EUrl(e2eApiUrl);
      const localWebhookSecret =
        names.webhookSecret !== undefined && localE2EApiUrl !== undefined
          ? Redacted.value(yield* Config.redacted(names.webhookSecret))
          : undefined;
      const parsedPublishableKey = parsePublishableKey(publishableKey, {
        fatal: true,
      });
      const testingTokenResponse = yield* Effect.tryPromise({
        catch: (cause) => failure("signIn", cause),
        try: async () => await client.testingTokens.createTestingToken(),
      });
      const testingToken = testingTokenResponse.token;
      const configuredContexts = new WeakSet();

      const configureContext = async (page: Page) => {
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
            if (route.request().isNavigationRequest()) {
              await route.continue({ url: url.href });
              return;
            }
            const response = await route.fetch({ url: url.href });
            const responseJson = Schema.decodeUnknownSync(ClerkTestingResponse)(
              await response.json()
            );
            await route.fulfill({
              json: withClerkCaptchaBypass(responseJson),
              response,
            });
          });
          configuredContexts.add(context);
        }
      };

      const configurePage = async (page: Page) => {
        await configureContext(page);
        await clerk.loaded({ page });
      };

      const signInWithTicket = async (
        page: Page,
        ticket: string,
        activeOrganizationId?: string
      ) => {
        await configurePage(page);
        await page.evaluate(
          async ({ organizationId, invitationTicket }) => {
            const attempt = await window.Clerk.client?.signIn.create({
              strategy: "ticket",
              ticket: invitationTicket,
            });
            if (attempt?.status !== "complete") {
              throw new Error(
                `Clerk ticket sign-in did not complete: ${attempt?.status ?? "unavailable"}`
              );
            }
            await (organizationId === undefined
              ? window.Clerk.setActive({ session: attempt.createdSessionId })
              : window.Clerk.setActive({
                  organization: organizationId,
                  session: attempt.createdSessionId,
                }));
          },
          { invitationTicket: ticket, organizationId: activeOrganizationId }
        );
        await page.waitForFunction(() => window.Clerk?.user !== null);
      };

      const deliverAcceptedInvitation =
        localWebhookSecret === undefined || localE2EApiUrl === undefined
          ? undefined
          : async ({
              authUserId,
              page,
            }: {
              readonly authUserId: string;
              readonly page: Page;
            }) => {
              const user = await client.users.getUser(authUserId);
              const event = {
                data: {
                  created_at: user.createdAt,
                  email_addresses: user.emailAddresses.map(
                    ({ emailAddress, id }) => ({
                      email_address: emailAddress,
                      id,
                    })
                  ),
                  first_name: user.firstName,
                  id: user.id,
                  image_url: user.imageUrl,
                  last_name: user.lastName,
                  phone_numbers: user.phoneNumbers.map(({ phoneNumber }) => ({
                    phone_number: phoneNumber,
                  })),
                  primary_email_address_id: user.primaryEmailAddressId,
                  public_metadata: user.publicMetadata,
                },
                object: "event",
                type: "user.created",
              };
              const body = JSON.stringify(event);
              const messageId = `msg_${randomUUID()}`;
              const timestamp = DateTime.toDateUtc(DateTime.nowUnsafe());
              const signature = new Webhook(localWebhookSecret).sign(
                messageId,
                timestamp,
                body
              );
              const response = await page.request.post(
                new URL("/api/webhooks/clerk", localE2EApiUrl).href,
                {
                  data: body,
                  headers: {
                    "content-type": "application/json",
                    "svix-id": messageId,
                    "svix-signature": signature,
                    "svix-timestamp": String(
                      Math.floor(timestamp.getTime() / 1000)
                    ),
                  },
                }
              );
              if (!response.ok()) {
                throw new Error(
                  `The local Clerk webhook relay failed with ${response.status()}: ${await response.text()}`
                );
              }
            };

      return makeClerkAuthTestControl({
        acceptInvitation: async ({
          applicationUrl,
          email,
          firstName,
          invitationUrl,
          lastName,
          page,
        }) => {
          await configureContext(page);
          const invitationTicket = new URL(invitationUrl).searchParams.get(
            "ticket"
          );
          if (invitationTicket === null) {
            throw new Error("The Clerk invitation URL has no ticket");
          }

          await page.goto(invitationUrl);
          const expectedRedirectUrl = new URL(
            "/accept-invitation",
            applicationUrl
          );
          await expect(page).toHaveURL(
            (url) =>
              url.origin === expectedRedirectUrl.origin &&
              url.pathname === expectedRedirectUrl.pathname &&
              url.searchParams.get("__clerk_ticket") === invitationTicket
          );
          await clerk.loaded({ page });

          const signUp = page.locator(".cl-signUp-root");
          await expect(signUp).toBeVisible();

          const fillIfVisible = async (name: string, value: string) => {
            const input = signUp.locator(`input[name=${name}]`);
            if (await input.isVisible()) {
              await input.fill(value);
            }
          };
          await fillIfVisible("firstName", firstName);
          await fillIfVisible("lastName", lastName);
          await fillIfVisible(
            "username",
            `e2e_${randomUUID().replaceAll("-", "")}`
          );

          const emailInput = signUp.locator("input[name=emailAddress]");
          if (
            (await emailInput.isVisible()) &&
            (await emailInput.isEditable())
          ) {
            await emailInput.fill(email);
          }
          await signUp
            .locator("input[name=password]")
            .fill(`E2E-A9!-${randomUUID()}`);

          const legalAcceptance = signUp.locator("input[name=legalAccepted]");
          if (await legalAcceptance.isVisible()) {
            await legalAcceptance.check();
          }

          await signUp
            .getByRole("button", { exact: true, name: "Continue" })
            .click();
          await page.waitForFunction(
            () => window.Clerk?.user?.id !== undefined
          );
          const authUserId = await page.evaluate(
            () => window.Clerk.user?.id ?? null
          );
          if (authUserId === null) {
            throw new Error("Clerk invitation acceptance created no user");
          }
          return { authUserId };
        },
        api: {
          createUser: async (input) => await client.users.createUser(input),
          deleteUser: async (userId) => {
            await client.users.deleteUser(userId);
          },
          getInvitationList: async (input) =>
            await client.invitations.getInvitationList(input),
          getUserList: async (input) =>
            await client.users.getUserList({
              emailAddress: [...input.emailAddress],
            }),
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
        deliverAcceptedInvitation,
        signIn: async ({ emailAddress, organizationId, page }) => {
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
          await signInWithTicket(page, signInToken.token, organizationId);
        },
      });
    })
  );

export const authTestControlLayer = clerkAuthTestControlLayer({
  publishableKey: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  secretKey: "CLERK_SECRET_KEY",
  webhookSecret: "CLERK_WEBHOOK_SECRET",
});

export const adminAuthTestControlLayer = clerkAuthTestControlLayer({
  publishableKey: "ADMIN_CLERK_PUBLISHABLE_KEY",
  secretKey: "ADMIN_CLERK_SECRET_KEY",
});

// oxlint-disable-next-line typescript/promise-function-async -- Realm-scoped Clerk setup occurs when each worker Layer is built.
export const setupAuthTesting = () => Promise.resolve();
