import { DesignSystemProvider } from "@repo/design-system";
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
        <DesignSystemProvider>{children}</DesignSystemProvider>
      </body>
    </html>
  );
}
