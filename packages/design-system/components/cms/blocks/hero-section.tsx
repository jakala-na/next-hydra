import { ArrowRight } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";

import type { LivePreviewProps } from "../../../lib/types";
import { Button } from "../../ui/button";

type HeroSectionProps = {
  tagline?: string;
  title: string;
  description: ReactNode;
  image?: {
    url: string;
    altText: string;
    width?: number;
    height?: number;
  };
  ctaLinks: {
    label: string;
    url: string;
  }[];
  livePreviewProps?: LivePreviewProps<
    ["tagline", "title", "description", "image", "cta"]
  >;
};

export function HeroSection({
  title,
  description,
  image,
  ctaLinks,
  tagline,
  livePreviewProps,
}: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden" {...livePreviewProps?.root}>
      <div className="container px-4 py-24 md:px-6 lg:px-8 lg:py-32">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="space-y-8">
            {tagline ? (
              <div className="inline-block">
                <span
                  className="rounded-full bg-primary/10 px-4 py-2 font-medium text-primary text-sm"
                  {...livePreviewProps?.tagline}
                >
                  {tagline}
                </span>
              </div>
            ) : null}

            <h1
              className="text-balance font-bold text-5xl tracking-tight lg:text-7xl"
              {...livePreviewProps?.title}
            >
              {title}
            </h1>

            {Boolean(description) ? (
              <div
                className="max-w-xl text-muted-foreground text-xl leading-relaxed"
                {...livePreviewProps?.description}
              >
                {description}
              </div>
            ) : null}

            {ctaLinks.length > 0 ? (
              <div
                className="flex flex-col gap-4 sm:flex-row"
                {...livePreviewProps?.cta}
              >
                {ctaLinks.map((cta, index) => {
                  if (index === 0) {
                    return (
                      <Button
                        asChild
                        size="lg"
                        className="text-base"
                        key={`${cta.label}:${cta.url}`}
                      >
                        <a href={cta.url}>
                          {cta.label}
                          <ArrowRight className="ml-2 h-5 w-5" />
                        </a>
                      </Button>
                    );
                  }
                  return (
                    <Button
                      asChild
                      size="lg"
                      variant="outline"
                      className="bg-transparent text-base"
                      key={`${cta.label}:${cta.url}`}
                    >
                      <a href={cta.url}>{cta.label}</a>
                    </Button>
                  );
                })}
              </div>
            ) : null}
            {/** TODO: Add statistics from CMS */}
            <div className="grid grid-cols-3 gap-8 border-t pt-8">
              <div>
                <div className="font-bold text-3xl text-primary">50+</div>
                <div className="text-muted-foreground text-sm">Countries</div>
              </div>
              <div>
                <div className="font-bold text-3xl text-primary">10K+</div>
                <div className="text-muted-foreground text-sm">
                  Installations
                </div>
              </div>
              <div>
                <div className="font-bold text-3xl text-primary">24/7</div>
                <div className="text-muted-foreground text-sm">Support</div>
              </div>
            </div>
          </div>

          {image ? (
            <div
              className="relative h-[600px] overflow-hidden rounded-lg bg-muted"
              {...livePreviewProps?.image}
            >
              <Image
                src={image.url}
                alt={image.altText}
                fill
                preload
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
