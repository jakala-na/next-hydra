import "./styles.css";
import { AuthProvider } from "@repo/auth/provider";
import { DesignSystemProvider } from "@repo/design-system";
import { fonts } from "@repo/design-system/lib/fonts";

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html className={fonts} lang="en-US" suppressHydrationWarning>
      <body>
        <AuthProvider>
          <DesignSystemProvider>{children}</DesignSystemProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
