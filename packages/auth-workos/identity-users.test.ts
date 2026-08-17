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
import { Cause, Effect, Layer, Redacted } from "effect";
import { describe, expect, it } from "vitest";

import {
  makeWorkosIdentityUsers,
  type WorkosIdentityUserManagement,
} from "./identity-users";

const email = Redacted.make(Email.make("ada@example.com"), { label: "email" });

const makeUserManagement = (
  overrides: Partial<WorkosIdentityUserManagement> = {}
): WorkosIdentityUserManagement => ({
  getUser: () =>
    Promise.resolve({
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
    }),
  listUsers: () => Promise.resolve({ data: [] }),
  ...overrides,
});

const makeLayer = (userManagement: WorkosIdentityUserManagement) =>
  Layer.succeed(IdentityUsers, makeWorkosIdentityUsers(userManagement));

describe("makeWorkosIdentityUsers", () => {
  it("checks WorkOS users by email with a one-record query", async () => {
    let listInput:
      | Parameters<WorkosIdentityUserManagement["listUsers"]>[0]
      | undefined;
    const layer = makeLayer(
      makeUserManagement({
        listUsers: (input) => {
          listInput = input;
          return Promise.resolve({
            data: [{ id: "user-1", email: "ada@example.com" }],
          });
        },
      })
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        const identityUsers = yield* IdentityUsers;
        const exists = yield* identityUsers.hasUserWithEmail(email);

        expect(exists).toBe(true);
        expect(listInput).toEqual({
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
        getUser: (authUserId) => {
          requestedAuthUserId = authUserId;
          return Promise.resolve({
            email: "reviewer@example.com",
            firstName: "Grace",
            lastName: "Hopper",
          });
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
    expect(profile.name).toBe("Grace Hopper");
  });

  it("maps coded WorkOS transport failures to unavailable identity lookups", async () => {
    const layer = makeLayer(
      makeUserManagement({
        getUser: () =>
          Promise.reject(
            new TypeError("fetch failed", {
              cause: Object.assign(new Error("socket reset"), {
                code: "ECONNRESET",
              }),
            })
          ),
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
        getUser: () => Promise.reject(new TypeError("application bug")),
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
        listUsers: () =>
          Promise.reject(
            new RateLimitExceededException("Too many requests", "request-1", 10)
          ),
      })
    );

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const identityUsers = yield* IdentityUsers;
        return yield* identityUsers.hasUserWithEmail(email).pipe(Effect.flip);
      }).pipe(Effect.provide(layer))
    );

    expect(failure).toMatchObject({
      operation: "hasUserWithEmail",
      reason: "unavailable",
    });
  });

  it("treats malformed WorkOS user lists as defects", async () => {
    const layer = makeLayer(
      makeUserManagement({
        listUsers: () => Promise.resolve({ users: [] }),
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
      expect(Cause.hasDies(exit.cause)).toBe(true);
    }
  });

  it("maps a missing WorkOS profile to identity user not found", async () => {
    const layer = makeLayer(
      makeUserManagement({
        getUser: () =>
          Promise.reject(
            new NotFoundException({
              path: "/user_management/users/user-1",
              requestID: "request-1",
            })
          ),
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
        getUser: () => Promise.resolve({ firstName: "Missing email" }),
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
      expect(Cause.hasDies(exit.cause)).toBe(true);
    }
  });

  it("classifies WorkOS authentication failures as unexpected", async () => {
    const layer = makeLayer(
      makeUserManagement({
        listUsers: () => Promise.reject(new UnauthorizedException("request-1")),
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
      operation: "hasUserWithEmail",
      reason: "unexpectedResponse",
    });
  });
});
