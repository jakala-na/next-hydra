import type {
  ApproveRegistrationInput,
  RegistrationDecisionSuccess,
} from "@repo/registration/components/admin/registration-view-models";
import { REGISTRATION_DECIDE_PERMISSION } from "@repo/registration/http/registration-api";
import type { RegistrationDecisionPublicError } from "@repo/registration/public-errors";
import {
  registrationForbidden,
  registrationUnauthorized,
} from "@repo/registration/public-errors";
import { Context, Effect, Layer, Redacted } from "effect";

import type { CurrentAuthSnapshot } from "./current-auth-api";

export type DecideRegistrationInput = ApproveRegistrationInput & {
  readonly decision: "approved" | "rejected";
};

export type RegistrationDecision = typeof RegistrationDecisionSuccess.Type;

export type DecideRegistration = (
  input: DecideRegistrationInput,
  accessToken: string
) => Effect.Effect<RegistrationDecision, RegistrationDecisionPublicError>;

export class RegistrationReviewers extends Context.Service<
  RegistrationReviewers,
  {
    readonly decide: (
      input: DecideRegistrationInput
    ) => Effect.Effect<RegistrationDecision, RegistrationDecisionPublicError>;
  }
>()("@repo/web/RegistrationReviewers") {}

export const registrationReviewersLayerFrom = (
  session: CurrentAuthSnapshot,
  decide: DecideRegistration
): Layer.Layer<
  RegistrationReviewers,
  | ReturnType<typeof registrationUnauthorized>
  | ReturnType<typeof registrationForbidden>
> =>
  Layer.effect(
    RegistrationReviewers,
    Effect.gen(function* () {
      if (session.userId === undefined || session.accessToken === undefined) {
        return yield* Effect.fail(registrationUnauthorized());
      }

      if (!session.permissions.includes(REGISTRATION_DECIDE_PERMISSION)) {
        return yield* Effect.fail(registrationForbidden());
      }

      const { accessToken } = session;

      return RegistrationReviewers.of({
        decide: (input) => decide(input, Redacted.value(accessToken)),
      });
    })
  );
