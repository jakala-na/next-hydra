"use client";

import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
} from "@repo/design-system/components/ui/card";
import { useTranslations } from "@repo/i18n";
import Image from "next/image";
import Link from "next/link";

import { Badge } from "../ui/badge";

interface ProductCardProps {
  badge?: string;
  category?: string;
  currencyCode?: string;
  description?: string;
  id: string;
  imageTitle?: string;
  imageUrl: string;
  isInStock?: boolean;
  price?: number;
  slug?: string;
  title: string;
}

function ProductCard({
  slug,
  imageUrl,
  imageTitle,
  title,
  description,
  badge,
  category,
}: ProductCardProps) {
  const t = useTranslations("web.product");
  return (
    <ArchitectureBoundary
      component="client"
      description="Hydrates translations and product interactions in the browser."
      layer="interactive"
      layerLabel="Interactive design-system leaf"
      name="ProductCard"
      rendering="streamed"
      source="design-system"
      sourceLabel="Shared design system"
    >
      <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg">
        <div className="relative h-72 overflow-hidden bg-muted">
          {badge ? (
            <Badge className="absolute top-4 left-4 z-10 bg-primary text-primary-foreground">
              {badge}
            </Badge>
          ) : null}
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={imageTitle || ""}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : null}
        </div>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-2">
            <p className="font-medium text-primary text-sm">{category}</p>
            <h3 className="font-bold text-2xl">{title}</h3>
            <p className="text-muted-foreground leading-relaxed">
              {description}
            </p>
          </div>
        </CardContent>
        <CardFooter className="gap-3 p-6 pt-0">
          <Button className="flex-1">{t("quoteRequest")}</Button>
          <Link href={`/product/${slug}`} className="flex-1">
            <Button variant="outline" className="w-full bg-transparent">
              {t("viewDetails")}
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </ArchitectureBoundary>
  );
}

export default ProductCard;
export type { ProductCardProps };
