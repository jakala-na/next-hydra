import type { NextConfig } from 'next';

export const withCMS = (config: NextConfig) => {
  return {
    ...config,
    experimental: {
      ...config.experimental,
      useCache: true,
    },
    allowedDevOrigins: [
      ...(config.allowedDevOrigins || []),
      'app.contentstack.com',
    ],
  };
};
