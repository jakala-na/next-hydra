"use client";

import type { UrlObject } from "node:url";

import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
} from "@repo/design-system/components/ui/card";
import { useFormatter, useTranslations } from "@repo/i18n";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";

import { Badge } from "../ui/badge";

interface ProductCardProps {
  badge?: string;
  category?: string;
  currencyCode?: string;
  description?: string;
  headingLevel?: "h2" | "h3";
  id: string;
  imageTitle?: string;
  imageUrl: string;
  isInStock?: boolean;
  price?: number;
  productHref?: Route | UrlObject;
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
  currencyCode,
  headingLevel = "h3",
  price,
  productHref,
}: ProductCardProps) {
  const format = useFormatter();
  const t = useTranslations("web.product");
  const Heading = headingLevel;
  const detailsHref = productHref ?? { pathname: `/product/${slug}` };
  const formattedPrice =
    price === undefined || currencyCode === undefined
      ? undefined
      : format.number(price, {
          currency: currencyCode,
          style: "currency",
        });

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
              alt={imageTitle ?? ""}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
            />
          ) : null}
        </div>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-2">
            <p className="font-medium text-primary text-sm">{category}</p>
            <Heading className="font-bold text-2xl">{title}</Heading>
            <p className="text-muted-foreground leading-relaxed">
              {description}
            </p>
            {formattedPrice === undefined ? null : (
              <p className="font-semibold text-lg">
                {t("priceStartsAt", { price: formattedPrice })}
              </p>
            )}
          </div>
        </CardContent>
        <CardFooter className="gap-3 p-6 pt-0">
          <Button className="flex-1">{t("quoteRequest")}</Button>
          <Link href={detailsHref} className="flex-1">
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
