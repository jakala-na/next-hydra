import type { CanvasComponentTreeElement } from "@drupal-canvas/headless";
import { CanvasComponentTree as ReactCanvasComponentTree } from "@drupal-canvas/headless-react";
import canvasComponents from "../.canvas/components";

type CanvasComponentTreeProps = {
  regionId?: string;
  tree: CanvasComponentTreeElement | null;
};

/**
 * Resolves the generated Canvas registry in the Server Component graph.
 * Individual registry entries can still opt into a client boundary.
 */
export function CanvasComponentTree({
  regionId,
  tree,
}: CanvasComponentTreeProps) {
  return (
    <ReactCanvasComponentTree
      components={canvasComponents}
      regionId={regionId}
      tree={tree}
    />
  );
}
