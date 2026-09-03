import { CheckoutOrderConfirmationPage } from "@repo/commerce/checkout";
import { OrderId } from "@repo/commerce/domain/order";
import {
  ANONYMOUS_ORDER_ACCESS_COOKIE_NAME,
  decodeAnonymousOrderAccessCookie,
} from "@repo/commerce/lib/order/utils/anonymous-order-access-cookie";
import {
  ORDER_PLACEMENT_RECOVERY_COOKIE_NAME,
  decodeOrderPlacementRecoveryCookie,
} from "@repo/commerce/lib/order/utils/order-placement-recovery-cookie";
import { hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { Option, Schema } from "effect";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

type CheckoutOrderRouteProps = {
  readonly params: Promise<{
    readonly locale: string;
    readonly orderId: string;
  }>;
};

export default async function CheckoutOrder({
  params,
}: CheckoutOrderRouteProps) {
  const route = await params;
  if (!hasLocale(routing.locales, route.locale)) {
    notFound();
  }
  const orderId = Schema.decodeOption(OrderId)(route.orderId);
  if (Option.isNone(orderId)) {
    notFound();
  }

  // oxlint-disable-next-line typescript/no-deprecated -- The app-wide next/root-params migration is outside this Checkout composition slice.
  setRequestLocale(route.locale);
  const cookieStore = await cookies();
  const savedAnonymousAccess = decodeAnonymousOrderAccessCookie(
    cookieStore.get(ANONYMOUS_ORDER_ACCESS_COOKIE_NAME)?.value
  );
  const recovery = decodeOrderPlacementRecoveryCookie(
    cookieStore.get(ORDER_PLACEMENT_RECOVERY_COOKIE_NAME)?.value
  );
  const anonymousAccess =
    savedAnonymousAccess ??
    (recovery === undefined
      ? undefined
      : { cartId: recovery.cartId, orderId: orderId.value });
  return (
    <CheckoutOrderConfirmationPage
      anonymousAccess={anonymousAccess}
      locale={route.locale}
      orderId={orderId.value}
    />
  );
}
