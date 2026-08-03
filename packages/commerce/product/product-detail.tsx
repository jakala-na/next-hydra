import { ProductDetail as ProductDetailView } from "@repo/design-system/components/commerce/blocks/product-detail";
import type { Locale } from "@repo/i18n/types";
import { Effect, Option, Schema } from "effect";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { commerceRequestLayer } from "../commerce-context/request";
import { ProductSlug } from "./identity";
import {
  toProductDetailMetadata,
  toProductDetailPresentation,
  toProductJsonLd,
} from "./presentation";
import { ProductDiscovery } from "./product-discovery";

interface ProductDetailBoundaryProps {
  readonly slug: string;
  readonly locale: Locale;
}

const loadProductDetail = async ({
  locale,
  slug,
}: ProductDetailBoundaryProps) => {
  const productSlug = Schema.decodeUnknownSync(ProductSlug)(slug);
  const layer = await commerceRequestLayer(locale);
  const product = await Effect.runPromise(
    Effect.flatMap(ProductDiscovery, (discovery) =>
      discovery.findBySlug(productSlug)
    ).pipe(Effect.provide(layer))
  );

  if (Option.isNone(product)) {
    return notFound();
  }
  return product.value;
};

export async function generateMetadataHandler(
  props: ProductDetailBoundaryProps
): Promise<Metadata> {
  const product = await loadProductDetail(props);
  return toProductDetailMetadata(product);
}

export async function ProductDetailPage(props: ProductDetailBoundaryProps) {
  const product = await loadProductDetail(props);
  const productJsonLd = toProductJsonLd(product);

  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requires a script body.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <ProductDetailView {...toProductDetailPresentation(product)} />
    </>
  );
}
