"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { cn } from "@repo/design-system/lib/utils";

export interface VariantItem {
  id: string;
  value: string;
  label: string;
  options?: readonly VariantItemOption[];
  disabled?: boolean;
}

export interface VariantItemOption {
  readonly name: string;
  readonly value: string;
}

interface VariantSelectorBasicProps {
  value: string;
  onValueChange: (value: string) => void;
  variants: VariantItem[];
  label?: string;
  className?: string;
  itemClassName?: string;
  labelClassName?: string;
}

const VariantSelectorBasic = ({
  className,
  itemClassName,
  label,
  labelClassName,
  onValueChange,
  value,
  variants,
}: VariantSelectorBasicProps) => (
  <RadioGroupPrimitive.Root
    aria-label={label}
    className={cn("flex flex-wrap gap-3", className)}
    value={value}
    onValueChange={onValueChange}
  >
    {variants.map((variant) => (
      <div key={variant.id} className="flex items-center">
        <RadioGroupPrimitive.Item
          id={variant.id}
          value={variant.value}
          disabled={variant.disabled}
          className={cn(
            "peer relative h-10 w-full min-w-[80px] rounded-md border border-gray-300 px-3 py-2 text-center text-sm transition-all",
            "dark:border-gray-600 dark:text-gray-100",
            "data-[state=checked]:border-black dark:data-[state=checked]:border-white",
            "focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2",
            "dark:focus:ring-white dark:focus:ring-offset-gray-900",
            "cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
            itemClassName
          )}
        >
          <span className={cn("font-medium", labelClassName)}>
            {variant.label}
          </span>
          {variant.options?.map((option) => (
            <span
              data-commerce-product-option=""
              data-product-option-name={option.name}
              data-product-option-value={option.value}
              hidden
              key={option.name}
            />
          ))}
        </RadioGroupPrimitive.Item>
      </div>
    ))}
  </RadioGroupPrimitive.Root>
);

export default VariantSelectorBasic;
