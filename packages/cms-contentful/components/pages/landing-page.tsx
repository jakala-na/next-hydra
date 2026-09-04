import { cn } from "@repo/design-system/lib/utils";
import type { Locale } from "@repo/i18n";

import type { ContentfulLandingPage } from "../../content";
import { ComponentRenderer } from "../component-renderer";

type LandingPageProps = {
  readonly data: ContentfulLandingPage;
  readonly locale: Locale;
};

export function LandingPage({ data, locale }: LandingPageProps) {
  return (
    <>
      {data.displayTitle ? (
        <h1 className={cn(data.hideDisplayTitle === true && "hidden")}>
          {data.displayTitle}
        </h1>
      ) : null}
      <ComponentRenderer
        data={data.componentsCollection?.items}
        locale={locale}
      />
    </>
  );
}
