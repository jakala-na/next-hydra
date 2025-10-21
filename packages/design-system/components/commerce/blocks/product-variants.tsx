"use client";

import ImageViewer from "@repo/design-system/components/commerce/image-viewer-basic";
import PriceFormat_Sale from "@repo/design-system/components/commerce/price-format-sale";
import QuantityInputBasic from "@repo/design-system/components/commerce/quantity-input-basic";
import VariantSelectorBasic, {
  type VariantItem as BaseVariantItem,
} from "@repo/design-system/components/commerce/variant-selector-basic";
import { Button } from "@repo/design-system/components/ui/button";
import { useFormatter, useTranslations } from "@repo/i18n";
import { Clock } from "lucide-react";
import { useState } from "react";

interface VariantItem extends BaseVariantItem {
  id: string;
  price: number;
  salePrice?: number | undefined;
  imageUrl?: string;
  isInStock?: boolean;
  availableQuantity?: number | null;
  currencyCode?: string;
}
type VariantSelectionPayload = {
  variantId: string;
  variantLabel: string;
  quantity: number;
  price: number;
  originalPrice?: number;
  salePrice?: number | undefined;
  totalPrice: number;
  isOnSale: boolean;
};
type ProductVariantProps = {
  title?: string;
  description?: string;
  badge?: string | null;
  shippingInfo?: string;
  variants: VariantItem[];
  defaultImage?: string;
  initialVariant?: string;
  variantLabel?: string;
  onAddToCart?: (payload: VariantSelectionPayload) => void;
  onQuoteRequest?: () => void;
  selectedVariant?: string;
  onVariantChange?: (variant: string) => void;
  quantity?: number;
  onQuantityChange?: (quantity: number) => void;
  isLoading?: boolean;
  errorMessage?: string | null;
};

function ProductVariant({
  badge,
  defaultImage,
  description,
  errorMessage = null,
  initialVariant,
  isLoading = false,
  onAddToCart,
  onQuoteRequest,
  onQuantityChange,
  onVariantChange,
  quantity: controlledQuantity,
  selectedVariant: controlledVariant,
  shippingInfo,
  variantLabel,
  title,
  variants,
}: ProductVariantProps) {
  // Ensure variants array is not empty
  if (variants[0] === undefined) {
    throw new Error("At least one variant must be provided");
  }
  const t = useTranslations("web.product");
  const format = useFormatter();
  const defaultInitialVariant = initialVariant || variants[0].value;

  const [internalSelectedVariant, setInternalSelectedVariant] = useState(
    defaultInitialVariant
  );
  const [internalQuantity, setInternalQuantity] = useState(1);

  // Determine if we're in controlled or uncontrolled mode
  const isVariantControlled = controlledVariant !== undefined;
  const isQuantityControlled = controlledQuantity !== undefined;
  const selectedVariantId = isVariantControlled
    ? controlledVariant
    : internalSelectedVariant;
  const quantity = isQuantityControlled ? controlledQuantity : internalQuantity;

  const handleVariantChange = (newVariant: string) => {
    if (isVariantControlled) {
      onVariantChange?.(newVariant);
    } else {
      setInternalSelectedVariant(newVariant);
    }
  };

  const handleQuantityChange = (newQuantity: number) => {
    if (isQuantityControlled) {
      onQuantityChange?.(newQuantity);
    } else {
      setInternalQuantity(newQuantity);
    }
  };

  const selectedVariant =
    variants.find((v) => v.value === selectedVariantId) || variants[0];

  const currentImage = selectedVariant?.imageUrl || defaultImage;
  const currentPrice = selectedVariant.price;
  const currentSalePrice = selectedVariant.salePrice;
  const currencyCode = selectedVariant.currencyCode;
  const isOnSale =
    currentSalePrice !== undefined && currentSalePrice < currentPrice;

  // Get stock status from the selected variant
  const isInStock =
    selectedVariant.isInStock !== undefined ? selectedVariant.isInStock : true; // Default to in stock if not specified

  const availableQuantity = selectedVariant.availableQuantity;

  const effectivePrice = isOnSale ? currentSalePrice : currentPrice;

  const handleAddToCart = () => {
    onAddToCart?.({
      isOnSale,
      originalPrice: isOnSale ? currentPrice : undefined,
      price: currentPrice,
      quantity,
      salePrice: isOnSale ? currentSalePrice : undefined,
      totalPrice: quantity * effectivePrice,
      variantId: selectedVariantId,
      variantLabel: selectedVariant?.label || "",
    });
  };

  const handleQuateRequest = () => {
    onQuoteRequest?.();
  };

  if (errorMessage) {
    return (
      <div className="my-6 rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-destructive">
        <p className="font-medium">{t("errorLoadingProduct")}</p>
        <p className="text-sm">{errorMessage}</p>
      </div>
    );
  }

  // Add visual indicator for out of stock items in variant selector
  const variantsWithStockIndicator = variants.map((variant) => {
    const isVariantInStock =
      variant.isInStock !== undefined ? variant.isInStock : true;
    return {
      ...variant,
      disabled: !isVariantInStock,
      label:
        variant.label + (isVariantInStock ? "" : ` ${t("outOfStockSuffix")}`),
    };
  });

  return (
    <div className="my-6 grid max-w-screen-lg grid-cols-1 gap-12 rounded-lg md:grid-cols-2">
      <div className="relative h-fit w-full overflow-hidden rounded-2xl bg-muted p-5">
        {badge && (
          <span className="absolute top-4 left-4 z-10 rounded-full bg-primary px-3 py-1.5 font-bold text-primary-foreground text-xs">
            {badge}
          </span>
        )}
        <div className="transition-transform duration-500 hover:scale-105">
          {isLoading ? (
            <div className="flex h-[300px] items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-border border-t-primary" />
            </div>
          ) : (
            <ImageViewer
              imageUrl={currentImage || ""}
              classNameThumbnailViewer="rounded-lg object-contain h-[300px] mx-auto"
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {isLoading ? (
          <div className="space-y-4">
            <div className="h-8 w-3/4 animate-pulse rounded-md bg-muted" />
            <div className="h-16 animate-pulse rounded-md bg-muted" />
            <div className="h-8 w-1/3 animate-pulse rounded-md bg-muted" />
          </div>
        ) : (
          <>
            <div>
              <h2 className="font-bold text-3xl text-foreground tracking-tight">
                {title}
              </h2>
              <p className="mt-3 text-muted-foreground">{description}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <PriceFormat_Sale
                currencyCode={currencyCode}
                originalPrice={currentPrice}
                salePrice={isOnSale ? currentSalePrice : undefined}
                showSavePercentage
                className="items-baseline"
                classNameOriginalPrice="text-lg text-muted-foreground line-through"
                classNameSalePrice="text-3xl font-bold text-primary"
                classNameSalePercentage="bg-secondary text-secondary-foreground text-xs px-2 py-0.5 rounded-md"
              />

              {shippingInfo && (
                <p className="mt-1 inline-flex items-center text-muted-foreground text-sm">
                  <Clock className="mr-1 h-4 w-4" />
                  {shippingInfo}
                </p>
              )}
            </div>

            {isInStock ? (
              <div className="rounded-md bg-secondary p-3 text-secondary-foreground">
                <p className="font-bold text-sm">{t("inStock")}</p>
                {availableQuantity !== null &&
                  availableQuantity !== undefined &&
                  availableQuantity > 0 && (
                    <span className="mt-1 font-normal text-sm">
                      {t("unitsAvailable", { count: availableQuantity })}
                    </span>
                  )}
              </div>
            ) : (
              <div className="rounded-md bg-destructive/10 p-3 text-destructive">
                <p className="font-bold text-sm">{t("currentlyOutOfStock")}</p>
              </div>
            )}

            <div className="space-y-6">
              <div>
                <p className="mb-2 font-medium text-muted-foreground text-sm">
                  {variantLabel}
                </p>
                <VariantSelectorBasic
                  value={selectedVariantId}
                  onValueChange={handleVariantChange}
                  variants={variantsWithStockIndicator}
                  className="grid-cols-2 sm:grid-cols-2"
                  itemClassName="bg-muted border border-border hover:border-primary
                                data-[state=checked]:border-primary data-[state=checked]:bg-accent
                                data-[state=checked]:text-accent-foreground
                                focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:border-primary"
                />
              </div>
            </div>

            <div>
              <p className="mb-2 font-medium text-muted-foreground text-sm">
                {t("quantity")}
              </p>
              <QuantityInputBasic
                quantity={quantity}
                onChange={handleQuantityChange}
                max={
                  availableQuantity !== null && availableQuantity !== undefined
                    ? availableQuantity
                    : undefined
                }
                min={1}
                className="max-w-[150px] border-border"
                disabled={!isInStock}
              />
            </div>

            <div className="mt-2 flex flex-col flex-wrap gap-3 sm:flex-row">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleAddToCart}
                disabled={!isInStock || isLoading}
              >
                {isLoading ? t("loading") : t("addToCart")}
              </Button>
              <Button
                className="w-full"
                onClick={handleQuateRequest}
                disabled={isLoading}
              >
                {isLoading ? t("loading") : t("quoteRequest")}
              </Button>
            </div>

            <div className="mt-4 rounded-lg border border-border p-4">
              <p className="font-medium text-foreground">
                {t("selectedConfiguration")}
              </p>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-primary" />
                  <p className="text-muted-foreground">
                    {selectedVariant?.label}
                  </p>
                </div>
                <p className="font-medium text-primary">
                  {isOnSale ? (
                    <span>
                      <span className="mr-2 line-through opacity-70">
                        {format.number(currentPrice, "wholeMoneyWithCurrency", {
                          currency: currencyCode,
                        })}
                      </span>
                      {format.number(
                        currentSalePrice ?? currentPrice,
                        "wholeMoneyWithCurrency",
                        {
                          currency: currencyCode,
                        }
                      )}
                    </span>
                  ) : (
                    format.number(currentPrice, "wholeMoneyWithCurrency", {
                      currency: currencyCode,
                    })
                  )}
                </p>
              </div>
              <p className="mt-2 text-muted-foreground text-xs">
                {quantity} {t("units", { count: quantity })} ×{" "}
                {format.number(effectivePrice, "wholeMoneyWithCurrency", {
                  currency: currencyCode,
                })}{" "}
                ={" "}
                {format.number(
                  quantity * effectivePrice,
                  "wholeMoneyWithCurrency",
                  {
                    currency: currencyCode,
                  }
                )}
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                {isInStock ? t("inStock") : t("outOfStock")}
                {isInStock &&
                  availableQuantity !== null &&
                  availableQuantity !== undefined &&
                  ` (${t("unitsAvailable", { count: availableQuantity })})`}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ProductVariant;
export type { ProductVariantProps, VariantItem, VariantSelectionPayload };
