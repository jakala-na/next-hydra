import type { Locale } from "@repo/i18n";
import type { ComponentProps } from "react";
import { LandingPage } from "./pages/landing-page";

export const pageMap = {
  NodeLandingPage: LandingPage,
} as const;

type BaseData = {
  __typename: string;
};

type PageMap = typeof pageMap;
type PageKey = keyof PageMap;
type PageData = ComponentProps<PageMap[PageKey]>["data"];

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

  const PageTemplate = pageMap[data.__typename];

  return (
    <PageTemplate
      // biome-ignore lint/suspicious/noExplicitAny: the typename guard selects the matching page fragment
      data={data as any}
      locale={locale}
    />
  );
}

PageRenderer.fragments = [LandingPage.fragment];
