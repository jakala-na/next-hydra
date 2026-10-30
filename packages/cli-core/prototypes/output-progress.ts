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
    text: text.slice(0, Math.max(20, style.width - 14)),
    prefixText: `  ${index + 1}/${total}`,
    spinner: "dots",
    color: style.color ? "cyan" : false,
    stream: process.stdout,
    discardStdin: false,
  });
