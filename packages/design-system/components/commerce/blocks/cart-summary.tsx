"use client";

import type { CartReadModelSummary } from "@repo/commerce/cart/public-state";
import type { Money } from "@repo/commerce/domain/money";
import { useFormatter, useTranslations } from "@repo/i18n";

const MINOR_UNITS_PER_UNIT = 100;

interface CartSummaryProps {
  readonly summary: CartReadModelSummary;
  readonly surface: "cart" | "cart-page";
}

export function CartSummary({ summary, surface }: CartSummaryProps) {
  const format = useFormatter();
  const t = useTranslations("web.cart");
  const formatMoney = (value: Money) =>
    format.number(
      value.centAmount / MINOR_UNITS_PER_UNIT,
      "wholeMoneyWithCurrency",
      { currency: value.currencyCode }
    );
  const moneyAttributes = (
    name: "shipping" | "subtotal" | "total",
    value: Money
  ) => ({
    "data-commerce-money": `${surface}-${name}`,
    "data-currency": value.currencyCode,
    "data-minor-amount": value.centAmount,
  });

  return (
    <dl className="space-y-4">
      <div className="flex items-center justify-between gap-4 text-sm">
        <dt className="text-muted-foreground">{t("summary.subtotal.label")}</dt>
        <dd
          className="font-medium"
          {...moneyAttributes("subtotal", summary.subtotal)}
        >
          {formatMoney(summary.subtotal)}
        </dd>
      </div>
      <div className="flex items-start justify-between gap-4 text-sm">
        <dt className="text-muted-foreground">{t("summary.shipping.label")}</dt>
        {summary.shipping === undefined ? (
          <dd className="text-right font-medium">
            {t("summary.shipping.description")}
          </dd>
        ) : (
          <dd
            className="text-right font-medium"
            {...moneyAttributes("shipping", summary.shipping)}
          >
            {formatMoney(summary.shipping)}
          </dd>
        )}
      </div>
      <div className="flex items-center justify-between gap-4 border-t pt-4 text-lg">
        <dt className="font-semibold">{t("summary.total.label")}</dt>
        <dd
          className="font-semibold"
          {...moneyAttributes("total", summary.total)}
        >
          {formatMoney(summary.total)}
        </dd>
      </div>
    </dl>
  );
}
