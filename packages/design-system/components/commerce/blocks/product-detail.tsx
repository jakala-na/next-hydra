"use client";

import type { ProductDetailsDTO } from "@repo/commerce/lib/types";
import {
  default as ProductVariant,
  type VariantItem,
  type VariantSelectionPayload,
} from "@repo/design-system/components/commerce/blocks/product-variants";
import { QuoteRequestDialog } from "@repo/design-system/components/quote-request-dialog";
import { useFormatter, useTranslations } from "@repo/i18n";
import { useState } from "react";

interface ProductDetailProps {
  productData: ProductDetailsDTO;
}

export function ProductDetail({ productData }: ProductDetailProps) {
  const t = useTranslations("web.product");
  const cartT = useTranslations("web.cart");
  const navigationT = useTranslations("web.navigation");
  const format = useFormatter();
  // Map ProductDetailsDTO.variants -> ProductVariant props (VariantItem[])
  const CENTS_IN_UNIT = 100;
  const mappedVariants: VariantItem[] = productData.variants.map(
    (v): VariantItem => {
      const priceCents = v.price?.value.centAmount ?? 0;
      const discountedPriceCents = v.price?.discounted?.value?.centAmount ?? 0;
      const price = priceCents / CENTS_IN_UNIT;
      const discountedPrice = discountedPriceCents / CENTS_IN_UNIT || undefined;
      const imageUrl = v.images?.[0]?.url || "";
      const currencyCode = v.price?.value.currencyCode;
      // Prefer a human label from attributes (e.g., model year), fallback to variant id
      const modelAttr = (v.attributes as Record<string, unknown> | undefined)
        ?.model;
      const label =
        modelAttr !== undefined && modelAttr !== null
          ? String(modelAttr)
          : String(v.id);
      return {
        id: String(v.id),
        value: String(v.id),
        label,
        price,
        salePrice: discountedPrice,
        imageUrl,
        isInStock: v.availableForSale,
        availableQuantity: v.availableQuantity,
        currencyCode,
      };
    }
  );

  if (!mappedVariants[0]) {
    throw new Error(t("productHasNoVariants"));
  }

  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    mappedVariants[0].value
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);

  const handleVariantChange = (value: string) => {
    setSelectedVariantId(value);
    const newVariant = mappedVariants.find((v) => v.value === value);
    const maxQty = newVariant?.availableQuantity;
    if (newVariant?.isInStock && maxQty != null && quantity > maxQty) {
      setQuantity(Math.max(1, maxQty));
    }
  };

  const handleAddToCart = (payload: VariantSelectionPayload) => {
    const variant = mappedVariants.find((v) => v.value === payload.variantId);
    const stockStatus = variant?.isInStock
      ? cartT("stockIn")
      : cartT("stockOut");
    const formattedPrice = format.number(payload.price, {
      style: "currency",
      currency: variant?.currencyCode || "USD",
    });
    // biome-ignore lint/suspicious/noAlert: example feedback
    window.alert(
      cartT("addedToCartAlert", {
        quantity: payload.quantity,
        variantLabel: payload.variantLabel,
        price: formattedPrice,
        stockStatus,
      })
    );
  };

  const handleQuoteRequest = () => {
    setQuoteDialogOpen(true);
  };

  return (
    <div className="container py-12">
      {/* Breadcrumb */}
      <div className="mb-8 flex items-center gap-2 text-muted-foreground text-sm">
        <span>{navigationT("home")}</span>
        <span>/</span>
        <span>{navigationT("products")}</span>
        <span>/</span>
        <span>
          {productData.categories?.[0]?.name ?? navigationT("categoryFallback")}
        </span>
        <span>/</span>
        <span className="text-foreground">{productData.title}</span>
      </div>

      <ProductVariant
        title={productData.title}
        description={productData.description}
        badge={productData.availableForSale ? "" : t("outOfStock")}
        defaultImage={productData.masterVariant.images?.[0]?.url}
        variants={mappedVariants}
        variantLabel={productData.options?.[0]?.label ?? ""}
        selectedVariant={selectedVariantId}
        onVariantChange={handleVariantChange}
        quantity={quantity}
        onQuantityChange={setQuantity}
        onAddToCart={handleAddToCart}
        onQuoteRequest={handleQuoteRequest}
      />
      <QuoteRequestDialog
        open={quoteDialogOpen}
        onOpenChange={setQuoteDialogOpen}
        product={productData.title}
        variant={
          mappedVariants.find((v) => v.value === selectedVariantId)?.label ?? ""
        }
        price={
          mappedVariants.find((v) => v.value === selectedVariantId)?.price ?? 0
        }
      />
    </div>
  );
}
