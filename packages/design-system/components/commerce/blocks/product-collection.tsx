import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import type { ArchitectureMetadata } from "@repo/design-system/components/architecture/architecture-boundary";
import type { ReactNode } from "react";

import ProductCard from "../product-card";
import type { ProductCardProps } from "../product-card";

interface ProductCollectionProps {
  architecture?: ArchitectureMetadata;
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
  architecture?: ArchitectureMetadata;
  products: ProductCardProps[];
}

export function ProductCollectionLayout({
  children,
  description,
  title,
}: ProductCollectionLayoutProps) {
  return (
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

        {children}
      </div>
    </section>
  );
}

export function ProductGrid({ architecture, products }: ProductGridProps) {
  const grid = (
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

  return architecture ? (
    <ArchitectureBoundary {...architecture}>{grid}</ArchitectureBoundary>
  ) : (
    grid
  );
}

export function ProductCollection(props: ProductCollectionProps) {
  const { architecture, title, description, products } = props;

  const catalog = (
    <ProductCollectionLayout description={description} title={title}>
      <ProductGrid products={products} />
    </ProductCollectionLayout>
  );

  return architecture ? (
    <ArchitectureBoundary {...architecture}>{catalog}</ArchitectureBoundary>
  ) : (
    catalog
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
