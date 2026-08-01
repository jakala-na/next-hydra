import { describe, expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import { vi } from "vitest";
import {
  decodeConcurrentModification,
  PreserveVersionedWriteConflict,
  RetryVersionedWrite,
  retryVersionedWrite,
} from "./versioned-write";

const INITIAL_VERSION = 7;
const REST_CURRENT_VERSION = 8;
const GRAPHQL_CURRENT_VERSION = 9;

const restConflict = {
  statusCode: 409,
  body: {
    errors: [
      {
        code: "ConcurrentModification",
        currentVersion: REST_CURRENT_VERSION,
      },
    ],
  },
};

describe("decodeConcurrentModification", () => {
  it("decodes the provider current version from REST errors", () => {
    const result = decodeConcurrentModification(restConflict);

    expect(Option.getOrThrow(result).currentVersion).toBe(REST_CURRENT_VERSION);
  });

  it("decodes the provider current version from GraphQL errors", () => {
    const result = decodeConcurrentModification({
      graphQLErrors: [
        {
          extensions: {
            code: "ConcurrentModification",
            currentVersion: GRAPHQL_CURRENT_VERSION,
          },
        },
      ],
    });

    expect(Option.getOrThrow(result).currentVersion).toBe(
      GRAPHQL_CURRENT_VERSION
    );
  });
});

describe("retryVersionedWrite", () => {
  it.effect(
    "retries once with the input selected by conflict resolution",
    () => {
      const attempt = vi
        .fn<(input: { version: number }) => Effect.Effect<string, unknown>>()
        .mockReturnValueOnce(Effect.fail(restConflict))
        .mockReturnValueOnce(Effect.succeed("saved"));

      return Effect.gen(function* () {
        const result = yield* retryVersionedWrite({
          operation: "cart.save",
          input: { version: INITIAL_VERSION },
          attempt,
          resolveConflict: (conflict, input) =>
            Effect.succeed(
              new RetryVersionedWrite({
                ...input,
                version: conflict.currentVersion,
              })
            ),
        });

        expect(result).toBe("saved");
        expect(attempt).toHaveBeenNthCalledWith(1, {
          version: INITIAL_VERSION,
        });
        expect(attempt).toHaveBeenNthCalledWith(2, {
          version: REST_CURRENT_VERSION,
        });
      });
    }
  );

  it.effect(
    "preserves a conflict when the operation is not safe to retry",
    () => {
      const attempt = vi
        .fn<(input: { version: number }) => Effect.Effect<string, unknown>>()
        .mockReturnValueOnce(Effect.fail(restConflict));

      return Effect.gen(function* () {
        const error = yield* retryVersionedWrite({
          operation: "cart.save",
          input: { version: INITIAL_VERSION },
          attempt,
          resolveConflict: () =>
            Effect.succeed(new PreserveVersionedWriteConflict()),
        }).pipe(Effect.flip);

        expect(error).toBe(restConflict);
        expect(attempt).toHaveBeenCalledTimes(1);
      });
    }
  );

  it.effect("does not resolve non-concurrent failures", () => {
    const failure = new Error("provider unavailable");
    const attempt = vi
      .fn<(input: { version: number }) => Effect.Effect<string, unknown>>()
      .mockReturnValueOnce(Effect.fail(failure));
    const resolveConflict = vi.fn(() =>
      Effect.succeed(new PreserveVersionedWriteConflict())
    );

    return Effect.gen(function* () {
      const error = yield* retryVersionedWrite({
        operation: "cart.save",
        input: { version: INITIAL_VERSION },
        attempt,
        resolveConflict,
      }).pipe(Effect.flip);

      expect(error).toBe(failure);
      expect(resolveConflict).not.toHaveBeenCalled();
    });
  });
});
