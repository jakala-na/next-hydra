import { LandingPage } from "@repo/cms/components/pages/landing-page";
import type { Locale } from "@repo/i18n";

type PageProps = {
  params: Promise<{ url: string[]; locale: Locale }>;
};

export function generateStaticParams() {
  return [{ locale: "en-US", url: [] }];
}

const Page = async ({ params }: PageProps) => {
  const { url, locale } = await params;

  const urlStr = url?.join("/") ?? "/";
  return (
    <main className="container mx-auto">
      <LandingPage url={urlStr} locale={locale} />
    </main>
  );
};

export default Page;
