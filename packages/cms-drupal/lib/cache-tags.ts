const DRUPAL_NODE_ID_PATTERN = /^\d+$/;

export function getNodeCacheTag(node: { id: string }): string {
  if (!DRUPAL_NODE_ID_PATTERN.test(node.id)) {
    throw new Error(`Expected a numeric Drupal node ID, received ${node.id}`);
  }

  return `node:${node.id}`;
}
