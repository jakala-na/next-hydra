import type { Locale } from "@repo/i18n";
import type { ComponentProps } from "react";

import { DynamicProductCollection } from "./blocks/dynamic-product-collection";
import { FeaturedArticles } from "./blocks/featured-articles";
import { HeroSection } from "./blocks/hero-section";

export const componentMap = {
  ParagraphDynamicProductCollection: {
    Component: DynamicProductCollection,
    fragment: DynamicProductCollection.fragment,
    getCacheTags: () => [],
  },
  ParagraphFeaturedArticle: {
    Component: FeaturedArticles,
    fragment: FeaturedArticles.fragment,
    getCacheTags: FeaturedArticles.getCacheTags,
  },
  ParagraphHero: {
    Component: HeroSection,
    fragment: HeroSection.fragment,
    getCacheTags: () => [],
  },
} as const;

type BaseData = {
  __typename: string;
  id: string;
};

type ComponentMap = typeof componentMap;
type ComponentKey = keyof ComponentMap;
type ComponentData = ComponentProps<
  ComponentMap[ComponentKey]["Component"]
>["data"];

export type DataWithTypename =
  | (ComponentData & BaseData)
  | BaseData
  | null
  | undefined;

function isComponentKey(key: string): key is ComponentKey {
  return key in componentMap;
}

type ComponentRendererProps = {
  data: DataWithTypename | DataWithTypename[];
  locale: Locale;
};

export default function ComponentRenderer({
  data,
  locale,
}: ComponentRendererProps) {
  if (data === null || data === undefined) {
    return null;
  }

  if (Array.isArray(data)) {
    return (
      <>
        {data.map((item) => {
          if (
            item === null ||
            item === undefined ||
            !isComponentKey(item.__typename)
          ) {
            return null;
          }

          return (
            <div key={item.id}>
              <ComponentRenderer data={item} locale={locale} />
            </div>
          );
        })}
      </>
    );
  }

  if (!isComponentKey(data.__typename)) {
    return null;
  }

  const { Component } = componentMap[data.__typename];

  return (
    <Component
      // oxlint-disable-next-line typescript/no-explicit-any -- The typename guard selects the matching fragment component.
      data={data as any}
      locale={locale}
    />
  );
}

ComponentRenderer.fragments = Object.values(componentMap).map(
  ({ fragment }) => fragment
);

ComponentRenderer.getCacheTags = (
  data: DataWithTypename | DataWithTypename[]
): string[] => {
  if (data === null || data === undefined) {
    return [];
  }

  if (Array.isArray(data)) {
    return data.flatMap((item) => ComponentRenderer.getCacheTags(item));
  }

  if (!isComponentKey(data.__typename)) {
    return [];
  }

  const definition = componentMap[data.__typename];
  // oxlint-disable-next-line typescript/no-explicit-any -- The typename guard selects the matching component fragment.
  return definition.getCacheTags(data as any);
};
