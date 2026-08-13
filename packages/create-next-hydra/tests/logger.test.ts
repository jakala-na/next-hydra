import { describe, expect, it } from "vitest";

import {
  type InstructionSection,
  renderInstructions,
} from "../src/instruction-renderer.js";

const sections = [
  {
    entries: [{ kind: "text", text: "Alpha beta gamma delta epsilon" }],
    title: "Provider setup",
  },
  {
    entries: [{ command: "pnpm dev", kind: "command" }],
    title: "Next steps",
  },
] satisfies InstructionSection[];
const NARROW_TERMINAL_COLUMNS = 20;

describe("instruction rendering", () => {
  it("renders an unboxed, width-aware TTY flow", () => {
    expect(renderInstructions(sections, { columns: 24, isTTY: true })).toBe(
      [
        "│",
        "◇  Provider setup",
        "│",
        "│  1. Alpha beta gamma",
        "│     delta epsilon",
        "│",
        "◇  Next steps",
        "│",
        "│  $ pnpm dev",
        "",
      ].join("\n")
    );
  });

  it("renders deterministic ASCII output outside a TTY", () => {
    expect(renderInstructions(sections, { columns: 24, isTTY: false })).toBe(
      [
        "Provider setup",
        "",
        "1. Alpha beta gamma delta epsilon",
        "",
        "Next steps",
        "",
        "$ pnpm dev",
        "",
      ].join("\n")
    );
  });

  it("splits long prose tokens instead of overflowing the terminal", () => {
    const output = renderInstructions(
      [
        {
          entries: [{ kind: "text", text: "abcdefghijklmnopqrstuvwxyz" }],
          title: "Setup",
        },
      ],
      { columns: NARROW_TERMINAL_COLUMNS, isTTY: true }
    );

    expect(
      output
        .trimEnd()
        .split("\n")
        .every((line) => [...line].length <= NARROW_TERMINAL_COLUMNS)
    ).toBe(true);
  });
});
