import { CartButtonClient } from "@repo/design-system/components/layout/cart-button";
import { ShoppingCart } from "lucide-react";
import { Suspense } from "react";

import { cartLinks } from "@/lib/cart-links";

export function HeaderCart() {
  return (
    <Suspense
      fallback={<ShoppingCart className="size-5 text-muted-foreground" />}
    >
      <CartButtonClient {...cartLinks} />
    </Suspense>
  );
}
