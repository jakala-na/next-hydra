import {
  DEFAULT_REGISTRATION_CONTAINER,
  versionedKeyValueStoreLayer,
} from "@repo/commerce-provider/versioned-store";
import { RegistrationInvitationIssueAttempts } from "@repo/registration/services/registration-invitation-issue-attempts";
import { Registrations } from "@repo/registration/services/registrations";
import { Layer } from "effect";

export const REGISTRATION_CONTAINER =
  process.env.REGISTRATION_CONTAINER ?? DEFAULT_REGISTRATION_CONTAINER;

const registrationStorageLayer = versionedKeyValueStoreLayer({
  container: REGISTRATION_CONTAINER,
});

export const registrationRepositoryLayer = Layer.merge(
  Registrations.layerStorage,
  RegistrationInvitationIssueAttempts.layerStorage
).pipe(Layer.provide(registrationStorageLayer));
