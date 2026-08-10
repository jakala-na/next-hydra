import type { CanvasComponentTreeElement } from "@drupal-canvas/headless";
import { CanvasComponentTree as ReactCanvasComponentTree } from "@drupal-canvas/headless-react";
import canvasComponents from "../.canvas/components";

type CanvasComponentTreeProps = {
  tree: CanvasComponentTreeElement | null;
};

/**
 * Resolves the generated Canvas registry in the Server Component graph.
 * Individual registry entries can still opt into a client boundary.
 */
export function CanvasComponentTree({ tree }: CanvasComponentTreeProps) {
  return <ReactCanvasComponentTree components={canvasComponents} tree={tree} />;
}
