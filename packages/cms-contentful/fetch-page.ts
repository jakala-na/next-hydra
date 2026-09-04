import { queryContentful } from "./client";
import {
  CONTENTFUL_PAGE_QUERY,
  contentfulPageFrom,
  normalizeContentfulSlug,
} from "./content";
import type { ContentfulPage, ContentfulPageQueryResult } from "./content";

export async function fetchContentfulPage(
  path: string,
  locale: string,
  preview: boolean
): Promise<ContentfulPage | undefined> {
  const result = await queryContentful<ContentfulPageQueryResult>(
    CONTENTFUL_PAGE_QUERY,
    {
      locale,
      preview,
      slug: normalizeContentfulSlug(path),
    },
    preview
  );

  return contentfulPageFrom(result);
}
