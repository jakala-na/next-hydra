"use client";

import posthog, { type PostHog } from "posthog-js";
import { PostHogProvider as PostHogProviderRaw } from "posthog-js/react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { keys } from "../keys";

type PostHogProviderProps = {
  readonly children: ReactNode;
};

export const PostHogProvider = (
  properties: Omit<PostHogProviderProps, "client">
) => {
  useEffect(() => {
    const { NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_POSTHOG_HOST } = keys();
    if (!NEXT_PUBLIC_POSTHOG_KEY) {
      return;
    }
    posthog.init(NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: "/ingest",
      ...(NEXT_PUBLIC_POSTHOG_HOST !== undefined
        ? { ui_host: NEXT_PUBLIC_POSTHOG_HOST }
        : {}),
      person_profiles: "identified_only",
      capture_pageview: false, // Disable automatic pageview capture, as we capture manually
      capture_pageleave: true, // Overrides the `capture_pageview` setting
    }) as PostHog;
  }, []);

  return <PostHogProviderRaw client={posthog} {...properties} />;
};

export { usePostHog as useAnalytics } from "posthog-js/react";
