import type { Locale } from "@repo/i18n/types";
import { Context, Effect, Layer } from "effect";
import { StoreKey } from "../../domain/cart";
import {
  CheckoutLocale,
  CheckoutProviderFailure,
  type CheckoutScope,
  type CheckoutStoreContext,
} from "../../domain/checkout";
import { storeService } from "./store.service";

export class StoreContexts extends Context.Service<
  StoreContexts,
  {
    readonly getForScope: (
      scope: CheckoutScope
    ) => Effect.Effect<CheckoutStoreContext, CheckoutProviderFailure>;
  }
>()("@repo/commerce/store/StoreContexts") {
  static readonly layerMemoryFrom = (context: CheckoutStoreContext) =>
    Layer.succeed(
      StoreContexts,
      StoreContexts.of({
        getForScope: () => Effect.succeed(context),
      })
    );

  static readonly layerCommercetools = Layer.succeed(
    StoreContexts,
    StoreContexts.of({
      getForScope: (scope) =>
        Effect.tryPromise({
          try: async () => {
            const context = await storeService.getStoreContextByLocale(
              scope.locale as Locale
            );

            return {
              locale: CheckoutLocale.make(context.locale),
              storeKey: StoreKey.make(context.storeKey),
              currency: context.currency,
            };
          },
          catch: (cause) =>
            new CheckoutProviderFailure({
              message: "Failed to resolve Checkout Store Context",
              operation: "checkout.storeContext.getForScope",
              cause,
            }),
        }),
    })
  );
}
