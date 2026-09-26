import type { ReactNode } from "react";

export function CheckoutLayout({
  cart,
  cartId,
  children,
  loading,
  title,
}: {
  readonly cart: ReactNode;
  readonly cartId?: string;
  readonly children: ReactNode;
  readonly loading?: boolean;
  readonly title: ReactNode;
}) {
  return (
    <main
      aria-busy={loading}
      className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
      data-checkout-cart-id={cartId}
    >
      <h1 aria-hidden={loading} className="mb-8 font-semibold text-3xl">
        {title}
      </h1>
      <div
        aria-hidden={loading}
        className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]"
      >
        <div className="min-w-0">{children}</div>
        <div className="min-w-0 lg:sticky lg:top-32">{cart}</div>
      </div>
    </main>
  );
}
