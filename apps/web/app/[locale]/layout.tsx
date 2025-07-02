import './styles.css';
import { LivePreview } from '@repo/cms/components/live-preview';
import { getNavigation } from '@repo/cms/lib/navigation';
import { DesignSystemProvider } from '@repo/design-system';
import { fonts } from '@repo/design-system/lib/fonts';
import { cn } from '@repo/design-system/lib/utils';
import { Toolbar } from '@repo/feature-flags/components/toolbar';
import { getDictionary } from '@repo/internationalization';
import { draftMode, headers } from 'next/headers';
import type { ReactNode } from 'react';
import { Footer } from './components/footer';
import { Header } from './components/header';

type RootLayoutProperties = {
  readonly children: ReactNode;
  readonly params: Promise<{
    locale: string;
  }>;
};

const RootLayout = async ({ children, params }: RootLayoutProperties) => {
  const { isEnabled: isDraftModeEnabled } = await draftMode();
  const { locale } = await params;
  const dictionary = await getDictionary(locale);
  let livePreviewHash = '';
  if (isDraftModeEnabled) {
    livePreviewHash = (await headers()).get('x-live-preview') || '';
  }
  const navigationItems = await getNavigation(locale, livePreviewHash);

  return (
    <html
      className={cn(fonts, 'scroll-smooth')}
      lang="en"
      suppressHydrationWarning
    >
      <body>
        <DesignSystemProvider>
          <Header dictionary={dictionary} navigationItems={navigationItems} />
          {children}
          <Footer />
          <LivePreview isEnabled={isDraftModeEnabled} />
        </DesignSystemProvider>
        <Toolbar />
      </body>
    </html>
  );
};

export default RootLayout;
