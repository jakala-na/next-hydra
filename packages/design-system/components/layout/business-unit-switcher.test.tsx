import { isValidElement } from "react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { BusinessUnitSwitcher } from "./business-unit-switcher";

const containsText = (node: ReactNode, text: string): boolean => {
  if (typeof node === "string") {
    return node === text;
  }

  if (Array.isArray(node)) {
    return node.some((child) => containsText(child, text));
  }

  return isValidElement<{ readonly children?: ReactNode }>(node)
    ? containsText(node.props.children, text)
    : false;
};

describe(BusinessUnitSwitcher, () => {
  it("shows the current Business Unit when it is the only available membership", () => {
    const switcher = BusinessUnitSwitcher({
      currentBusinessUnitId: "business-unit-1",
      items: [{ id: "business-unit-1", label: "Hydra Supply" }],
    });

    expect(switcher).not.toBeNull();
    expect(switcher).toMatchObject({
      props: { title: "Operating as Hydra Supply" },
      type: "div",
    });
    expect(containsText(switcher, "Operating as ")).toBeTruthy();
    expect(containsText(switcher, "Hydra Supply")).toBeTruthy();
  });
});
