"use client";

import { CartPageError } from "@repo/design-system/components/commerce/blocks/cart-page-error";
import { captureException } from "@sentry/nextjs";
import { useEffect } from "react";

export default function CartError({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return <CartPageError onRetry={reset} />;
}
