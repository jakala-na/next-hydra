import { Effect, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { Unexpected, makeUnexpected } from "./http";
import {
  ErrorIssue,
  InputInvalid,
  definePublicError,
  makeInputInvalid,
  makeSchemaErrorIssues,
} from "./index";

describe("public errors", () => {
  it("keeps the exact tag alongside the broad category", () => {
    const CartMismatch = definePublicError({
      category: "conflict",
      code: "checkout.cartMismatch",
      fields: {
        currentCartId: Schema.String,
        inputCartId: Schema.String,
      },
      recovery: "refresh",
      status: 409,
      tag: "CheckoutCartMismatch",
    });

    expect(
      CartMismatch.make({
        currentCartId: "current",
        inputCartId: "input",
        message: "The cart changed.",
      })
    ).toStrictEqual({
      _tag: "CheckoutCartMismatch",
      category: "conflict",
      code: "checkout.cartMismatch",
      currentCartId: "current",
      inputCartId: "input",
      message: "The cart changed.",
      recovery: "refresh",
    });
  });

  it("round-trips the common input failure", () => {
    const failure = makeInputInvalid({
      issues: [new ErrorIssue({ message: "Invalid.", path: ["email"] })],
      message: "The input is invalid.",
    });

    expect(Schema.decodeSync(InputInvalid)(failure)).toStrictEqual(failure);
    expect(Schema.encodeSync(InputInvalid)(failure)).toStrictEqual({
      _tag: "InputInvalid",
      category: "bad_input",
      code: "input.invalid",
      issues: [{ message: "Invalid.", path: ["email"] }],
      message: "The input is invalid.",
      recovery: "fix_input",
    });
  });

  it("keeps Schema paths while replacing diagnostic prose", async () => {
    const error = await Effect.runPromise(
      Schema.decodeUnknownEffect(
        Schema.Struct({ address: Schema.Struct({ country: Schema.String }) })
      )({ address: {} }).pipe(Effect.flip)
    );

    expect(makeSchemaErrorIssues(error, "Invalid input.")).toEqual([
      new ErrorIssue({
        message: "Invalid input.",
        path: ["address", "country"],
      }),
    ]);
  });

  it("round-trips the common safe HTTP defect projection", () => {
    const failure = makeUnexpected();

    expect(Schema.decodeSync(Unexpected)(failure)).toStrictEqual(failure);
    expect(Schema.encodeSync(Unexpected)(failure)).toStrictEqual({
      _tag: "Unexpected",
      category: "unexpected",
      code: "unexpected",
      message: "Something went wrong.",
      recovery: "none",
    });
  });
});
