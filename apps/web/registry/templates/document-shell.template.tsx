import { AnalyticsProvider } from "@repo/analytics";
import { ArchitectureBoundary } from "@repo/demo-architecture/boundary";
import { ArchitectureToolbar } from "@repo/demo-architecture/toolbar";
/*{% echo imports %}*/
import { DesignSystemProvider } from "@repo/design-system";

import "@repo/demo-architecture/styles.css";
import { fonts } from "@repo/design-system/lib/fonts";
import { cn } from "@repo/design-system/lib/utils";

export function DocumentShell({
  children,
  lang,
}: {
  children: React.ReactNode;
  lang: string;
}) {
  return (
    <html
      className={cn(fonts, "scroll-smooth")}
      lang={lang}
      suppressHydrationWarning
    >
      <body>
        <ArchitectureBoundary
          name="Application shell"
          description="Contains the page layout and application providers."
          composition="app"
        >
          {/*{{ slots.providers.open }}*/}
          <AnalyticsProvider>
            <DesignSystemProvider>{children}</DesignSystemProvider>
          </AnalyticsProvider>
          {/*{{ slots.providers.close }}*/}
        </ArchitectureBoundary>
        <ArchitectureToolbar />
        {/*{{ slots.toolbar }}*/}
      </body>
    </html>
  );
}
