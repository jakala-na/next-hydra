"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { useState } from "react";
import type { CartSummaryProps } from "./site-header";

// biome-ignore lint/correctness/noUnusedFunctionParameters: TODO: Implement cart flyout
export function CartButtonClient({ count, href, subtotal }: CartSummaryProps) {
  // biome-ignore lint/correctness/noUnusedVariables: TODO: Implement cart flyout
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setOpen((v) => !v)}
      >
        <ShoppingCart className="h-5 w-5" />
        {count > 0 && (
          <span className="-right-1 -top-1 absolute flex h-5 w-5 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground text-xs">
            {count}
          </span>
        )}
      </Button>
      {/* {<CartFlyout />} */}
    </div>
  );
}
