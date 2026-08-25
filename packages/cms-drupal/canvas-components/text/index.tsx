"use client";

import type { CanvasComponentProps } from "../../generated/canvas-component-props";

export default function CanvasText({ text }: CanvasComponentProps<"text">) {
  return <p>{text}</p>;
}
