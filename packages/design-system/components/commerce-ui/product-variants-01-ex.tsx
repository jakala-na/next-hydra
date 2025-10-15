"use client";

// Example usage of ProductVariant_01 component

import ProductVariant_01, {
  type VariantItem,
  type VariantSelectionPayload,
} from "@repo/design-system/components/commerce-ui/product-variants-01";
import { useState } from "react";

type NonEmptyArray<T> = [T, ...T[]];

const EXAMPLE_VARIANTS: NonEmptyArray<VariantItem> = [
  {
    availableQuantity: 5,
    id: "variant-sport",
    imageUrl:
      "https://raw.githubusercontent.com/stackzero-labs/ui/refs/heads/main/public/placeholders/headphone-1.jpg",
    isInStock: true,
    label: "Sport",
    price: 109.99,
    value: "variant-sport",
  },
  {
    availableQuantity: 10,
    id: "variant-prosound",
    imageUrl:
      "https://raw.githubusercontent.com/stackzero-labs/ui/refs/heads/main/public/placeholders/headphone-2.jpg",
    isInStock: true,
    label: "ProSound",
    price: 99.99,
    salePrice: 89.99,
    value: "variant-prosound",
  },
  {
    availableQuantity: 0,
    id: "variant-ultraquiet",
    imageUrl:
      "https://raw.githubusercontent.com/stackzero-labs/ui/refs/heads/main/public/placeholders/headphone-3.jpg",
    isInStock: false,
    label: "UltraQuiet™",
    price: 89.99,
    value: "variant-ultraquiet",
  },
  {
    availableQuantity: 2,
    id: "variant-extremesilence",
    imageUrl:
      "https://raw.githubusercontent.com/stackzero-labs/ui/refs/heads/main/public/placeholders/headphone-4.jpg",
    isInStock: true,
    label: "ExtremeSilence™",
    price: 119.99,
    salePrice: 99.99,
    value: "variant-extremesilence",
  },
] as const;

export default function ProductVariantExample() {
  const [selectedVariant, setSelectedVariant] = useState<string>(
    EXAMPLE_VARIANTS[0].value
  );
  const [quantity, setQuantity] = useState<number>(1);

  // Adjust quantity if it exceeds available stock when variant changes
  const handleVariantChange = (value: string) => {
    setSelectedVariant(value);
    const newVariant = EXAMPLE_VARIANTS.find((v) => v.value === value);
    if (
      newVariant &&
      newVariant.isInStock &&
      newVariant.availableQuantity !== undefined &&
      newVariant.availableQuantity !== null &&
      quantity > newVariant.availableQuantity
    ) {
      setQuantity(Math.max(1, newVariant.availableQuantity));
    }
  };

  const handleAddToCart = (payload: VariantSelectionPayload) => {
    const variant = EXAMPLE_VARIANTS.find((v) => v.value === payload.variantId);
    const stockStatus = variant?.isInStock ? "In Stock" : "Out of Stock";
    // biome-ignore lint/suspicious/noAlert: this is an example
    window.alert(
      `Added ${payload.quantity} ${payload.variantLabel} to cart at $${payload.price} each.\nStock Status: ${stockStatus}`
    );
  };

  const handleBuyNow = (payload: VariantSelectionPayload) => {
    const variant = EXAMPLE_VARIANTS.find((v) => v.value === payload.variantId);
    const stockStatus = variant?.isInStock ? "In Stock" : "Out of Stock";
    // biome-ignore lint/suspicious/noAlert: this is an example
    window.alert(
      `Buying ${payload.quantity} ${payload.variantLabel} at $${payload.price} each.\nStock Status: ${stockStatus}`
    );
  };

  return (
    <div className="container mx-auto p-4">
      <ProductVariant_01
        title="Premium Noise-Cancelling Headphones"
        description="Experience exceptional sound quality with our top-of-the-line noise-cancelling headphones, perfect for music lovers and professionals alike."
        badge="Sale"
        variants={EXAMPLE_VARIANTS}
        variantLabel="Color"
        shippingInfo="Free 2-day shipping"
        selectedVariant={selectedVariant}
        onVariantChange={handleVariantChange}
        quantity={quantity}
        onQuantityChange={setQuantity}
        onAddToCart={handleAddToCart}
        onBuyNow={handleBuyNow}
      />
    </div>
  );
}
