import type { Client } from "@urql/core";
import { Context, Layer } from "effect";

type GraphqlQuery = Client["query"];

export class CommercetoolsGraphQLClient extends Context.Service<
  CommercetoolsGraphQLClient,
  { readonly query: GraphqlQuery }
>()("@repo/commerce-commercetools/GraphQLClient") {
  static readonly testLayer = (query: GraphqlQuery) =>
    Layer.succeed(
      CommercetoolsGraphQLClient,
      CommercetoolsGraphQLClient.of({ query })
    );
}
