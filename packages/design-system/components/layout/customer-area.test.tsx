/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-argument -- This test recursively inspects trusted React elements returned by the component, following the design-system's existing structural test pattern. */
import { isValidElement } from "react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { CustomerArea } from "./customer-area";

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

const containsProps = (
  node: ReactNode,
  props: Readonly<Record<string, unknown>>
): boolean => {
  if (Array.isArray(node)) {
    return node.some((child) => containsProps(child, props));
  }
  if (!isValidElement<{ readonly children?: ReactNode }>(node)) {
    return false;
  }
  if (
    Object.entries(props).every(
      ([property, value]) =>
        (node.props as Readonly<Record<string, unknown>>)[property] === value
    )
  ) {
    return true;
  }
  return containsProps(node.props.children, props);
};

describe(CustomerArea, () => {
  it("renders the active task and marks future tasks as unavailable", () => {
    const area = CustomerArea({
      children: <p>Account management</p>,
      companyLabel: "Hydra Brewery",
      description: "Manage your company.",
      navigation: [
        { current: true, href: "/en-US/account", label: "Users" },
        { label: "Orders", statusLabel: "Coming soon" },
      ],
      title: "Customer area",
    });

    expect(
      containsProps(area, {
        "aria-current": "page",
        href: "/en-US/account",
      })
    ).toBeTruthy();
    expect(containsProps(area, { "aria-disabled": "true" })).toBeTruthy();
    expect(containsText(area, "Hydra Brewery")).toBeTruthy();
    expect(containsText(area, "Account management")).toBeTruthy();
  });
});
