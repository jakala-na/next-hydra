import { describe, expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import { vi } from "vitest";

import {
  commercetoolsProviderFailureReason,
  decodeConcurrentModification,
  isCommercetoolsClientFailure,
  PreserveVersionedWriteConflict,
  RetryVersionedWrite,
  retryVersionedWrite,
} from "./versioned-write";

const INITIAL_VERSION = 7;
const REST_CURRENT_VERSION = 8;
const GRAPHQL_CURRENT_VERSION = 9;

describe(commercetoolsProviderFailureReason, () => {
  it("keeps rate limits recoverable instead of classifying them as client defects", () => {
    const rateLimit = { statusCode: 429 };

    expect(isCommercetoolsClientFailure(rateLimit)).toBeFalsy();
    expect(commercetoolsProviderFailureReason(rateLimit)).toBe("unavailable");
  });

  it("classifies non-recoverable client responses as unexpected", () => {
    const invalidRequest = { statusCode: 400 };

    expect(isCommercetoolsClientFailure(invalidRequest)).toBeTruthy();
    expect(commercetoolsProviderFailureReason(invalidRequest)).toBe(
      "unexpectedResponse"
    );
  });

  it("keeps request timeouts recoverable", () => {
    expect(commercetoolsProviderFailureReason({ statusCode: 408 })).toBe(
      "unavailable"
    );
  });

  it("does not classify unknown exceptions as provider availability", () => {
    expect(commercetoolsProviderFailureReason(new Error("bug"))).toBe(
      "unexpectedResponse"
    );
    expect(
      commercetoolsProviderFailureReason(new TypeError("application bug"))
    ).toBe("unexpectedResponse");
  });

  it("recognizes coded transport failures through nested causes", () => {
    expect(
      commercetoolsProviderFailureReason(
        new TypeError("fetch failed", {
          cause: Object.assign(new Error("socket reset"), {
            code: "ECONNRESET",
          }),
        })
      )
    ).toBe("unavailable");
  });
});

const restConflict = {
  body: {
    errors: [
      {
        code: "ConcurrentModification",
        currentVersion: REST_CURRENT_VERSION,
      },
    ],
  },
  statusCode: 409,
};

describe(decodeConcurrentModification, () => {
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

describe(retryVersionedWrite, () => {
  it.effect(
    "retries once with the input selected by conflict resolution",
    () => {
      const attempt = vi
        .fn<(input: { version: number }) => Effect.Effect<string, unknown>>()
        .mockReturnValueOnce(Effect.fail(restConflict))
        .mockReturnValueOnce(Effect.succeed("saved"));

      return Effect.gen(function* () {
        const result = yield* retryVersionedWrite({
          attempt,
          input: { version: INITIAL_VERSION },
          operation: "cart.save",
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
          attempt,
          input: { version: INITIAL_VERSION },
          operation: "cart.save",
          resolveConflict: () =>
            Effect.succeed(new PreserveVersionedWriteConflict()),
        }).pipe(Effect.flip);

        expect(error).toBe(restConflict);
        expect(attempt).toHaveBeenCalledOnce();
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
        attempt,
        input: { version: INITIAL_VERSION },
        operation: "cart.save",
        resolveConflict,
      }).pipe(Effect.flip);

      expect(error).toBe(failure);
      expect(resolveConflict).not.toHaveBeenCalled();
    });
  });
});
