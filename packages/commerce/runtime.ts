import "server-only";
import type { ActionClient } from "@repo/actions";
import type { Locale } from "@repo/i18n/types";
import { Effect, Layer } from "effect";

import type { CommerceRequestFailure } from "./runtime/commerce-request";
import type {
  CommerceApplication,
  CommerceRequestProvisionError,
  CommerceRequestServices,
  CommerceStableServices,
} from "./runtime/make-commerce-app";
import type { StoreKey } from "./store";

export type {
  AddressBookRequestServices,
  CommerceApplication,
  CommerceRequestProvisionError,
  CommerceRequestLayerServices,
  CommerceRequestServices,
  CommerceStableServices,
} from "./runtime/make-commerce-app";

export interface CommerceRequestOptions {
  readonly selectedStoreKey?: StoreKey;
}

export type NextCommerceRequestError =
  | CommerceRequestFailure
  | CommerceRequestProvisionError;

export type CommerceActionClient<
  ActionServices,
  RuntimeServices,
  Context extends object,
> = ActionClient<
  RuntimeServices | ActionServices,
  NextCommerceRequestError,
  RuntimeServices,
  Context,
  "Provided"
>;

export interface NextCommerceRuntime {
  readonly provide: (
    locale: Locale,
    options?: CommerceRequestOptions
  ) => <A, E>(
    program: Effect.Effect<A, E, CommerceRequestServices>
  ) => Effect.Effect<A, E | NextCommerceRequestError, CommerceStableServices>;
  readonly runPromise: <A, E>(
    program: Effect.Effect<A, E, CommerceStableServices>
  ) => Promise<A>;
}

// oxlint-disable-next-line unicorn/custom-error-definition -- Preserve the established public binding name.
export class CommerceRuntimeNotConfigured extends Error {
  override readonly name = "CommerceRuntimeNotConfigured";

  constructor() {
    super("The Commerce application runtime is not configured");
  }
}

export const CommerceApp: CommerceApplication<
  never,
  CommerceRequestProvisionError
> = {
  layer: Layer.effectContext(Effect.die(new CommerceRuntimeNotConfigured())),
  provide: () => () => Effect.die(new CommerceRuntimeNotConfigured()),
  provideAddressBook: () => () =>
    Effect.die(new CommerceRuntimeNotConfigured()),
  requestLayer: () =>
    Layer.effectContext(Effect.die(new CommerceRuntimeNotConfigured())),
};

export const NextCommerce: NextCommerceRuntime = {
  provide: () => () => Effect.die(new CommerceRuntimeNotConfigured()),
  runPromise: async () =>
    await Promise.reject(new CommerceRuntimeNotConfigured()),
};
