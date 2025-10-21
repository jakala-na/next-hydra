"use client";

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
    <Card className="group overflow-hidden transition-all duration-300 hover:shadow-lg">
      <div className="relative h-72 overflow-hidden bg-muted">
        {badge && (
          <Badge className="absolute top-4 left-4 z-10 bg-primary text-primary-foreground">
            {badge}
          </Badge>
        )}
        {imageUrl && (
          <Image
            src={imageUrl}
            alt={imageTitle || ""}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
      </div>
      <CardContent className="space-y-4 p-6">
        <div className="space-y-2">
          <p className="font-medium text-primary text-sm">{category}</p>
          <h3 className="font-bold text-2xl">{title}</h3>
          <p className="text-muted-foreground leading-relaxed">{description}</p>
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
  );
}

export default ProductCard;
export type { ProductCardProps };
