import { Cause } from "effect";
import { CliOutput } from "effect/unstable/cli";
import { describe, expect, it } from "vitest";

import { searchCliError } from "./error-message";
import { AlgoliaProvisioningError } from "./provisioning/model";

const renderSearchError = (cause: Error) =>
  CliOutput.defaultFormatter({ colors: false }).formatError(
    searchCliError(Cause.fail(cause))
  );

describe("search command errors", () => {
  it("shows the provider cause without dumping provider credentials", () => {
    const providerError = Object.assign(
      new Error("The API key does not have access to this operation"),
      {
        correlationId: "request-123",
        error: {
          code: "forbidden",
          details: [
            {
              label: "apiKey",
              message: "Add the required Ingestion API access",
            },
          ],
        },
        headers: {
          "x-algolia-api-key": "secret-admin-key",
        },
        status: 403,
      }
    );
    const provisioningError = new AlgoliaProvisioningError({
      cause: providerError,
      message: "Algolia destination authentication creation failed",
      operation: "destination authentication creation",
    });

    const output = renderSearchError(provisioningError);

    expect(output).toContain(
      "Algolia destination authentication creation failed"
    );
    expect(output).toContain(
      "The API key does not have access to this operation"
    );
    expect(output).not.toContain("secret-admin-key");
  });
});
