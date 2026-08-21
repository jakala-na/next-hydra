import type { CanvasComponentTreeElement } from "@drupal-canvas/headless";
import { CanvasComponentTree as ReactCanvasComponentTree } from "@drupal-canvas/headless-react";
import type { CanvasComponentRegistry } from "@drupal-canvas/headless-react";

import generatedCanvasComponents from "../.canvas/components";
import CanvasArticleCardNextAdapter from "../canvas-components/article-card/next";

const canvasComponents = {
  ...generatedCanvasComponents,
  "article-card": CanvasArticleCardNextAdapter,
} satisfies CanvasComponentRegistry;

type CanvasComponentTreeProps = {
  regionId?: string;
  tree: CanvasComponentTreeElement | null;
};

/**
 * Resolves the generated Canvas registry in the Server Component graph.
 * Individual registry entries can still opt into a client boundary.
 */
export const CanvasComponentTree = ({
  regionId,
  tree,
}: CanvasComponentTreeProps) => {
  const props = { components: canvasComponents, regionId, tree };
  return <ReactCanvasComponentTree {...props} />;
};
