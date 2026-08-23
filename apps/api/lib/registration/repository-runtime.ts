import { versionedKeyValueStoreLayer } from "@repo/commerce-provider/versioned-store";
import { Registrations } from "@repo/registration/services/registrations";
import { Layer } from "effect";

export const REGISTRATION_CONTAINER =
  process.env.REGISTRATION_CONTAINER ?? "b2b-registration-by-id";

const registrationStorageLayer = versionedKeyValueStoreLayer({
  container: REGISTRATION_CONTAINER,
});

export const registrationRepositoryLayer = Registrations.layerStorage.pipe(
  Layer.provide(registrationStorageLayer)
);
