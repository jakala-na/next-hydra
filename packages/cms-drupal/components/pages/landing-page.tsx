import { cn } from "@repo/design-system/lib/utils";
import type { Locale } from "@repo/i18n";
import { type FragmentOf, graphql, readFragment } from "../../graphql";
import { getNodeCacheTag } from "../../lib/cache-tags";
import ComponentRenderer from "../component-renderer";

export const landingPageFragment = graphql(
  `
    fragment DrupalLandingPage on NodeLandingPage {
      __typename
      id
      title
      displayTitle
      hideDisplayTitle
      components {
        __typename
        ... on ParagraphInterface {
          id
        }
        ...DrupalHeroSection
        ...DrupalDynamicProductCollection
        ...DrupalFeaturedArticles
      }
    }
  `,
  [...ComponentRenderer.fragments]
);

type LandingPageProps = {
  data: FragmentOf<typeof landingPageFragment>;
  locale: Locale;
};

export function LandingPage({ data, locale }: LandingPageProps) {
  const page = readFragment(landingPageFragment, data);

  return (
    <>
      {page.displayTitle ? (
        <h1 className={cn(page.hideDisplayTitle === true && "hidden")}>
          {page.displayTitle}
        </h1>
      ) : null}
      <ComponentRenderer data={page.components} locale={locale} />
    </>
  );
}

LandingPage.fragment = landingPageFragment;
LandingPage.getCacheTags = (data: LandingPageProps["data"]) => {
  const page = readFragment(landingPageFragment, data);
  return [
    getNodeCacheTag(page),
    ...ComponentRenderer.getCacheTags(page.components),
  ];
};
