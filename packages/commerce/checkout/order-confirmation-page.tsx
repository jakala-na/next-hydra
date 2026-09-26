import "server-only";
import { NextCommerce } from "@repo/commerce/runtime";
import type { Locale } from "@repo/i18n/types";
import { Effect, Option } from "effect";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import type { OrderId, OrderSnapshot } from "../domain/order";
import { findOrderConfirmation } from "../lib/order/order-confirmation";
import { paymentMethodLabel } from "./payment-method-label";

const formatMoney = (order: OrderSnapshot, locale: Locale) =>
  new Intl.NumberFormat(locale, {
    currency: order.totalPrice.currencyCode,
    style: "currency",
  }).format(order.totalPrice.centAmount / 100);

export async function CheckoutOrderConfirmationPage({
  anonymousAccess,
  locale,
  orderId,
}: {
  readonly anonymousAccess?: {
    readonly cartId: OrderSnapshot["cartId"];
    readonly orderId: OrderId;
  };
  readonly locale: Locale;
  readonly orderId: OrderId;
}) {
  await connection();

  const input =
    anonymousAccess === undefined ? { orderId } : { anonymousAccess, orderId };

  const confirmation = await NextCommerce.runPromise(
    findOrderConfirmation(input).pipe(
      NextCommerce.provide(locale),
      Effect.catchTag("CommerceRequestContextNotFound", () =>
        Effect.succeed(Option.none())
      )
    )
  );

  if (Option.isNone(confirmation)) {
    notFound();
  }

  const { order, paymentStatus } = confirmation.value;
  return (
    <main className="container mx-auto max-w-3xl p-6">
      <section
        className="grid gap-3 rounded-md border border-border p-6"
        data-order-confirmation={order.id}
      >
        <h1 className="font-semibold text-2xl">Order confirmed</h1>
        <p>Order {order.number}</p>
        <p data-order-payment-method>
          {paymentMethodLabel(order.paymentMethod)}
        </p>
        <p
          data-commerce-money="order-total"
          data-currency={order.totalPrice.currencyCode}
          data-minor-amount={order.totalPrice.centAmount}
        >
          {formatMoney(order, locale)}
        </p>
        {paymentStatus === "pending" ? (
          <output>Payment finalization is pending.</output>
        ) : null}
      </section>
    </main>
  );
}
