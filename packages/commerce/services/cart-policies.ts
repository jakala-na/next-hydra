import { Context, Effect, Layer } from "effect";
import type { CartPolicyFailure } from "../domain/cart-errors";
import type {
  CartPolicyViolation,
  CartSnapshot,
} from "../domain/cart-snapshot";

export interface CartPolicy {
  readonly name: string;
  readonly evaluate: (
    cart: CartSnapshot
  ) => Effect.Effect<readonly CartPolicyViolation[], CartPolicyFailure>;
}

export class CartPolicies extends Context.Service<
  CartPolicies,
  {
    readonly evaluate: (
      cart: CartSnapshot
    ) => Effect.Effect<readonly CartPolicyViolation[], CartPolicyFailure>;
  }
>()("@repo/commerce/CartPolicies") {
  static readonly layerFrom = (policies: readonly CartPolicy[]) =>
    Layer.succeed(
      CartPolicies,
      CartPolicies.of({
        evaluate: Effect.fn("CartPolicies.evaluate")((cart) =>
          Effect.forEach(policies, (policy) => policy.evaluate(cart), {
            concurrency: "unbounded",
          }).pipe(Effect.map((violations) => violations.flat()))
        ),
      })
    );

  static readonly layerEmpty = CartPolicies.layerFrom([]);
}
