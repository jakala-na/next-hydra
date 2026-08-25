import { NextCommerce } from "@repo/commerce/runtime";
import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import { ProductDetail as ProductDetailView } from "@repo/design-system/components/commerce/blocks/product-detail";
import type { Locale } from "@repo/i18n/types";
import { Effect, Option, Schema } from "effect";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductSlug } from "./identity";
import {
  toProductDetailMetadata,
  toProductDetailPresentation,
  toProductJsonLd,
} from "./presentation";
import { ProductDiscovery } from "./product-discovery";

interface ProductDetailBoundaryProps {
  readonly locale: Locale;
  readonly slug: string;
}

const loadProductDetail = async ({
  locale,
  slug,
}: ProductDetailBoundaryProps) => {
  const productSlug = Schema.decodeUnknownSync(ProductSlug)(slug);
  const product = await NextCommerce.runPromise(
    Effect.flatMap(ProductDiscovery, (discovery) =>
      discovery.findBySlug(productSlug)
    ).pipe(NextCommerce.provide(locale))
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
    <ArchitectureBoundary
      component="server"
      description="Uses the request Commerce Context to resolve customer-group pricing, Store availability, and eligible variants."
      layer="orchestration"
      layerLabel="Personalized Commerce orchestration"
      name="DynamicProductDetail"
      rendering="streamed"
      source="commerce"
      sourceLabel="Commerce provider"
    >
      <script
        type="application/ld+json"
        // oxlint-disable-next-line react/no-danger -- JSON-LD requires a script body.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <ProductDetailView {...toProductDetailPresentation(product)} />
    </ArchitectureBoundary>
  );
}
