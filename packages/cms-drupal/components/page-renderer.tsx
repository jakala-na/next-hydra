import type { Locale } from "@repo/i18n";
import type { ComponentProps } from "react";

import { ArticlePage } from "./pages/article";
import { LandingPage } from "./pages/landing-page";

export const pageMap = {
  NodeArticle: {
    Component: ArticlePage,
    fragment: ArticlePage.fragment,
    getCacheTags: ArticlePage.getCacheTags,
  },
  NodeLandingPage: {
    Component: LandingPage,
    fragment: LandingPage.fragment,
    getCacheTags: LandingPage.getCacheTags,
  },
} as const;

type BaseData = {
  __typename: string;
};

type PageMap = typeof pageMap;
type PageKey = keyof PageMap;
type PageData = ComponentProps<PageMap[PageKey]["Component"]>["data"];

export type DataWithTypename =
  | (PageData & BaseData)
  | BaseData
  | null
  | undefined;

export function isPageKey(key: string): key is PageKey {
  return key in pageMap;
}

type PageRendererProps = {
  data: DataWithTypename;
  locale: Locale;
};

export default function PageRenderer({ data, locale }: PageRendererProps) {
  if (!(data && isPageKey(data.__typename))) {
    return null;
  }

  const { Component } = pageMap[data.__typename];

  return (
    <Component
      // oxlint-disable-next-line typescript/no-explicit-any -- The typename guard selects the matching page fragment.
      data={data as any}
      locale={locale}
    />
  );
}

PageRenderer.fragments = Object.values(pageMap).map(({ fragment }) => fragment);

PageRenderer.getCacheTags = (data: DataWithTypename): string[] => {
  if (!(data && isPageKey(data.__typename))) {
    return [];
  }

  const definition = pageMap[data.__typename];
  // oxlint-disable-next-line typescript/no-explicit-any -- The typename guard selects the matching page fragment.
  return definition.getCacheTags(data as any);
};
