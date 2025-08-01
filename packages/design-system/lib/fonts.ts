import { cn } from '@repo/design-system/lib/utils';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { Barlow } from 'next/font/google';

const barlow = Barlow({
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  subsets: ['latin'],
  variable: '--font-barlow',
});

export const fonts = cn(
  barlow.className,
  GeistSans.variable,
  GeistMono.variable,
  'touch-manipulation font-sans antialiased'
);
