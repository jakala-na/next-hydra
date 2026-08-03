import type { Locale } from "@repo/i18n/types";
import { initGraphQLTada } from "gql.tada";
import type { introspection } from "./gql/graphql-env.d.ts";

export const graphql = initGraphQLTada<{
  introspection: introspection;
  scalars: {
    Long: number;
    Currency: string;
    DateTime: string;
    Locale: Locale;
    Country: string;
    Json: JSON;
  };
}>();

export type { FragmentOf, ResultOf, VariablesOf } from "gql.tada";
export { readFragment } from "gql.tada";
