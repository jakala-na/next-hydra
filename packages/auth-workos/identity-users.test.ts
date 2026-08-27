import { AuthUserId, Email } from "@repo/registration/domain/identity";
import {
  IdentityUserLookupFailure,
  IdentityUserNotFound,
  IdentityUsers,
} from "@repo/registration/services/identity-users";
import {
  NotFoundException,
  RateLimitExceededException,
  UnauthorizedException,
} from "@workos-inc/node";
import { Cause, Effect, Layer, Option, Redacted } from "effect";
import { describe, expect, it } from "vitest";

import { makeWorkosIdentityUsers } from "./identity-users";
import type { WorkosIdentityUserManagement } from "./identity-users";

const email = Redacted.make(Email.make("ada@example.com"), { label: "email" });

const makeUserManagement = (
  overrides: Partial<WorkosIdentityUserManagement> = {}
): WorkosIdentityUserManagement => ({
  getUser: async () => ({
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
  }),
  listUsers: async () => ({ data: [] }),
  ...overrides,
});

const makeLayer = (userManagement: WorkosIdentityUserManagement) =>
  Layer.succeed(IdentityUsers, makeWorkosIdentityUsers(userManagement));

describe(makeWorkosIdentityUsers, () => {
  it("checks WorkOS users by email with a one-record query", async () => {
    let listInput:
      | Parameters<WorkosIdentityUserManagement["listUsers"]>[0]
      | undefined;
    const layer = makeLayer(
      makeUserManagement({
        listUsers: async (input) => {
          listInput = input;
          return {
            data: [{ email: "ada@example.com", id: "user-1" }],
          };
        },
      })
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const identityUsers = yield* IdentityUsers;
        const exists = yield* identityUsers.hasUserWithEmail(email);
        const profile = yield* identityUsers.findByEmail(email);

        expect(exists).toBeTruthy();
        expect(Option.getOrUndefined(profile)).toMatchObject({
          authUserId: "user-1",
          name: "ada@example.com",
        });
        expect(listInput).toStrictEqual({
          email: "ada@example.com",
          limit: 1,
        });
      }).pipe(Effect.provide(layer))
    );
  });

  it("resolves a schema-backed identity profile by auth user id", async () => {
    let requestedAuthUserId: string | undefined;
    const layer = makeLayer(
      makeUserManagement({
        getUser: async (authUserId) => {
          requestedAuthUserId = authUserId;
          return {
            email: "reviewer@example.com",
            firstName: "Grace",
            lastName: "Hopper",
          };
        },
      })
    );

    const profile = await Effect.runPromise(
      Effect.gen(function* () {
        const identityUsers = yield* IdentityUsers;
        return yield* identityUsers.getById(AuthUserId.make("user-1"));
      }).pipe(Effect.provide(layer))
    );

    expect(requestedAuthUserId).toBe("user-1");
    expect(profile.authUserId).toBe("user-1");
    expect(Redacted.value(profile.email)).toBe("reviewer@example.com");
    if (profile.firstName === undefined || profile.lastName === undefined) {
      throw new Error("Expected WorkOS profile names");
    }
    expect(Redacted.value(profile.firstName)).toBe("Grace");
    expect(Redacted.value(profile.lastName)).toBe("Hopper");
    expect(profile.name).toBe("Grace Hopper");
  });

  it("maps coded WorkOS transport failures to unavailable identity lookups", async () => {
    const layer = makeLayer(
      makeUserManagement({
        getUser: async () => {
          throw new TypeError("fetch failed", {
            cause: Object.assign(new Error("socket reset"), {
              code: "ECONNRESET",
            }),
          });
        },
      })
    );

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const identityUsers = yield* IdentityUsers;
        return yield* identityUsers
          .getById(AuthUserId.make("user-1"))
          .pipe(Effect.flip);
      }).pipe(Effect.provide(layer))
    );

    expect(failure).toBeInstanceOf(IdentityUserLookupFailure);
    expect(failure).toMatchObject({
      operation: "getById",
      reason: "unavailable",
    });
  });

  it("does not infer provider availability from TypeError alone", async () => {
    const layer = makeLayer(
      makeUserManagement({
        getUser: async () => {
          throw new TypeError("application bug");
        },
      })
    );

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const identityUsers = yield* IdentityUsers;
        return yield* identityUsers
          .getById(AuthUserId.make("user-1"))
          .pipe(Effect.flip);
      }).pipe(Effect.provide(layer))
    );

    expect(failure).toMatchObject({
      operation: "getById",
      reason: "unexpectedResponse",
    });
  });

  it("classifies WorkOS rate limits as recoverable", async () => {
    const layer = makeLayer(
      makeUserManagement({
        listUsers: async () => {
          throw new RateLimitExceededException(
            "Too many requests",
            "request-1",
            10
          );
        },
      })
    );

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const identityUsers = yield* IdentityUsers;
        return yield* identityUsers.hasUserWithEmail(email).pipe(Effect.flip);
      }).pipe(Effect.provide(layer))
    );

    expect(failure).toMatchObject({
      operation: "findByEmail",
      reason: "unavailable",
    });
  });

  it("treats malformed WorkOS user lists as defects", async () => {
    const layer = makeLayer(
      makeUserManagement({
        listUsers: async () => ({ users: [] }),
      })
    );

    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        const identityUsers = yield* IdentityUsers;
        return yield* identityUsers.hasUserWithEmail(email).pipe(Effect.exit);
      }).pipe(Effect.provide(layer))
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(Cause.hasDies(exit.cause)).toBeTruthy();
    }
  });

  it("maps a missing WorkOS profile to identity user not found", async () => {
    const layer = makeLayer(
      makeUserManagement({
        getUser: async () => {
          throw new NotFoundException({
            path: "/user_management/users/user-1",
            requestID: "request-1",
          });
        },
      })
    );

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const identityUsers = yield* IdentityUsers;
        return yield* identityUsers
          .getById(AuthUserId.make("user-1"))
          .pipe(Effect.flip);
      }).pipe(Effect.provide(layer))
    );

    expect(failure).toBeInstanceOf(IdentityUserNotFound);
    expect(failure).toMatchObject({ authUserId: "user-1" });
  });

  it("rejects malformed WorkOS profiles at the schema boundary", async () => {
    const layer = makeLayer(
      makeUserManagement({
        getUser: async () => ({ firstName: "Missing email" }),
      })
    );

    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        const identityUsers = yield* IdentityUsers;
        return yield* identityUsers
          .getById(AuthUserId.make("user-1"))
          .pipe(Effect.exit);
      }).pipe(Effect.provide(layer))
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      expect(Cause.hasDies(exit.cause)).toBeTruthy();
    }
  });

  it("classifies WorkOS authentication failures as unexpected", async () => {
    const layer = makeLayer(
      makeUserManagement({
        listUsers: async () => {
          throw new UnauthorizedException("request-1");
        },
      })
    );

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const identityUsers = yield* IdentityUsers;
        return yield* identityUsers.hasUserWithEmail(email).pipe(Effect.flip);
      }).pipe(Effect.provide(layer))
    );

    expect(failure).toBeInstanceOf(IdentityUserLookupFailure);
    expect(failure).toMatchObject({
      operation: "findByEmail",
      reason: "unexpectedResponse",
    });
  });
});
