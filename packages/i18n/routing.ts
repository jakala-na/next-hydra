import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // A list of all locales that are supported
  locales: ['en-US', 'fr-CA', 'en-CA'],
  localePrefix: 'as-needed',
  // Used when no locale matches
  defaultLocale: 'en-US',
});
