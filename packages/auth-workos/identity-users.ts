import type { RedactedEmail } from "@repo/registration/domain/identity";
import {
  IdentityUserLookupFailure,
  IdentityUsers,
} from "@repo/registration/services/identity-users";
import { WorkOS } from "@workos-inc/node";
import { Config, Effect, Layer, Option, Redacted } from "effect";

type WorkosSdk = Pick<WorkOS, "userManagement">;

export type WorkosIdentityUserManagement = Pick<
  WorkosSdk["userManagement"],
  "listUsers"
>;

const providerFailure = (cause: unknown) =>
  new IdentityUserLookupFailure({
    cause,
    message: `Failed to check WorkOS user email: ${
      cause instanceof Error ? cause.message : String(cause)
    }`,
    operation: "hasUserWithEmail",
  });

export const makeWorkosIdentityUsers = (
  userManagement: WorkosIdentityUserManagement
) =>
  IdentityUsers.of({
    hasUserWithEmail: Effect.fn("IdentityUsers.Workos.hasUserWithEmail")(
      (email: RedactedEmail) =>
        Effect.tryPromise({
          catch: providerFailure,
          try: async () => {
            const users = await userManagement.listUsers({
              email: Redacted.value(email),
              limit: 1,
            });

            return users.data.length > 0;
          },
        })
    ),
  });

export const identityUsersLayer = Layer.effect(
  IdentityUsers,
  Effect.gen(function* () {
    const apiKey = yield* Config.redacted("WORKOS_API_KEY");
    const clientId = yield* Config.option(Config.string("WORKOS_CLIENT_ID"));
    const clientIdValue = Option.getOrUndefined(clientId);
    const workos = new WorkOS({
      apiKey: Redacted.value(apiKey),
      ...(clientIdValue ? { clientId: clientIdValue } : {}),
    });

    return makeWorkosIdentityUsers(workos.userManagement);
  })
);
