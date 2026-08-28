import { describe, expect, it } from "vitest";

import { toError } from "./boundary";
import { makeUnexpected } from "./http";

describe(toError, () => {
  it("preserves JavaScript errors that already have a message", () => {
    const cause = new TypeError("Provider failed");

    expect(toError(cause, "Fallback message")).toBe(cause);
  });

  it("supplies a fallback for JavaScript errors without a message", () => {
    const cause = new TypeError("Provider omitted its diagnostic message");
    cause.message = "";
    const error = toError(cause, "Fallback message");

    expect(error).toMatchObject({
      message: "Fallback message",
      name: "TypeError",
    });
    expect(error.cause).toBe(cause);
  });

  it("preserves public error identity and diagnostics as an Error cause", () => {
    const cause = makeUnexpected();
    const error = toError(cause, "Fallback message");

    expect(error).toMatchObject({
      message: "[unexpected] Something went wrong.",
      name: "Unexpected",
    });
    expect(error.cause).toBe(cause);
  });

  it("uses the fallback while preserving an unknown cause", () => {
    const cause = { defect: "plain object" };
    const error = toError(cause, "Fallback message");

    expect(error.message).toBe("Fallback message");
    expect(error.cause).toBe(cause);
  });
});
