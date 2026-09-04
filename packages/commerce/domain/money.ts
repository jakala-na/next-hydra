import { Schema } from "effect";

export const CurrencyCode = Schema.String.check(
  Schema.isPattern(/^[A-Z]{3}$/u)
);
export type CurrencyCode = typeof CurrencyCode.Type;

export const Money = Schema.Struct({
  centAmount: Schema.Int,
  currencyCode: CurrencyCode,
}).pipe(Schema.brand("Money"));
export type Money = typeof Money.Type;

export const money = (centAmount: number, currencyCode: CurrencyCode): Money =>
  Money.make({ centAmount, currencyCode });
