import { useTranslations } from "@repo/i18n";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Card, CardContent, CardFooter } from "../../ui/card";

interface ProductCardProps {
  id: string;
  slug?: string;
  imageUrl: string;
  imageTitle?: string;
  title: string;
  description?: string;
  price?: number;
  currencyCode?: string;
  badge?: string;
  isInStock?: boolean;
  category?: string;
}

interface ProductCollectionProps {
  title: string;
  description?: ReactNode;
  products: ProductCardProps[];
}

export function ProductCollection(props: ProductCollectionProps) {
  const { title, description, products } = props;

  const t = useTranslations("web.product");
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
            <Card
              key={product.id}
              className="group overflow-hidden transition-all duration-300 hover:shadow-lg"
            >
              <div className="relative h-72 overflow-hidden bg-muted">
                {product.badge && (
                  <Badge className="absolute top-4 left-4 z-10 bg-primary text-primary-foreground">
                    {product.badge}
                  </Badge>
                )}
                {product.imageUrl && (
                  <Image
                    src={product.imageUrl}
                    alt={product.imageTitle || ""}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                )}
              </div>
              <CardContent className="space-y-4 p-6">
                <div className="space-y-2">
                  <p className="font-medium text-primary text-sm">
                    {product.category}
                  </p>
                  <h3 className="font-bold text-2xl">{product.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {product.description}
                  </p>
                </div>
              </CardContent>
              <CardFooter className="gap-3 p-6 pt-0">
                <Button className="flex-1">{t("quoteRequest")}</Button>
                <Link href={`/product/${product.slug}`} className="flex-1">
                  <Button variant="outline" className="w-full bg-transparent">
                    {t("viewDetails")}
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
