import { Announcement as AnnouncementView } from "@repo/design-system/components/cms/announcement";
import type { Locale } from "@repo/i18n";
import { gql } from "@urql/core";
import { cacheLife, cacheTag } from "next/cache";
import { draftMode, headers } from "next/headers";

import { graphqlClient } from "../client";
import { transformLocale } from "../lib/utils/transform-locale";

type AnnouncementQuery = {
  all_announcement?: {
    items?:
      | {
          enabled?: boolean | null;
          message?: string | null;
          link_label?: string | null;
          link_url?: string | null;
        }[]
      | null;
  } | null;
};

const announcementQuery = gql`
  query SiteAnnouncement($locale: String!) {
    all_announcement(locale: $locale, fallback_locale: true, limit: 1) {
      items {
        enabled
        message
        link_label
        link_url
      }
    }
  }
`;

async function loadAnnouncement(locale: Locale, livePreviewHash?: string) {
  const result = await graphqlClient(livePreviewHash).query<AnnouncementQuery>(
    announcementQuery,
    { locale: transformLocale(locale) }
  );
  if (result.error) {
    throw result.error;
  }
  return result.data?.all_announcement?.items?.[0];
}

async function getCachedAnnouncement(locale: Locale) {
  "use cache";
  cacheTag("announcement");
  cacheLife("hours");
  return await loadAnnouncement(locale);
}

export async function SiteAnnouncement({ locale }: { locale: Locale }) {
  const { isEnabled: preview } = await draftMode();
  const requestHeaders = preview ? await headers() : undefined;
  const announcement = preview
    ? await loadAnnouncement(
        locale,
        requestHeaders?.get("x-live-preview") ?? ""
      )
    : await getCachedAnnouncement(locale);

  if (
    !announcement?.enabled ||
    !announcement.message ||
    !announcement.link_label ||
    !announcement.link_url
  ) {
    return null;
  }

  return (
    <AnnouncementView
      message={announcement.message}
      linkLabel={announcement.link_label}
      linkUrl={announcement.link_url}
    />
  );
}
