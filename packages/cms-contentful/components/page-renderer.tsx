import type { Locale } from "@repo/i18n";

import type { ContentfulPage } from "../content";
import { ArticlePage } from "./pages/article";
import { LandingPage } from "./pages/landing-page";

type PageRendererProps = {
  readonly data: ContentfulPage;
  readonly locale: Locale;
};

export function PageRenderer({ data, locale }: PageRendererProps) {
  switch (data.__typename) {
    case "Article": {
      return <ArticlePage data={data} locale={locale} />;
    }
    case "LandingPage": {
      return <LandingPage data={data} locale={locale} />;
    }
    default: {
      return null;
    }
  }
}
