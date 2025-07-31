import type { NextConfig } from 'next';

export const withCMS = (config: NextConfig) => {
  return {
    ...config,
    allowedDevOrigins: [...(config.allowedDevOrigins || []), 'app.contentstack.com'],
  };
};
