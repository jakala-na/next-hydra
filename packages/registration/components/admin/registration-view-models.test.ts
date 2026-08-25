import type { ActionFailure } from "@repo/actions";
import { ErrorIssue, makeInputInvalid } from "@repo/errors";
import { Result, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { RegistrationId } from "../../domain/identity";
import {
  RegistrationAlreadyApprovedFailure,
  RegistrationAlreadyRejectedFailure,
  RegistrationApiAuthenticationUnavailableFailure,
  RegistrationDecisionOutcomeUnknownFailure,
  RegistrationApiErrorFailure,
  RegistrationApiForbiddenFailure,
  RegistrationApiUnauthorizedFailure,
  RegistrationDecisionAlreadyProcessingFailure,
  RegistrationTransitionConflictFailure,
  PublicRegistrationConcurrentModificationFailure,
  PublicRegistrationNotFoundFailure,
} from "../../public-errors";
import type { RegistrationDecisionActionError } from "./registration-view-models";
import { RegistrationDecisionResult } from "./registration-view-models";

const decisionFailures = [
  PublicRegistrationNotFoundFailure.make({ message: "Not found." }),
  RegistrationAlreadyApprovedFailure.make({ message: "Already approved." }),
  RegistrationAlreadyRejectedFailure.make({ message: "Already rejected." }),
  PublicRegistrationConcurrentModificationFailure.make({
    message: "Changed.",
  }),
  RegistrationTransitionConflictFailure.make({
    message: "State changed.",
  }),
  RegistrationDecisionAlreadyProcessingFailure.make({
    message: "Already processing.",
  }),
  RegistrationApiUnauthorizedFailure.make({ message: "Sign in." }),
  RegistrationApiForbiddenFailure.make({ message: "Forbidden." }),
  RegistrationApiErrorFailure.make({ message: "Unavailable." }),
  RegistrationDecisionOutcomeUnknownFailure.make({
    message: "Decision outcome is unknown.",
    registrationId: RegistrationId.make("registration-unknown"),
  }),
  RegistrationApiAuthenticationUnavailableFailure.make({
    message: "Authentication unavailable.",
  }),
  makeInputInvalid({
    issues: [
      new ErrorIssue({
        message: "Invalid input.",
        path: ["registrationId"],
      }),
    ],
    message: "Invalid input.",
  }),
] satisfies readonly ActionFailure<typeof RegistrationDecisionActionError>[];

describe("RegistrationDecisionResult", () => {
  it.each(decisionFailures)("round-trips the $_tag failure", (failure) => {
    const encoded = Schema.encodeSync(RegistrationDecisionResult)(
      Result.fail(failure)
    );
    const decoded = Schema.decodeUnknownSync(RegistrationDecisionResult)(
      encoded
    );
    const reencoded = Schema.encodeSync(RegistrationDecisionResult)(decoded);

    expect(reencoded).toStrictEqual(encoded);
  });
});
