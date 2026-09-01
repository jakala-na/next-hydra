import { NextCommerce } from "@repo/commerce/runtime";
import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import { ProductDetail as ProductDetailView } from "@repo/design-system/components/commerce/blocks/product-detail";
import type { Locale } from "@repo/i18n/types";
import { Effect, Option, Schema } from "effect";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { CommerceContextObservation } from "../commerce-context/commerce-context-observation";
import { CommerceContext } from "../services/commerce-context";
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
  await connection();

  const productSlug = Schema.decodeUnknownSync(ProductSlug)(slug);
  const { product, store } = await NextCommerce.runPromise(
    Effect.gen(function* () {
      const context = yield* CommerceContext;
      const discovery = yield* ProductDiscovery;
      const discoveredProduct = yield* discovery.findBySlug(productSlug);

      return { product: discoveredProduct, store: context.store };
    }).pipe(NextCommerce.provide(locale))
  );

  if (Option.isNone(product)) {
    return notFound();
  }
  return { product: product.value, store };
};

export async function generateMetadataHandler(
  props: ProductDetailBoundaryProps
): Promise<Metadata> {
  const { product } = await loadProductDetail(props);
  return toProductDetailMetadata(product);
}

export async function ProductDetailPage(props: ProductDetailBoundaryProps) {
  const { product, store } = await loadProductDetail(props);
  const productJsonLd = toProductJsonLd(product);

  return (
    <>
      <CommerceContextObservation store={store} />
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
    </>
  );
}
