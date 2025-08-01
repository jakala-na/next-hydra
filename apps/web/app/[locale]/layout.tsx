import './styles.css';
import { LivePreview } from '@repo/cms/components/live-preview';
import { getNavigation } from '@repo/cms/lib/navigation';
import { DesignSystemProvider } from '@repo/design-system';
import { fonts } from '@repo/design-system/lib/fonts';
import { cn } from '@repo/design-system/lib/utils';
import { Toolbar } from '@repo/feature-flags/components/toolbar';
import { hasLocale, NextIntlClientProvider } from '@repo/i18n';
import { routing } from '@repo/i18n/routing';
import { draftMode, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Header } from '../components/header';

type RootLayoutProperties = {
  readonly children: ReactNode;
  readonly params: Promise<{
    locale: string;
  }>;
};

const RootLayout = async ({ children, params }: RootLayoutProperties) => {
  const { isEnabled: isDraftModeEnabled } = await draftMode();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  let livePreviewHash = '';
  if (isDraftModeEnabled) {
    livePreviewHash = (await headers()).get('x-live-preview') || '';
  }
  const navigationItems = await getNavigation(locale, livePreviewHash);

  return (
    <html className={cn(fonts, 'scroll-smooth')} lang={locale} suppressHydrationWarning>
      <body>
        <DesignSystemProvider>
          <NextIntlClientProvider>
            <Header navigationItems={navigationItems} />
            {children}
            {/* <Footer /> */}
            <LivePreview isEnabled={isDraftModeEnabled} />
          </NextIntlClientProvider>
        </DesignSystemProvider>
        <Toolbar />
      </body>
    </html>
  );
};

export default RootLayout;
