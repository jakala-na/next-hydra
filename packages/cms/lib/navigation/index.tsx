import {
  unstable_cacheLife as cacheLife,
  unstable_cacheTag as cacheTag,
} from "next/cache";
import { TAGS } from "../../constants";
import type { NavigationItem } from "../../types";

export async function getNavigation(
  locale: string,
  livePreviewHash?: string
): Promise<NavigationItem[]> {
  "use cache";
  cacheTag(TAGS.menu);
  cacheLife("days");

  return (
    []
  );
}
