import {
  ArchitectureBoundary,
  type ArchitectureMetadata,
} from "@repo/design-system/components/architecture/architecture-boundary";
import type { ReactNode } from "react";
import ProductCard, { type ProductCardProps } from "../product-card";

interface ProductCollectionProps {
  architecture?: ArchitectureMetadata;
  description?: ReactNode;
  products: ProductCardProps[];
  title: string;
}

export function ProductCollection(props: ProductCollectionProps) {
  const { architecture, title, description, products } = props;

  const catalog = (
    <ArchitectureBoundary
      component="server"
      description="Provider-neutral presentation receives product card data and composes hydrated cards."
      layer="presentation"
      layerLabel="Design-system presentation"
      name="ProductCatalog"
      rendering="streamed"
      source="design-system"
      sourceLabel="Shared design system"
    >
      <section className="py-24">
        <div className="container px-4 md:px-6 lg:px-8">
          <div className="mb-12 flex items-end justify-between">
            <div className="space-y-4">
              <h3 className="font-bold text-4xl tracking-tight lg:text-5xl">
                {title}
              </h3>
              {description ? (
                <div className="max-w-2xl text-muted-foreground text-xl">
                  {description}
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <ProductCard key={product.id} {...product} />
            ))}
          </div>
        </div>
      </section>
    </ArchitectureBoundary>
  );

  return architecture ? (
    <ArchitectureBoundary {...architecture}>{catalog}</ArchitectureBoundary>
  ) : (
    catalog
  );
}

const SKELETON_CARDS = ["one", "two", "three"] as const;

export function ProductCatalogSkeleton({ title }: { title: string }) {
  return (
    <section className="py-24" role="status">
      <div className="container px-4 md:px-6 lg:px-8">
        <div className="mb-12 space-y-4">
          <p className="font-mono text-muted-foreground text-sm">
            Streaming Commerce data…
          </p>
          <h3 className="font-bold text-4xl tracking-tight lg:text-5xl">
            {title}
          </h3>
        </div>
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {SKELETON_CARDS.map((card) => (
            <div
              className="h-[32rem] animate-pulse rounded-xl bg-muted"
              key={card}
            />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading products</span>
    </section>
  );
}
