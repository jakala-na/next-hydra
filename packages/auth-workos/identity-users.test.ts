import { Email } from "@repo/registration-effect/domain/identity";
import {
  IdentityUserLookupFailure,
  IdentityUsers,
} from "@repo/registration-effect/services/identity-users";
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
  listUsers: () =>
    Promise.resolve({
      data: [],
    } as unknown as Awaited<
      ReturnType<WorkosIdentityUserManagement["listUsers"]>
    >),
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
          } as unknown as Awaited<
            ReturnType<WorkosIdentityUserManagement["listUsers"]>
          >);
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
