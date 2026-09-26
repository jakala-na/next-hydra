import { Layer } from "effect";

import { CommerceContext } from "../services/commerce-context";
import { CurrentCart } from "../services/current-cart";
import type { CommerceRequestInput } from "./commerce-request";

/** Request services for the header, independent of checkout and payments. */
export function makeHeaderCommerceLayer(request: CommerceRequestInput) {
  return CurrentCart.layer(request.currentCartCookie).pipe(
    Layer.provideMerge(CommerceContext.layer(request.context))
  );
}
