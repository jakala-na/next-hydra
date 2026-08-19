import { Effect, Schema } from "effect";

import type { CommerceContextRequest } from "../domain/commerce-request-context";
import { AuthUserId } from "../domain/commerce-request-context";
import type { CurrentCartCookie } from "../lib/current-cart/cookie";

export interface CommerceRequestInput {
  readonly context: CommerceContextRequest;
  readonly currentCartCookie: CurrentCartCookie;
}

export class CommerceRequestFailure extends Schema.TaggedErrorClass<CommerceRequestFailure>()(
  "CommerceRequestFailure",
  {
    cause: Schema.Defect,
    operation: Schema.Literal("decodeAuthUserId"),
  }
) {}

export const decodeCommerceAuthUserId = (
  rawAuthUserId: string | undefined
): Effect.Effect<AuthUserId | undefined, CommerceRequestFailure> =>
  rawAuthUserId === undefined
    ? Effect.succeed(undefined)
    : Schema.decodeUnknownEffect(AuthUserId)(rawAuthUserId).pipe(
        Effect.mapError(
          (cause) =>
            new CommerceRequestFailure({
              cause,
              operation: "decodeAuthUserId",
            })
        )
      );
