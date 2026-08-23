import { AuthUserId, Email } from "@repo/registration/domain/identity";
import { Effect, Redacted } from "effect";
import { describe, expect, it } from "vitest";

import { authCapabilities } from "./capabilities";
import { makeClerkIdentityUsers } from "./identity-users";
import type { ClerkIdentityUsersApi } from "./identity-users";

const user = {
  emailAddresses: [
    { emailAddress: "secondary@example.com", id: "email-secondary" },
    { emailAddress: "ada@example.com", id: "email-primary" },
  ],
  firstName: "Ada",
  id: "user-1",
  lastName: "Lovelace",
  primaryEmailAddressId: "email-primary",
};

describe(makeClerkIdentityUsers, () => {
  it("advertises registration onboarding support", () => {
    expect(authCapabilities.companyMemberInvitationIssuance).toBeTruthy();
    expect(authCapabilities.registrationOnboarding).toBeTruthy();
  });

  it("maps the primary Clerk email to the domain identity profile", async () => {
    const users = makeClerkIdentityUsers({
      getUser: async () => await Promise.resolve(user),
      getUserList: async () => await Promise.resolve({ data: [] }),
    });

    const profile = await Effect.runPromise(
      users.getById(AuthUserId.make("user-1"))
    );

    expect(Redacted.value(profile.email)).toBe("ada@example.com");
    expect(profile.name).toBe("Ada Lovelace");
  });

  it("requires an exact normalized email match in Clerk search results", async () => {
    let listInput:
      | Parameters<ClerkIdentityUsersApi["getUserList"]>[0]
      | undefined;
    const users = makeClerkIdentityUsers({
      getUser: async () => await Promise.resolve(user),
      getUserList: async (input) => {
        listInput = input;
        return await Promise.resolve({ data: [user] });
      },
    });
    const email = Redacted.make(Email.make(" ADA@EXAMPLE.COM "), {
      label: "email",
    });

    const found = await Effect.runPromise(users.hasUserWithEmail(email));

    expect(found).toBeTruthy();
    expect(listInput).toStrictEqual({
      emailAddress: ["ada@example.com"],
      limit: 1,
    });
  });

  it("maps unexpected SDK failures into the provider error channel", async () => {
    const users = makeClerkIdentityUsers({
      getUser: async () => {
        await Promise.resolve();
        throw new Error("Clerk unavailable");
      },
      getUserList: async () => await Promise.resolve({ data: [] }),
    });

    const failure = await Effect.runPromise(
      users.getById(AuthUserId.make("user-1")).pipe(Effect.flip)
    );

    expect(failure).toMatchObject({
      _tag: "IdentityUserLookupFailure",
      operation: "getById",
      reason: "unexpectedResponse",
    });
  });
});
