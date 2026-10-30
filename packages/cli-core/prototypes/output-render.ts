// THROWAWAY: three terminal layouts; no public API or production integration.
import { stripVTControlCharacters, styleText } from "node:util";

import type { Scenario } from "./output-fixtures.ts";

export const variantNames = ["journal", "receipt", "guided"] as const;
export type Variant = (typeof variantNames)[number];
export interface Style {
  readonly color: boolean;
  readonly width: number;
}
export const createTheme = (style: Style) => {
  const paint = (format: Parameters<typeof styleText>[0]) => (text: string) =>
    style.color ? styleText(format, text, { validateStream: false }) : text;
  return {
    command: paint(["cyan", "bold"]),
    context: paint("dim"),
    error: paint(["red", "bold"]),
    heading: paint("bold"),
    info: paint(["cyan", "bold"]),
    location: paint("cyan"),
    ready: paint(["green", "bold"]),
    success: paint("green"),
    warning: paint(["yellow", "bold"]),
  };
};
const bold = (text: string, style: Style) => createTheme(style).heading(text);
const dim = (text: string, style: Style) => createTheme(style).context(text);
const cyan = (text: string, style: Style) => createTheme(style).location(text);

// Wrap prose only. Commands stay intact so they remain safe to copy.
export const wrap = (text: string, prefix: string, style: Style) => {
  const prefixWidth = stripVTControlCharacters(prefix).length;
  const width = Math.max(20, style.width - prefixWidth);
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/u)) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line += (line ? " " : "") + word;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines
    .map(
      (value, index) => (index === 0 ? prefix : " ".repeat(prefixWidth)) + value
    )
    .join("\n");
};

export const intro = (scenario: Scenario, variant: Variant, style: Style) => {
  const label = { journal: "RUN", receipt: "TASK", guided: "SETUP" }[variant];
  return `\n${bold(`${label}  ${scenario.title}`, style)}\n${dim(wrap(scenario.context, "     ", style), style)}\n${dim("     Simulated output · no external changes", style)}\n\n`;
};

export const phase = (
  text: string,
  index: number,
  total: number,
  failed: boolean,
  variant: Variant,
  style: Style
) => {
  const theme = createTheme(style);
  const status = failed ? theme.error("FAIL") : theme.success("OK");
  const prefix = {
    journal: `  ${index + 1}/${total} ${status}  `,
    guided: `  [${failed ? "!" : "x"}] `,
    receipt: `  ${status}  `,
  }[variant];
  return `${wrap(text, prefix, style)}\n`;
};

export const result = (scenario: Scenario, variant: Variant, style: Style) => {
  const state = {
    action: "ACTION REQUIRED",
    failed: "STOPPED",
    plan: "DRY RUN",
    ready: "READY",
  }[scenario.outcome];
  const theme = createTheme(style);
  const heading = {
    failed: theme.error,
    ready: theme.ready,
    plan: theme.info,
    action: theme.warning,
  }[scenario.outcome](state);
  const facts = scenario.facts.map(
    ([label, value]) => `${bold(label, style)}: ${value}`
  );
  const actions = scenario.actions.map((action, index) => {
    const prefix =
      variant === "guided" ? `  [ ] ${index + 1}. ` : `  ${index + 1}. `;
    return [
      bold(wrap(action.title, prefix, style), style),
      cyan(wrap(`Where: ${action.where}`, "     ", style), style),
      wrap(action.detail, "     ", style),
      ...(action.command
        ? ["", `     ${cyan("$", style)} ${bold(action.command, style)}`]
        : []),
    ].join("\n");
  });
  if (variant === "receipt") {
    return [
      "",
      `${heading} · ${scenario.title}`,
      wrap(scenario.summary, "", style),
      "",
      bold("Receipt", style),
      ...facts.map((text) => `  ${text}`),
      "",
      bold("Next actions", style),
      actions.join("\n\n"),
      "",
      ...(scenario.note ? [dim(wrap(scenario.note, "", style), style)] : []),
      "",
    ].join("\n");
  }
  if (variant === "guided") {
    return [
      "",
      heading,
      wrap(scenario.summary, "  ", style),
      "",
      bold("Continue here", style),
      actions.join("\n\n"),
      "",
      bold("Automation receipt", style),
      ...facts.map((text) => `  ${text}`),
      "",
      ...(scenario.note ? [dim(wrap(scenario.note, "  ", style), style)] : []),
      "",
    ].join("\n");
  }
  return [
    "",
    heading,
    wrap(scenario.summary, "  ", style),
    "",
    bold("Result", style),
    ...facts.map((text) => `  ${text}`),
    "",
    bold("Your next steps", style),
    actions.join("\n\n"),
    "",
    ...(scenario.note ? [dim(wrap(scenario.note, "  ", style), style)] : []),
    "",
  ].join("\n");
};

export const transcript = (
  scenario: Scenario,
  variant: Variant,
  style: Style
) =>
  intro(scenario, variant, style) +
  scenario.phases
    .map((text, i) =>
      phase(
        text,
        i,
        scenario.phases.length,
        scenario.outcome === "failed" && i === scenario.phases.length - 1,
        variant,
        style
      )
    )
    .join("") +
  result(scenario, variant, style);
