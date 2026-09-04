import { HeroSection as HeroSectionView } from "@repo/design-system/components/cms/blocks/hero-section";
import type { Locale } from "@repo/i18n";

import type { ContentfulHero } from "../../content";
import { toContentfulCallToAction, toContentfulImage } from "../../lib/content";

type HeroSectionProps = {
  readonly data: ContentfulHero;
  readonly locale: Locale;
};

export function HeroSection({ data, locale }: HeroSectionProps) {
  const ctaLinks = (data.actionsCollection?.items ?? []).flatMap((action) => {
    if (!action) {
      return [];
    }

    const link = toContentfulCallToAction(action, locale);
    return link ? [link] : [];
  });

  return (
    <HeroSectionView
      ctaLinks={ctaLinks}
      description={data.description}
      image={toContentfulImage(data.image)}
      tagline={data.tagline ?? undefined}
      title={data.heading}
    />
  );
}
