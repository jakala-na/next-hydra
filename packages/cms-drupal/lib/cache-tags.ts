const DRUPAL_NODE_ID_PATTERN = /^\d+$/;

export function getLandingPageCacheTag(page: { id: string }): string {
  if (!DRUPAL_NODE_ID_PATTERN.test(page.id)) {
    throw new Error(`Expected a numeric Drupal node ID, received ${page.id}`);
  }

  return `node:${page.id}`;
}
