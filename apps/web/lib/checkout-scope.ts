import "server-only";

import { withAuth } from "@repo/auth-workos/server";
import { CartId, StoreKey } from "@repo/commerce/domain/cart";
import { CheckoutLocale } from "@repo/commerce/domain/checkout";
import {
  AnonymousCommercePrincipal,
  AuthUserId,
  CommerceRequestContext,
  CommerceRequestContextNotFound,
  CustomerCommercePrincipal,
} from "@repo/commerce/domain/commerce-request-context";
import { getAnonymousCartId } from "@repo/commerce/lib/cart/utils/anonymous-cart-cookies";
import { toCheckoutScope } from "@repo/commerce/lib/checkout/request-context";
import { storeService } from "@repo/commerce/lib/store/store.service";
import { getStoreKeyByLocale } from "@repo/commerce/lib/store/utils/mappings";
import {
  type CommerceAccountError,
  CommerceAccounts,
} from "@repo/commerce/services/commerce-accounts";
import type { Locale } from "@repo/i18n/types";
import { Effect, Schema } from "effect";

export class WebCheckoutContextResolutionFailure extends Schema.TaggedErrorClass<WebCheckoutContextResolutionFailure>()(
  "WebCheckoutContextResolutionFailure",
  {
    message: Schema.String,
    cause: Schema.Defect,
  }
) {}

const contextResolutionFailure = (message: string, cause: unknown) =>
  new WebCheckoutContextResolutionFailure({ message, cause });

const resolveCustomerContext = Effect.fn(
  "WebCheckoutContext.resolveCustomerContext"
)(function* (locale: Locale, authUserId: string) {
  const verifiedAuthUserId = yield* Schema.decodeUnknownEffect(AuthUserId)(
    authUserId
  ).pipe(
    Effect.mapError((cause) =>
      contextResolutionFailure("Authenticated user id is invalid", cause)
    )
  );
  const accounts = yield* CommerceAccounts;
  const customerId = yield* accounts
    .getCustomerIdByAuthUserId(verifiedAuthUserId)
    .pipe(
      Effect.catchTag("CommerceCustomerIdNotFound", () =>
        Effect.fail(
          new CommerceRequestContextNotFound({
            message: "Commerce customer mapping does not exist",
            reason: "noCustomerMapping",
          })
        )
      )
    );
  const storeKey = StoreKey.make(getStoreKeyByLocale(locale));
  const businessUnitContext = yield* accounts
    .getBusinessUnitContextForCustomerInStore(customerId, storeKey)
    .pipe(
      Effect.catchTags({
        CommerceBusinessUnitContextNotFound: () =>
          Effect.fail(
            new CommerceRequestContextNotFound({
              message:
                "Commerce Business Unit context does not exist for customer in Store",
              reason: "noBuyingContext",
            })
          ),
        CommerceBusinessUnitContextAmbiguous: () =>
          Effect.fail(
            new CommerceRequestContextNotFound({
              message:
                "Commerce Business Unit context is ambiguous for customer in Store",
              reason: "noBuyingContext",
            })
          ),
      })
    );

  return new CommerceRequestContext({
    locale: CheckoutLocale.make(locale),
    principal: new CustomerCommercePrincipal({
      authUserId: verifiedAuthUserId,
      customerId,
      businessUnitId: businessUnitContext.businessUnitId,
      businessUnitKey: businessUnitContext.businessUnitKey,
    }),
  });
});

const resolveAnonymousContext = Effect.fn(
  "WebCheckoutContext.resolveAnonymousContext"
)(function* (locale: Locale) {
  const storeContext = yield* Effect.tryPromise({
    try: () => storeService.getStoreContextByLocale(locale),
    catch: (cause) =>
      contextResolutionFailure("Failed to resolve Store context", cause),
  });
  const anonymousCartId = yield* Effect.tryPromise({
    try: () => getAnonymousCartId(storeContext),
    catch: (cause) =>
      contextResolutionFailure("Failed to read anonymous Cart cookie", cause),
  });

  if (anonymousCartId === null || anonymousCartId.length === 0) {
    return yield* new CommerceRequestContextNotFound({
      message: "Commerce Principal does not exist",
      reason: "noPrincipal",
    });
  }

  return new CommerceRequestContext({
    locale: CheckoutLocale.make(locale),
    principal: new AnonymousCommercePrincipal({
      anonymousCartId: CartId.make(anonymousCartId),
    }),
  });
});

export const resolveCheckoutContext = Effect.fn(
  "WebCheckoutContext.resolveCheckoutContext"
)(function* (
  locale: Locale
): Effect.fn.Return<
  CommerceRequestContext,
  | CommerceAccountError
  | CommerceRequestContextNotFound
  | WebCheckoutContextResolutionFailure,
  CommerceAccounts
> {
  const session = yield* Effect.tryPromise({
    try: () => withAuth(),
    catch: (cause) =>
      contextResolutionFailure(
        "Failed to resolve authenticated session",
        cause
      ),
  });

  if (session.user) {
    return yield* resolveCustomerContext(locale, session.user.id);
  }

  return yield* resolveAnonymousContext(locale);
});

export const resolveCheckoutScope = Effect.fn(
  "WebCheckoutContext.resolveCheckoutScope"
)(function* (locale: Locale) {
  return toCheckoutScope(yield* resolveCheckoutContext(locale));
});
