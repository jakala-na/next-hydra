import { CliError, CliOutput } from "effect/unstable/cli";
import { describe, expect, it } from "vitest";

import {
  ProjectAdministrationError,
  RuntimeClientCreationOutcomeUnknown,
} from "../project-provisioning/model";
import { projectUserMessage } from "./project";

const renderProjectError = (cause: Error) =>
  CliOutput.defaultFormatter({ colors: false }).formatError(
    new CliError.UserError({
      cause,
      userMessage: projectUserMessage(cause),
    })
  );

describe("project command errors", () => {
  it("shows the Commercetools response when runtime client creation is rejected", () => {
    const providerError = Object.assign(
      new Error("The OAuth token does not have sufficient scope"),
      {
        code: "insufficient_scope",
        statusCode: 403,
      }
    );
    const provisioningError = new ProjectAdministrationError({
      cause: providerError,
      message: 'Commercetools rejected runtime API Client "Runtime"',
      operation: "createRuntimeClient",
    });

    const output = renderProjectError(provisioningError);

    expect(output).toContain(
      'Commercetools rejected runtime API Client "Runtime"'
    );
    expect(output).toContain("403");
    expect(output).toContain("The OAuth token does not have sufficient scope");
    expect(output).not.toContain("may have succeeded");
  });

  it("warns against retrying when the creation outcome is unknown", () => {
    const provisioningError = new RuntimeClientCreationOutcomeUnknown({
      cause: new Error("fetch failed"),
      clientName: "Runtime",
      message: "The runtime API Client creation outcome could not be confirmed",
    });

    const output = renderProjectError(provisioningError);

    expect(output).toContain("fetch failed");
    expect(output).toContain("Runtime API Client: Runtime");
    expect(output).toContain(
      "Creation may have succeeded; check API Clients before retrying"
    );
  });
});
