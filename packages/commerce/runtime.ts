import "server-only";

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
  CommerceApplication,
  CommerceRequestProvisionError,
  CommerceRequestServices,
  CommerceStableServices,
} from "./runtime/make-commerce-app";

export interface CommerceRequestOptions {
  readonly selectedStoreKey?: StoreKey;
}

export type NextCommerceRequestError =
  | CommerceRequestFailure
  | CommerceRequestProvisionError;

export interface NextCommerceBuildOptions<
  Args extends readonly unknown[],
  A,
  E,
  B,
  E2,
> {
  readonly locale?: (...args: Args) => Locale | Promise<Locale>;
  readonly transform: (
    effect: Effect.Effect<
      A,
      E | NextCommerceRequestError,
      CommerceStableServices
    >
  ) => Effect.Effect<B, E2, CommerceStableServices>;
}

export interface NextCommerceRuntime {
  readonly build: {
    <Args extends readonly unknown[], A, E>(
      handler: (...args: Args) => Effect.Effect<A, E, CommerceRequestServices>,
      options?: {
        readonly locale?: (...args: Args) => Locale | Promise<Locale>;
      }
    ): (...args: Args) => Promise<A>;
    <Args extends readonly unknown[], A, E, B, E2>(
      handler: (...args: Args) => Effect.Effect<A, E, CommerceRequestServices>,
      options: NextCommerceBuildOptions<Args, A, E, B, E2>
    ): (...args: Args) => Promise<B>;
  };
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
};

export const NextCommerce: NextCommerceRuntime = {
  build: () => () => Promise.reject(new CommerceRuntimeNotConfigured()),
  provide: () => () => Effect.die(new CommerceRuntimeNotConfigured()),
  runPromise: () => Promise.reject(new CommerceRuntimeNotConfigured()),
};
