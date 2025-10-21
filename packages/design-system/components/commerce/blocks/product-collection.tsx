import type { ReactNode } from "react";
import ProductCard, { type ProductCardProps } from "../product-card";

interface ProductCollectionProps {
  title: string;
  description?: ReactNode;
  products: ProductCardProps[];
}

export function ProductCollection(props: ProductCollectionProps) {
  const { title, description, products } = props;

  return (
    <section className="py-24">
      <div className="container px-4 md:px-6 lg:px-8">
        <div className="mb-12 flex items-end justify-between">
          <div className="space-y-4">
            <h3 className="font-bold text-4xl tracking-tight lg:text-5xl">
              {title}
            </h3>
            {description && (
              <div className="max-w-2xl text-muted-foreground text-xl">
                {description}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductCard key={product.id} {...product} />
          ))}
        </div>
      </div>
    </section>
  );
}
