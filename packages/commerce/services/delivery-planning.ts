import { Context, Effect, Layer, Schema } from "effect";

import type { CartSnapshot } from "../domain/cart-snapshot";
import {
  DeliveryPlanQuote,
  DeliveryPlanQuoteReference,
} from "../domain/delivery-plan";
import type { DeliveryPlanQuote as DeliveryPlanQuoteValue } from "../domain/delivery-plan";
import { ProviderFailureReason } from "../domain/provider-failure";
import type { CommerceLocale } from "../store";

export class DeliveryPlanningProviderFailure extends Schema.TaggedError<DeliveryPlanningProviderFailure>()(
  "DeliveryPlanningProviderFailure",
  {
    cause: Schema.optional(Schema.Defect()),
    operation: Schema.Literal("quote"),
    reason: ProviderFailureReason,
  }
) {}

export class InvalidDeliveryPlanQuote extends Schema.TaggedError<InvalidDeliveryPlanQuote>()(
  "InvalidDeliveryPlanQuote",
  {
    message: Schema.String,
  }
) {}

export type DeliveryPlanningFailure = DeliveryPlanningProviderFailure;

export interface QuoteDeliveryPlans {
  readonly cart: CartSnapshot;
  readonly locale: CommerceLocale;
}

type Quote = (
  input: QuoteDeliveryPlans
) => Effect.Effect<DeliveryPlanQuoteValue, DeliveryPlanningFailure>;

const invalidQuote = (message: string) =>
  Effect.fail(new InvalidDeliveryPlanQuote({ message }));

export const validateDeliveryPlanQuote = Effect.fn(
  "DeliveryPlanning.validateQuote"
)(function* (
  cart: CartSnapshot,
  quote: DeliveryPlanQuoteValue
): Effect.fn.Return<DeliveryPlanQuoteValue, InvalidDeliveryPlanQuote> {
  const planReferences = new Set<string>();

  for (const plan of quote.plans) {
    if (planReferences.has(plan.reference)) {
      return yield* invalidQuote(
        `Delivery Plan ${plan.reference} appears more than once`
      );
    }
    planReferences.add(plan.reference);

    const groupReferences = new Set<string>();
    const allocatedByLineItem = new Map<string, number>();

    for (const group of plan.groups) {
      if (groupReferences.has(group.reference)) {
        return yield* invalidQuote(
          `Delivery Group ${group.reference} appears more than once in Delivery Plan ${plan.reference}`
        );
      }
      groupReferences.add(group.reference);

      const optionReferences = new Set<string>();
      for (const option of group.shippingOptions) {
        if (option.price.currencyCode !== cart.totalPrice.currencyCode) {
          return yield* invalidQuote(
            `Shipping Option ${option.reference} does not use the Cart currency`
          );
        }
        if (optionReferences.has(option.reference)) {
          return yield* invalidQuote(
            `Shipping Option ${option.reference} appears more than once in Delivery Group ${group.reference}`
          );
        }
        optionReferences.add(option.reference);
      }

      const targetLineItems = new Set<string>();
      for (const target of group.targets) {
        if (targetLineItems.has(target.lineItemId)) {
          return yield* invalidQuote(
            `Cart Line Item ${target.lineItemId} appears more than once in Delivery Group ${group.reference}`
          );
        }
        targetLineItems.add(target.lineItemId);
        const lineItem = cart.lineItems.find(
          (candidate) => candidate.id === target.lineItemId
        );
        if (lineItem === undefined) {
          return yield* invalidQuote(
            `Delivery Target references Cart Line Item ${target.lineItemId}, which is not in the Cart`
          );
        }
        allocatedByLineItem.set(
          target.lineItemId,
          (allocatedByLineItem.get(target.lineItemId) ?? 0) + target.quantity
        );
      }
    }

    for (const lineItem of cart.lineItems) {
      const allocated = allocatedByLineItem.get(lineItem.id) ?? 0;
      if (allocated !== lineItem.quantity) {
        return yield* invalidQuote(
          `Delivery Targets allocate ${allocated} of ${lineItem.quantity} units from Cart Line Item ${lineItem.id}`
        );
      }
    }
  }

  return quote;
});

const validatedQuote =
  (quote: Quote): Quote =>
  (input) =>
    quote(input).pipe(
      Effect.flatMap((result) =>
        Schema.decodeEffect(DeliveryPlanQuote)(result).pipe(
          Effect.orDie,
          Effect.flatMap((decoded) =>
            validateDeliveryPlanQuote(input.cart, decoded)
          ),
          Effect.catchTag("InvalidDeliveryPlanQuote", Effect.die)
        )
      )
    );

export class DeliveryPlanning extends Context.Service<
  DeliveryPlanning,
  {
    readonly quote: Quote;
  }
>()("@repo/commerce/DeliveryPlanning") {
  static readonly quote = Effect.fn("DeliveryPlanning.quote")(
    (input: QuoteDeliveryPlans) =>
      Effect.gen(function* () {
        const planning = yield* DeliveryPlanning;
        return yield* planning.quote(input);
      })
  );

  static readonly layerMemory = (quote: Quote) =>
    Layer.succeed(
      DeliveryPlanning,
      DeliveryPlanning.of({ quote: validatedQuote(quote) })
    );

  static readonly emptyLayer = Layer.succeed(
    DeliveryPlanning,
    DeliveryPlanning.of({
      quote: () =>
        Effect.succeed({
          plans: [],
          reference: DeliveryPlanQuoteReference.make("empty-delivery-quote"),
        }),
    })
  );
}

export const makeDeliveryPlanning = (quote: Quote) =>
  DeliveryPlanning.of({ quote: validatedQuote(quote) });
