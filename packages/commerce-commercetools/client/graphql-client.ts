import type { Client } from "@urql/core";
import { Context, Layer } from "effect";

type GraphqlQuery = Client["query"];
type GraphqlMutation = Client["mutation"];

export class CommercetoolsGraphQLClient extends Context.Service<
  CommercetoolsGraphQLClient,
  {
    readonly query: GraphqlQuery;
    readonly mutation: GraphqlMutation;
  }
>()("@repo/commerce-commercetools/GraphQLClient") {
  static readonly testLayer = (client: {
    readonly query: GraphqlQuery;
    readonly mutation: GraphqlMutation;
  }) =>
    Layer.succeed(
      CommercetoolsGraphQLClient,
      CommercetoolsGraphQLClient.of(client)
    );
}
