import { LandingPage } from '@repo/cms/components/landing-page';

interface PageProps {
  params: Promise<{ url: string[]; locale: string }>;
}

const Page = async ({ params }: PageProps) => {
  const { url, locale } = await params;

  const urlStr = url?.join('/') ?? '/';
  return (
    <main style={{ padding: 32 }}>
      <LandingPage url={urlStr} locale={locale} />
      {/* <FeaturedProducts /> */}
    </main>
  );
};

export default Page;
