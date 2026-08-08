import "./[locale]/styles.css";
import { AuthProvider } from "@repo/auth-workos/provider";
import { DesignSystemProvider } from "@repo/design-system";
import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import { ArchitectureToolbar } from "@repo/design-system/components/architecture/architecture-toolbar";
import { fonts } from "@repo/design-system/lib/fonts";
import { cn } from "@repo/design-system/lib/utils";
import { Toolbar } from "@repo/feature-flags/components/toolbar";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      className={cn(fonts, "scroll-smooth")}
      lang="en"
      suppressHydrationWarning
    >
      <body>
        <ArchitectureBoundary
          component="server"
          description="Build-time application frame around cached and streamed route content."
          layer="shell"
          layerLabel="App Router shell"
          name="ApplicationShell"
          rendering="static"
          source="app"
          sourceLabel="Next.js application"
        >
          <AuthProvider>
            <DesignSystemProvider>{children}</DesignSystemProvider>
          </AuthProvider>
        </ArchitectureBoundary>
        <ArchitectureToolbar />
        <Toolbar />
      </body>
    </html>
  );
}
