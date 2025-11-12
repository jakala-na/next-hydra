import { hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { CommandIcon } from "lucide-react";
import { notFound } from "next/navigation";

export default async function AuthLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  return (
    <div className="container relative grid min-h-[calc(100dvh-theme(spacing.20))] flex-col items-center justify-center lg:max-w-none lg:grid-cols-2 lg:px-0">
      <div className="relative hidden h-full flex-col bg-muted p-10 text-white lg:flex dark:border-r">
        <div className="absolute inset-0 bg-zinc-900" />
        <div className="relative z-20 flex items-center font-medium text-lg">
          <CommandIcon className="mr-2 h-6 w-6" />
          Next Hydra
        </div>
      </div>
      <div className="lg:p-8">
        <div className="mx-auto flex w-full max-w-[400px] flex-col justify-center space-y-6">
          {children}
        </div>
      </div>
    </div>
  );
}
