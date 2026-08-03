import { Schema } from "effect";

export const CurrencyCode = Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/));
export type CurrencyCode = typeof CurrencyCode.Type;

export const Money = Schema.Struct({
  centAmount: Schema.Int,
  currencyCode: CurrencyCode,
});
export type Money = typeof Money.Type;
