// THROWAWAY: shared Ora configuration for the terminal and browser snapshots.
import ora from "ora";

import type { Style } from "./output-render.ts";

export const progress = (
  text: string,
  index: number,
  total: number,
  style: Style
) =>
  ora({
    color: style.color ? "cyan" : false,
    discardStdin: false,
    prefixText: `  ${index + 1}/${total}`,
    spinner: "dots",
    stream: process.stdout,
    text: text.slice(0, Math.max(20, style.width - 14)),
  });
