"use client";

import { cn } from "@repo/design-system/lib/utils";
import { useFormatter } from "@repo/i18n";

interface PriceFormat_SaleProps extends React.HTMLAttributes<HTMLDivElement> {
  originalPrice: number;
  salePrice?: number;
  currencyCode?: string;
  showSavePercentage?: boolean;
  classNameOriginalPrice?: string;
  classNameSalePrice?: string;
  classNameSalePercentage?: string;
}

const PriceFormat_Sale: React.FC<PriceFormat_SaleProps> = ({
  currencyCode,
  className,
  classNameOriginalPrice,
  classNameSalePercentage,
  classNameSalePrice,
  originalPrice,
  salePrice,
  showSavePercentage = false,
}) => {
  const format = useFormatter();

  const isSale = salePrice !== undefined && salePrice < originalPrice;
  const effectivePrice = isSale ? salePrice : originalPrice;
  const savePercentage = isSale
    ? ((originalPrice - salePrice) / originalPrice) * 100
    : 0;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      data-commerce-money="product-price"
      data-currency={currencyCode}
      data-minor-amount={Math.round(effectivePrice * 100)}
    >
      {isSale ? (
        <>
          <span
            className={cn(
              "font-medium text-gray-500 line-through",
              classNameOriginalPrice
            )}
          >
            {format.number(originalPrice, "wholeMoneyWithCurrency", {
              currency: currencyCode,
            })}
          </span>
          <span
            className={cn(
              "font-medium text-[length:inherit]",
              classNameSalePrice
            )}
          >
            {format.number(salePrice, "wholeMoneyWithCurrency", {
              currency: currencyCode,
            })}
          </span>
          {showSavePercentage && (
            <span
              className={cn(
                "rounded-sm bg-green-500/50 p-1 font-medium text-sm",
                classNameSalePercentage
              )}
            >
              Save {Math.round(savePercentage)}%
            </span>
          )}
        </>
      ) : (
        <span
          className={cn(
            "font-medium text-[length:inherit]",
            classNameSalePrice
          )}
        >
          {format.number(originalPrice, "wholeMoneyWithCurrency", {
            currency: currencyCode,
          })}
        </span>
      )}
    </div>
  );
};

export default PriceFormat_Sale;
