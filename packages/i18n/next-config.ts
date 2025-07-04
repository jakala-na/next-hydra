import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();
export const withI18n: ReturnType<typeof createNextIntlPlugin> = withNextIntl;
