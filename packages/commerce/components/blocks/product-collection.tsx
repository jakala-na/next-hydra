import { productService } from "@repo/commerce/lib/product/product.service";
import { ProductCollection as ProductCollectionComponent } from "@repo/design-system/components/commerce/blocks/product-collection";
import type { Locale } from "@repo/i18n/types";
import type { ReactNode } from "react";

interface ProductCollectionProps {
  title: string;
  description?: ReactNode;
  categoryId?: string;
  limit?: number;
  locale: Locale;
  excludeProductId?: string;
}

export async function ProductCollection(props: ProductCollectionProps) {
  const {
    title,
    description,
    categoryId,
    limit = 3,
    excludeProductId,
    locale,
  } = props;
  const products = await productService.getProductsCollection(
    {
      filter: categoryId ? `categories.id:"${categoryId}"` : "",
      limit,
      excludeProductId,
    },
    locale
  );

  if (products.length === 0) {
    return null;
  }

  return (
    <ProductCollectionComponent
      title={title}
      description={description}
      products={products.map((product) => ({
        id: product.id,
        slug: product.slug,
        imageUrl: product.featuredImage?.url ?? "",
        imageTitle: product.featuredImage?.altText,
        title: product.title,
        description: product.description,
        price: product.priceFrom,
        currencyCode: product.currency,
      }))}
    />
  );
}
