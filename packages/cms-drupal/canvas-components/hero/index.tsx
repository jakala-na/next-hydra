"use client";

import { HeroSection } from "@repo/design-system/components/cms/blocks/hero-section";
import { Children, type ReactNode } from "react";

type CanvasImage = {
  alt: string;
  height?: number;
  src: string;
  width?: number;
};

type CanvasHeroProps = {
  content?: ReactNode;
  description?: string;
  image?: CanvasImage;
  primaryCtaLabel?: string;
  primaryCtaUrl?: string;
  secondaryCtaLabel?: string;
  secondaryCtaUrl?: string;
  tagline?: string;
  title: string;
};

function resolveDrupalMediaUrl(source: string): string {
  try {
    return new URL(source).toString();
  } catch {
    const siteUrl = process.env.CANVAS_SITE_URL;
    return siteUrl ? new URL(source, siteUrl).toString() : source;
  }
}

function ctaLink(label?: string, url?: string) {
  return label && url ? { label, url } : null;
}

export default function CanvasHero({
  content,
  description,
  image,
  primaryCtaLabel,
  primaryCtaUrl,
  secondaryCtaLabel,
  secondaryCtaUrl,
  tagline,
  title,
}: CanvasHeroProps) {
  const ctaLinks = [
    ctaLink(primaryCtaLabel, primaryCtaUrl),
    ctaLink(secondaryCtaLabel, secondaryCtaUrl),
  ].filter((link): link is { label: string; url: string } => link !== null);
  const slotHasContent = Children.count(content) > 0;

  return (
    <HeroSection
      ctaLinks={ctaLinks}
      description={slotHasContent ? content : description}
      image={
        image
          ? {
              altText: image.alt,
              height: image.height,
              url: resolveDrupalMediaUrl(image.src),
              width: image.width,
            }
          : undefined
      }
      tagline={tagline}
      title={title}
    />
  );
}
