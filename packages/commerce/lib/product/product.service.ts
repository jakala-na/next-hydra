import type { Locale } from "@repo/i18n/types";
import { readFragment } from "../../graphql";
import { storeRepo } from "../store/store.repo";
import { storeService } from "../store/store.service";
import type { ProductCardDTO, ProductDetailsDTO } from "../types";
import {
  productCardFragment,
  reshapeProductCard,
} from "./mappers/product-card";
import {
  productPageFragment,
  reshapeProductPage,
} from "./mappers/product-page";
import { productSearchVariantFragment } from "./mappers/variant";
import { productRepo } from "./product.repo";
import { filterVariantsByProductSelections } from "./utils/product-selections";

async function getProductBySlug(
  slug: string,
  locale: Locale
): Promise<ProductDetailsDTO | null> {
  const ctx = await storeService.getStoreContextByLocale(locale);

  const projection = await productRepo.getProductProjectionBySlug(slug, {
    locale: ctx.locale,
    currency: ctx.currency,
    distributionChannelId: ctx.distributionChannelId,
    supplyChannelIds: ctx.supplyChannelIds,
  });

  if (!projection) {
    return null;
  }

  const productSelections = await storeRepo.getProductSelectionsForProducts(
    ctx.storeKey,
    [readFragment(productPageFragment, projection).id]
  );

  return reshapeProductPage(projection, locale, productSelections);
}

async function getProductsCollection(
  params: {
    filter: string;
    limit: number;
    excludeProductId?: string;
  },
  locale: Locale
): Promise<ProductCardDTO[]> {
  "use cache";

  const ctx = await storeService.getStoreContextByLocale(locale);
  const projections = await productRepo.getProductProjectionsCollection(
    { filter: params.filter, limit: params.limit },
    {
      locale: ctx.locale,
      currency: ctx.currency,
      distributionChannelId: ctx.distributionChannelId,
      supplyChannelIds: ctx.supplyChannelIds,
    }
  );

  if (!projections || projections.length === 0) {
    return [];
  }

  const productIds = projections.map(
    (p) => readFragment(productCardFragment, p).id
  );
  const selections = await storeRepo.getProductSelectionsForProducts(
    ctx.storeKey,
    productIds
  );

  return projections
    .filter((p) => {
      const parsed = readFragment(productCardFragment, p);
      const variantsForFilter = parsed.allVariants.map((v) =>
        readFragment(productSearchVariantFragment, v)
      );
      return (
        filterVariantsByProductSelections(
          variantsForFilter,
          selections.get(parsed.id) ?? []
        ).length > 0
      );
    })
    .filter(
      (p) => readFragment(productCardFragment, p).id !== params.excludeProductId
    )
    .map((p) => reshapeProductCard(p, locale));
}

export const productService = {
  getProductBySlug,
  getProductsCollection,
};
