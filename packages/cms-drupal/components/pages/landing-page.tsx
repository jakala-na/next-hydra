import { cn } from "@repo/design-system/lib/utils";
import type { Locale } from "@repo/i18n";

import { readFragment } from "../../graphql";
import type { FragmentOf } from "../../graphql";
import { getNodeCacheTag } from "../../lib/cache-tags";
import ComponentRenderer from "../component-renderer";
import { landingPageFragment } from "./landing-page-query";

export { landingPageFragment } from "./landing-page-query";

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
