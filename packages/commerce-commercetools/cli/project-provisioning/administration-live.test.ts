import { describe, expect, it } from "vitest";

import { runtimeClientCreationError } from "./administration-live";
import {
  ProjectAdministrationError,
  RuntimeClientCreationOutcomeUnknown,
} from "./model";

describe(runtimeClientCreationError, () => {
  it("treats a provider rejection as a confirmed creation failure", () => {
    const cause = Object.assign(new Error("insufficient scope"), {
      code: "insufficient_scope",
      statusCode: 403,
    });

    const error = runtimeClientCreationError(cause, "Runtime");

    expect(error).toBeInstanceOf(ProjectAdministrationError);
    expect(error).toMatchObject({
      cause,
      message: 'Commercetools rejected runtime API Client "Runtime"',
      operation: "createRuntimeClient",
    });
  });

  it("preserves the warning when the provider outcome is unknown", () => {
    const cause = new Error("fetch failed");

    const error = runtimeClientCreationError(cause, "Runtime");

    expect(error).toBeInstanceOf(RuntimeClientCreationOutcomeUnknown);
    expect(error).toMatchObject({
      cause,
      clientName: "Runtime",
      message: "The runtime API Client creation outcome could not be confirmed",
    });
  });
});
