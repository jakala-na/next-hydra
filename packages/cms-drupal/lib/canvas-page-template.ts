import { normalizeCanvasComponentTreeSlot } from "@drupal-canvas/headless";
import type { CanvasComponentTreeElement } from "@drupal-canvas/headless";

const SHELL_ELEMENT = "js-site-shell";
const CONTENT_REGION = "canvas-preview-content-region";

/** Find the native template shell without depending on Drupal's structural wrappers. */
export function findPageShell(
  tree: CanvasComponentTreeElement | null
): CanvasComponentTreeElement | undefined {
  if (!tree) {
    return;
  }
  if (tree.element === SHELL_ELEMENT) {
    return tree;
  }
  for (const slot of Object.values(tree.slots ?? {})) {
    for (const child of normalizeCanvasComponentTreeSlot(slot)) {
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The SDK normalizer returns a closed string-or-element union; only elements contain child slots.
      if (typeof child !== "string") {
        const shell = findPageShell(child);
        if (shell) {
          return shell;
        }
      }
    }
  }
}

/** Retain native editor boundaries while substituting the Next.js route outlet. */
export function withApplicationContent(
  tree: CanvasComponentTreeElement
): CanvasComponentTreeElement {
  const outlet: CanvasComponentTreeElement = {
    element: "js-application-content",
  };
  function visit(node: CanvasComponentTreeElement): CanvasComponentTreeElement {
    if (node.element === SHELL_ELEMENT) {
      return {
        ...node,
        slots: {
          ...node.slots,
          content: tree.canvasDraftMode
            ? { element: CONTENT_REGION, slots: { default: outlet } }
            : outlet,
        },
      };
    }
    return {
      ...node,
      slots: Object.fromEntries(
        Object.entries(node.slots ?? {}).map(([name, slot]) => [
          name,
          normalizeCanvasComponentTreeSlot(slot).map((child) =>
            // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Preserve text leaves from the SDK's normalized string-or-element union.
            typeof child === "string" ? child : visit(child)
          ),
        ])
      ),
    };
  }
  return visit(tree);
}

/** Extract routed content, retaining upstream draft boundaries and component IDs. */
export function getPageContent(
  tree: CanvasComponentTreeElement | null
): CanvasComponentTreeElement | null {
  const shell = findPageShell(tree);
  if (!shell) {
    return tree;
  }
  return {
    canvasDraftMode: tree?.canvasDraftMode,
    element: "renderless-container",
    slots: { default: shell.slots?.content ?? [] },
  };
}
