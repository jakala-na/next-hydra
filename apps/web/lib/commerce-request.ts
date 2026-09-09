/* oxlint-disable promise/prefer-await-to-callbacks -- Effect combinators compose request programs. */
import "server-only";
import type { Locale } from "@repo/i18n/types";
import { Effect } from "effect";

// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- This is a request program using contextual services, not a service constructor.
import { makeCommerceRequest } from "./commerce-request-input";
import type { NextCommerceRequestOptions } from "./commerce-request-input";
import {
  CurrentAuth,
  terminateAuthSessionReadFailure,
} from "./current-auth-api";
import { NextRequestApi } from "./next-request-api";

export { makeCommerceRequest } from "./commerce-request-input";
export type { NextCommerceRequestOptions } from "./commerce-request-input";

export const makeNextCommerceRequest = (
  locale: Locale,
  options?: NextCommerceRequestOptions
) =>
  Effect.gen(function* makeNextCommerceRequestEffect() {
    const request = yield* NextRequestApi;
    const auth = yield* CurrentAuth;
    yield* request.connect();
    const [cookieStore, currentAuth] = yield* Effect.all([
      request.getCookies(),
      auth.snapshot,
    ]);

    return yield* makeCommerceRequest(
      locale,
      cookieStore,
      currentAuth.userId,
      options
    );
  }).pipe(
    Effect.catchTags({
      AuthSessionReadFailure: terminateAuthSessionReadFailure,
      CommerceRequestFailure: (error) =>
        Effect.logError(
          "The authenticated user ID violated the Commerce request contract",
          error.cause
        ).pipe(
          Effect.annotateLogs({
            "commerce.error.tag": error._tag,
            "commerce.operation": error.operation,
          }),
          Effect.andThen(Effect.die(error))
        ),
    })
  );

export const nextCommerceRequest = makeNextCommerceRequest;
