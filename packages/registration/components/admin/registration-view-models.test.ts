import {
  ActionInputInvalid,
  ActionInputIssue,
  type ActionFailure,
} from "@repo/actions";
import { Result, Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  RegistrationDecisionActionError,
  RegistrationDecisionResult,
} from "./registration-view-models";

const decisionFailures = [
  { _tag: "RegistrationApiNotFound" },
  { _tag: "RegistrationAlreadyApproved" },
  { _tag: "RegistrationAlreadyRejected" },
  { _tag: "RegistrationDecisionConflict" },
  { _tag: "RegistrationDecisionAlreadyProcessing" },
  { _tag: "RegistrationApiUnauthorized" },
  { _tag: "RegistrationApiForbidden" },
  { _tag: "RegistrationDecisionUnavailable" },
  new ActionInputInvalid({
    issues: [
      new ActionInputIssue({
        path: ["registrationId"],
        message: "Invalid input.",
      }),
    ],
  }),
] satisfies ReadonlyArray<
  ActionFailure<typeof RegistrationDecisionActionError>
>;

describe("RegistrationDecisionResult", () => {
  it.each(decisionFailures)("round-trips the $_tag failure", (failure) => {
    const encoded = Schema.encodeSync(RegistrationDecisionResult)(
      Result.fail(failure)
    );
    const decoded = Schema.decodeUnknownSync(RegistrationDecisionResult)(
      encoded
    );
    const reencoded = Schema.encodeSync(RegistrationDecisionResult)(decoded);

    expect(reencoded).toEqual(encoded);
  });
});
