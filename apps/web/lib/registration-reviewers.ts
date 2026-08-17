import "server-only";
import { REGISTRATION_DECIDE_PERMISSION } from "@repo/registration/http/registration-api";
import {
  registrationForbidden,
  registrationUnauthorized,
} from "@repo/registration/public-errors";
import { Context, Effect, Layer, Redacted } from "effect";

import { decideAdminRegistration } from "./admin-registration";
import type { CurrentAuthSnapshot } from "./current-auth";

type DecideRegistrationInput = Parameters<typeof decideAdminRegistration>[0];
type DecideRegistration = (
  input: DecideRegistrationInput
) => ReturnType<typeof decideAdminRegistration>;

export class RegistrationReviewers extends Context.Service<
  RegistrationReviewers,
  { readonly decide: DecideRegistration }
>()("@repo/web/RegistrationReviewers") {}

const unauthorized = registrationUnauthorized;

const forbidden = registrationForbidden;

export const registrationReviewersLayer = (
  session: CurrentAuthSnapshot
): Layer.Layer<
  RegistrationReviewers,
  ReturnType<typeof unauthorized> | ReturnType<typeof forbidden>
> =>
  Layer.effect(
    RegistrationReviewers,
    Effect.gen(function* registrationReviewersEffect() {
      if (session.userId === undefined || session.accessToken === undefined) {
        return yield* Effect.fail(unauthorized());
      }

      if (!session.permissions.includes(REGISTRATION_DECIDE_PERMISSION)) {
        return yield* Effect.fail(forbidden());
      }

      const accessToken = session.accessToken;

      return RegistrationReviewers.of({
        decide: (input) =>
          decideAdminRegistration(input, Redacted.value(accessToken)),
      });
    })
  );

export type RegistrationReviewerDecisionFailure = Effect.Error<
  ReturnType<DecideRegistration>
>;

export type RegistrationReviewerFailure =
  | RegistrationReviewerDecisionFailure
  | Layer.Error<ReturnType<typeof registrationReviewersLayer>>;
