'use client';

import { Button } from '@repo/design-system/components/ui/button';
import { useState } from 'react';
import {
  type AddToCartActionParams,
  addToCartAction,
} from '../../actions/add-to-cart';

export interface AddToCartProps {
  productId?: string;
  sku?: string;
  variantId?: number;
  quantity?: number;
  customerId?: string;
  disabled?: boolean;
  children?: React.ReactNode;
  onSuccess?: (cart: any) => void;
  onError?: (error: string) => void;
  className?: string;
}

export function AddToCart({
  productId,
  sku,
  variantId,
  quantity = 1,
  customerId,
  disabled = false,
  children = 'Add to Cart',
  onSuccess,
  onError,
  className,
}: AddToCartProps) {
  const [isPending, setIsPending] = useState(false);

  const handleAddToCart = async () => {
    if (!(productId || sku)) {
      const error = 'Either productId or sku is required';
      onError?.(error);
      return;
    }

    if (!customerId) {
      const error = 'Customer ID is required';
      onError?.(error);
      return;
    }

    setIsPending(true);

    try {
      const params: AddToCartActionParams = {
        productId,
        sku,
        variantId,
        quantity,
        customerId,
      };

      const result = await addToCartAction(params);

      if (result.success && result.cart) {
        onSuccess?.(result.cart);
      } else {
        onError?.(result.error || 'Failed to add item to cart');
      }
    } catch (error) {
      onError?.(
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Button
      onClick={handleAddToCart}
      disabled={disabled || isPending}
      className={className}
    >
      {isPending ? 'Adding...' : children}
    </Button>
  );
}
