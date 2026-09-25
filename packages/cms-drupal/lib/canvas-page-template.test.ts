import type { CanvasComponentTreeElement } from "@drupal-canvas/headless";
import { describe, expect, it } from "vitest";

import {
  findPageShell,
  getPageContent,
  withApplicationContent,
} from "./canvas-page-template";

const shell: CanvasComponentTreeElement = {
  element: "js-site-shell",
  props: { canvasUuid: "shell-uuid" },
  slots: {
    content: { element: "js-hero", props: { title: "CMS page" } },
    postFooter: { element: "js-text", props: { text: "Shared footer" } },
    preHeader: { element: "js-text", props: { text: "Shared announcement" } },
  },
};

describe("native Canvas page templates", () => {
  it("finds the shell through nested structural groups", () => {
    expect(
      findPageShell({
        element: "renderless-container",
        slots: { default: [["", shell]] },
      })
    ).toBe(shell);
    expect(findPageShell(null)).toBeUndefined();
  });

  it("keeps global content and component identities when inserting an application route", () => {
    const result = withApplicationContent(shell);
    expect(result.props).toEqual(shell.props);
    expect(result.slots?.preHeader).toEqual(shell.slots?.preHeader);
    expect(result.slots?.postFooter).toEqual(shell.slots?.postFooter);
    expect(result.slots?.content).toEqual({
      element: "js-application-content",
    });
    expect(shell.slots?.content).toEqual({
      element: "js-hero",
      props: { title: "CMS page" },
    });
  });

  it("retains a single native content boundary inside draft chrome", () => {
    const tree: CanvasComponentTreeElement = {
      canvasDraftMode: true,
      element: "renderless-container",
      slots: { default: shell },
    };
    const result = withApplicationContent(tree);
    expect(result.canvasDraftMode).toBeTruthy();
    expect(findPageShell(result)?.slots?.content).toEqual({
      element: "canvas-preview-content-region",
      slots: { default: { element: "js-application-content" } },
    });
  });

  it("keeps routed content and its native preview boundary separate from shared chrome", () => {
    const content = {
      element: "canvas-preview-content-region",
      slots: { default: { element: "js-hero" } },
    };
    const page = {
      ...shell,
      canvasDraftMode: true as const,
      slots: { ...shell.slots, content },
    };
    const result = getPageContent(page);
    expect(result?.canvasDraftMode).toBeTruthy();
    expect(result?.slots).toEqual({ default: content });
    expect(JSON.stringify(result)).not.toContain("Shared announcement");
  });
});
