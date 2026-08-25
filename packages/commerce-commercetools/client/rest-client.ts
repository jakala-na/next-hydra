import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import { Context, Layer } from "effect";

export class CommercetoolsRestClient extends Context.Service<
  CommercetoolsRestClient,
  { readonly apiRoot: ByProjectKeyRequestBuilder }
>()("@repo/commerce-commercetools/RestClient") {
  static readonly testLayer = (apiRoot: ByProjectKeyRequestBuilder) =>
    Layer.succeed(
      CommercetoolsRestClient,
      CommercetoolsRestClient.of({ apiRoot })
    );
}
