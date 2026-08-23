import { Email, InvitationId } from "@repo/registration/domain/identity";
import { IdentityUsers } from "@repo/registration/services/identity-users";
import { Invitations } from "@repo/registration/services/invitations";
import { Effect, Redacted } from "effect";
import { describe, expect, it } from "vitest";

import { authCapabilities } from "./capabilities";
import { identityUsersLayer } from "./identity-users";
import { invitationsLayer } from "./invitations";

describe("deferred Clerk onboarding capabilities", () => {
  it("advertises registration onboarding as unsupported", () => {
    expect(authCapabilities.registrationOnboarding).toBeFalsy();
  });

  it("fails identity lookup with the provider contract error", async () => {
    const failure = await Effect.runPromise(
      IdentityUsers.pipe(
        Effect.flatMap((users) =>
          users.hasUserWithEmail(
            Redacted.make(Email.make("ada@example.com"), { label: "email" })
          )
        ),
        Effect.flip,
        Effect.provide(identityUsersLayer)
      )
    );

    expect(failure).toMatchObject({
      _tag: "IdentityUserLookupFailure",
      operation: "hasUserWithEmail",
    });
  });

  it("fails invitation operations with the provider contract error", async () => {
    const failure = await Effect.runPromise(
      Invitations.pipe(
        Effect.flatMap((invitations) =>
          invitations.get(InvitationId.make("invitation-1"))
        ),
        Effect.flip,
        Effect.provide(invitationsLayer)
      )
    );

    expect(failure).toMatchObject({
      _tag: "InvitationProviderFailure",
      operation: "read",
    });
  });
});
