import { Context, Schema } from "effect";
import type { Effect } from "effect";

export interface ShippingOptionExpectation {
  readonly currency: string;
  readonly name: string;
  readonly price: string;
}

export interface ShippingOptionsExpectation {
  readonly country: string;
  readonly options: readonly ShippingOptionExpectation[];
}

export class ShippingOptionsTestControlFailure extends Schema.TaggedError<ShippingOptionsTestControlFailure>()(
  "ShippingOptionsTestControlFailure",
  {
    cause: Schema.optional(Schema.Defect()),
    message: Schema.String,
    operation: Schema.Literal("expectShippingOptions"),
    provider: Schema.String,
  }
) {}

export class ShippingOptionsTestControl extends Context.Service<
  ShippingOptionsTestControl,
  {
    readonly expectShippingOptions: (
      input: ShippingOptionsExpectation
    ) => Effect.Effect<void, ShippingOptionsTestControlFailure>;
  }
>()("@repo/commerce/e2e/ShippingOptionsTestControl") {}
