import { LandingPage } from '@repo/cms/components/pages/landing-page';

interface PageProps {
  params: Promise<{ url: string[]; locale: string }>;
}

export function generateStaticParams() {
  return [{ locale: 'en-US', url: [] }];
}

const Page = async ({ params }: PageProps) => {
  const { url, locale } = await params;

  const urlStr = url?.join('/') ?? '/';
  return (
    <main className="container mx-auto">
      <LandingPage url={urlStr} locale={locale} />
    </main>
  );
};

export default Page;
