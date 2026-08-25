import "server-only";
import type { Effect, Layer } from "effect";

import { decideAdminRegistration } from "./admin-registration-decide";
import type { CurrentAuthSnapshot } from "./current-auth-api";
import type {
  DecideRegistration,
  RegistrationReviewers,
} from "./registration-reviewers-api";
import { registrationReviewersLayerFrom } from "./registration-reviewers-api";

export type {
  DecideRegistration,
  DecideRegistrationInput,
} from "./registration-reviewers-api";
export {
  RegistrationReviewers,
  registrationReviewersLayerFrom,
} from "./registration-reviewers-api";

const defaultDecide: DecideRegistration = (input, accessToken) =>
  decideAdminRegistration(input, accessToken);

export const registrationReviewersLayer = (
  session: CurrentAuthSnapshot
): Layer.Layer<
  RegistrationReviewers,
  Layer.Error<ReturnType<typeof registrationReviewersLayerFrom>>
> => registrationReviewersLayerFrom(session, defaultDecide);

export type RegistrationReviewerDecisionFailure = Effect.Error<
  ReturnType<typeof decideAdminRegistration>
>;

export type RegistrationReviewerFailure =
  | RegistrationReviewerDecisionFailure
  | Layer.Error<ReturnType<typeof registrationReviewersLayer>>;
