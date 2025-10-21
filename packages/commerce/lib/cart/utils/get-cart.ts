import type { StoreContext } from "../../store/types";
import {
  type ActionResult,
  domainError,
  Err,
  isOk,
  Ok,
} from "../../utils/errors";
import { cartService } from "../cart.service";
import type { CartWithIssues } from "../types";
import { getAnonymousCartId } from "./anonymous-cart-cookies";
import { validateCartPolicies } from "./validate-cart";

export const getCartForContext = async (
  ctx: StoreContext
): Promise<ActionResult<CartWithIssues>> => {
  // Anonymous cart.
  const existentCartId = await getAnonymousCartId(ctx.locale);
  if (!existentCartId) {
    return Err(domainError("NOT_FOUND", "Cart id not found"));
  }
  // TODO: Add authenticated cart support.
  const result = await cartService.getCartById(existentCartId, ctx.locale);
  if (!isOk(result)) {
    return Err(result.error);
  }

  // Validate cart policies
  const issues = await validateCartPolicies({
    cart: result.data,
    locale: ctx.locale,
  });

  return Ok({
    cart: result.data,
    issues,
    currency: ctx.currency,
  });
};
