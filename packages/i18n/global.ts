import type { routing } from '@/routing';
import messages from './messages/en.json' with { type: 'json' };

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
