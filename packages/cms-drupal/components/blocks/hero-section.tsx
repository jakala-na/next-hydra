import { HeroSection as HeroSectionComponent } from "@repo/design-system/components/cms/blocks/hero-section";
import type { Locale } from "@repo/i18n";

import { graphql, readFragment } from "../../graphql";
import type { FragmentOf } from "../../graphql";

export const heroSectionFragment = graphql(`
  fragment DrupalHeroSection on ParagraphHero {
    tagline
    heroHeading: heading
    heroDescription: description
    actions {
      title
      url
    }
    image {
      __typename
      ... on MediaImage {
        mediaImage {
          url
          width
          height
          alt
        }
      }
    }
  }
`);

type HeroSectionProps = {
  data: FragmentOf<typeof heroSectionFragment>;
  locale: Locale;
};

export function HeroSection(props: HeroSectionProps) {
  const data = readFragment(heroSectionFragment, props.data);
  const image =
    data.image.__typename === "MediaImage"
      ? {
          altText: data.image.mediaImage.alt ?? "",
          height: data.image.mediaImage.height,
          url: data.image.mediaImage.url,
          width: data.image.mediaImage.width,
        }
      : undefined;

  const ctaLinks = (data.actions ?? []).flatMap((action) =>
    action.title && action.url ? [{ label: action.title, url: action.url }] : []
  );

  return (
    <HeroSectionComponent
      ctaLinks={ctaLinks}
      description={data.heroDescription}
      image={image}
      tagline={data.tagline ?? undefined}
      title={data.heroHeading}
    />
  );
}

HeroSection.fragment = heroSectionFragment;
