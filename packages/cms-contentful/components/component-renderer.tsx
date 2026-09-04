import type { Locale } from "@repo/i18n";

import type { ContentfulComponent } from "../content";
import { DynamicProductCollection } from "./blocks/dynamic-product-collection";
import { FeaturedArticles } from "./blocks/featured-articles";
import { HeroSection } from "./blocks/hero-section";

type ComponentRendererProps = {
  readonly data:
    | ContentfulComponent
    | readonly (ContentfulComponent | null)[]
    | null
    | undefined;
  readonly locale: Locale;
};

const isComponentArray = (
  data: ComponentRendererProps["data"]
): data is readonly (ContentfulComponent | null)[] => Array.isArray(data);

export function ComponentRenderer({ data, locale }: ComponentRendererProps) {
  if (!data) {
    return null;
  }

  if (isComponentArray(data)) {
    return (
      <>
        {data.map((component) =>
          component ? (
            <div key={component.sys.id}>
              <ComponentRenderer data={component} locale={locale} />
            </div>
          ) : null
        )}
      </>
    );
  }

  switch (data.__typename) {
    case "DynamicProductCollection": {
      return <DynamicProductCollection data={data} locale={locale} />;
    }
    case "FeaturedArticles": {
      return <FeaturedArticles data={data} locale={locale} />;
    }
    case "Hero": {
      return <HeroSection data={data} locale={locale} />;
    }
    default: {
      return null;
    }
  }
}
