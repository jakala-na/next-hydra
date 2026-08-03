"use client";

import ProductVariant, {
  type VariantItem,
  type VariantSelectionPayload,
} from "@repo/design-system/components/commerce/blocks/product-variants";
import { useCart } from "@repo/design-system/components/commerce/providers/cart-context";
import { QuoteRequestDialog } from "@repo/design-system/components/quote-request-dialog";
import { useTranslations } from "@repo/i18n";
import { useState } from "react";

export interface ProductDetailProps {
  readonly productId: string;
  readonly title: string;
  readonly description?: string;
  readonly categoryName?: string;
  readonly availableForSale: boolean;
  readonly defaultImage?: string;
  readonly defaultVariantId: string;
  readonly variantLabel: string;
  readonly variants: VariantItem[];
}

export function ProductDetail({
  availableForSale,
  categoryName,
  defaultImage,
  defaultVariantId,
  description,
  productId,
  title,
  variantLabel,
  variants,
}: ProductDetailProps) {
  const t = useTranslations("web.product");
  const navigationT = useTranslations("web.navigation");
  const { addItem, openCart } = useCart();
  const defaultVariant =
    variants.find((variant) => variant.value === defaultVariantId) ??
    variants[0];

  if (defaultVariant === undefined) {
    throw new Error(t("productHasNoVariants"));
  }

  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    defaultVariant.value
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);

  const handleVariantChange = (value: string) => {
    setSelectedVariantId(value);
    const newVariant = variants.find((variant) => variant.value === value);
    const maxQuantity = newVariant?.availableQuantity;
    if (
      newVariant?.isInStock &&
      maxQuantity !== null &&
      maxQuantity !== undefined &&
      quantity > maxQuantity
    ) {
      setQuantity(Math.max(1, maxQuantity));
    }
  };

  const handleAddToCart = async (payload: VariantSelectionPayload) => {
    await addItem({
      productId,
      variantId: payload.variantId,
      quantity: payload.quantity,
    });
    openCart();
  };

  const selectedVariant =
    variants.find((variant) => variant.value === selectedVariantId) ??
    defaultVariant;

  return (
    <div className="container py-12">
      <div className="mb-8 flex items-center gap-2 text-muted-foreground text-sm">
        <span>{navigationT("home")}</span>
        <span>/</span>
        <span>{navigationT("products")}</span>
        <span>/</span>
        <span>{categoryName ?? navigationT("categoryFallback")}</span>
        <span>/</span>
        <span className="text-foreground">{title}</span>
      </div>

      <ProductVariant
        title={title}
        description={description}
        badge={availableForSale ? "" : t("outOfStock")}
        defaultImage={defaultImage}
        initialVariant={defaultVariantId}
        variants={variants}
        variantLabel={variantLabel}
        selectedVariant={selectedVariantId}
        onVariantChange={handleVariantChange}
        quantity={quantity}
        onQuantityChange={setQuantity}
        onAddToCart={handleAddToCart}
        onQuoteRequest={() => setQuoteDialogOpen(true)}
      />
      <QuoteRequestDialog
        open={quoteDialogOpen}
        onOpenChange={setQuoteDialogOpen}
        product={title}
        variant={selectedVariant.label}
        price={selectedVariant.price}
        currencyCode={selectedVariant.currencyCode}
      />
    </div>
  );
}
