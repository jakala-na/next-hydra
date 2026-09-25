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
  components?: CanvasComponentRegistry;
  tree: CanvasComponentTreeElement | null;
};

/**
 * Resolves the generated Canvas registry in the Server Component graph.
 * Individual registry entries can still opt into a client boundary.
 */
export const CanvasComponentTree = ({
  components,
  tree,
}: CanvasComponentTreeProps) => {
  const props = { components: { ...canvasComponents, ...components }, tree };
  return <ReactCanvasComponentTree {...props} />;
};
