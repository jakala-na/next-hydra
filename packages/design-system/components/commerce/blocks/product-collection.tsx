import { ArchitectureBoundary } from "@repo/demo-architecture/boundary";
import type { ReactNode } from "react";

import ProductCard from "../product-card";
import type { ProductCardProps } from "../product-card";

interface ProductCollectionProps {
  description?: ReactNode;
  products: ProductCardProps[];
  title: string;
}

interface ProductCollectionLayoutProps {
  children: ReactNode;
  description?: ReactNode;
  title: string;
}

interface ProductGridProps {
  products: ProductCardProps[];
}

export function ProductCollectionLayout({
  children,
  description,
  title,
}: ProductCollectionLayoutProps) {
  const hasDescription = Boolean(description);
  return (
    <section className="py-24">
      <div className="container px-4 md:px-6 lg:px-8">
        <div className="mb-12 flex items-end justify-between">
          <div className="space-y-4">
            <h3 className="font-bold text-4xl tracking-tight lg:text-5xl">
              {title}
            </h3>
            {hasDescription ? (
              <div className="max-w-2xl text-muted-foreground text-xl">
                {description}
              </div>
            ) : null}
          </div>
        </div>

        {children}
      </div>
    </section>
  );
}

export function ProductGrid({ products }: ProductGridProps) {
  return (
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
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.id} {...product} />
        ))}
      </div>
    </ArchitectureBoundary>
  );
}

export function ProductCollection(props: ProductCollectionProps) {
  const { title, description, products } = props;

  return (
    <ProductCollectionLayout description={description} title={title}>
      <ProductGrid products={products} />
    </ProductCollectionLayout>
  );
}

const SKELETON_CARDS = ["one", "two", "three"] as const;

export function ProductCatalogSkeleton() {
  return (
    <div role="status">
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
        {SKELETON_CARDS.map((card) => (
          <div
            className="h-[32rem] animate-pulse rounded-xl bg-muted"
            key={card}
          />
        ))}
      </div>
      <span className="sr-only">Loading products</span>
    </div>
  );
}
