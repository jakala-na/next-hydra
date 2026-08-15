import { AuthUserId, Email } from "@repo/registration/domain/identity";
import {
  IdentityUserLookupFailure,
  IdentityUserNotFound,
  IdentityUsers,
} from "@repo/registration/services/identity-users";
import { NotFoundException } from "@workos-inc/node";
import { Effect, Layer, Redacted } from "effect";
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

  it("maps WorkOS profile failures to identity lookup failures", async () => {
    const layer = makeLayer(
      makeUserManagement({
        getUser: () => Promise.reject(new Error("workos down")),
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
    expect(failure).toMatchObject({ operation: "getById" });
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

    const failure = await Effect.runPromise(
      Effect.gen(function* () {
        const identityUsers = yield* IdentityUsers;
        return yield* identityUsers
          .getById(AuthUserId.make("user-1"))
          .pipe(Effect.flip);
      }).pipe(Effect.provide(layer))
    );

    expect(failure).toBeInstanceOf(IdentityUserLookupFailure);
    expect(failure).toMatchObject({ operation: "getById" });
  });

  it("maps WorkOS lookup failures to identity lookup failures", async () => {
    const layer = makeLayer(
      makeUserManagement({
        listUsers: () => Promise.reject(new Error("workos down")),
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
      expect(exit.cause.toString()).toContain(IdentityUserLookupFailure.name);
    }
  });
});
