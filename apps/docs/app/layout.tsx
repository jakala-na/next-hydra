import { VercelAnalytics } from "@repo/analytics/vercel";
import { RootProvider } from "fumadocs-ui/provider/next";
import "./global.css";
import { Inter, JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

const inter = Inter({
  subsets: ["latin"],
});

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn(inter.className, "font-mono", jetbrainsMono.variable)}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
        <VercelAnalytics />
      </body>
    </html>
  );
}
