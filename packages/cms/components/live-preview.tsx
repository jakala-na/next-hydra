'use client';

import ContentstackLivePreview from '@contentstack/live-preview-utils';
import { useEffect } from 'react';
import { keys } from '../keys';

export function LivePreview({ isEnabled }: { isEnabled: boolean }) {
  useEffect(() => {
    if (isEnabled) {
      ContentstackLivePreview.init({
        ssr: true,
        enable: true,
        mode: 'builder',
        stackDetails: {
          apiKey: keys().NEXT_PUBLIC_CONTENTSTACK_API_KEY,
          environment: keys().NEXT_PUBLIC_CONTENTSTACK_ENVIRONMENT,
        },
        editButton: {
          enable: true,
          exclude: ['outsideLivePreviewPortal'],
        },
      });
    }
  }, [isEnabled]);

  return null;
}
