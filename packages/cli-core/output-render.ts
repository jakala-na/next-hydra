import { stripVTControlCharacters, styleText } from "node:util";

import type { CommandReport, ProgressStep } from "./output-model";

export interface OutputStyle {
  readonly color: boolean;
  readonly width: number;
}

function paint(
  format: Parameters<typeof styleText>[0],
  text: string,
  style: OutputStyle
): string {
  return style.color
    ? styleText(format, text, { validateStream: false })
    : text;
}

function wrap(text: string, prefix: string, style: OutputStyle): string {
  const width = Math.max(20, style.width - prefix.length);
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
      (value, index) =>
        (index === 0 ? prefix : " ".repeat(prefix.length)) + value
    )
    .join("\n");
}

export function renderIntro(
  title: string,
  context: string,
  style: OutputStyle
): string {
  return `\n${paint("bold", title, style)}\n${paint("dim", wrap(context, "  ", style), style)}\n`;
}

export function renderPhase(
  step: ProgressStep,
  status: "working" | "done" | "failed" | "cancelled",
  style: OutputStyle
): string {
  const labels = {
    working: "WORKING",
    done: "OK",
    failed: "FAIL",
    cancelled: "CANCELLED",
  };
  const colors = {
    working: "cyan",
    done: "green",
    failed: "red",
    cancelled: "yellow",
  } as const;
  // Wrap before styling so escape sequences never count toward line width.
  const text = wrap(
    `${step.group} · ${step.title}`,
    `  ${labels[status]}  `,
    style
  );
  return text.replace(
    labels[status],
    paint(colors[status], labels[status], style)
  );
}

export function renderReport(
  report: CommandReport,
  outerStyle: OutputStyle
): string {
  const style = report.title
    ? { ...outerStyle, width: outerStyle.width - 4 }
    : outerStyle;
  const labels = {
    ready: "READY",
    "action-required": "ACTION REQUIRED",
    plan: "DRY RUN",
  };
  const colors = {
    ready: "green",
    "action-required": "yellow",
    plan: "cyan",
  } as const;
  const lines = [
    "",
    paint([colors[report.outcome], "bold"], labels[report.outcome], style),
    wrap(report.summary, "  ", style),
  ];
  for (const section of report.sections) {
    lines.push("", paint("bold", section.title, style));
    for (const fact of section.facts) {
      lines.push(wrap(`${fact.label}: ${fact.value}`, "  ", style));
    }
  }
  if (report.tasks.length) {
    lines.push("", paint("bold", "Your next steps", style));
    for (const [index, task] of report.tasks.entries()) {
      lines.push(
        "",
        paint("bold", wrap(task.title, `  ${index + 1}. `, style), style),
        paint("cyan", wrap(`Where: ${task.where}`, "     ", style), style),
        wrap(task.detail, "     ", style)
      );
      // Keep authored shell commands intact, independently from prose wrapping.
      for (const command of task.commands ?? []) {
        lines.push(
          "",
          `     ${paint(["cyan", "bold"], `$ ${command}`, style)}`
        );
      }
      if (task.verify) {
        lines.push(wrap(`Verify: ${task.verify}`, "     ", style));
      }
    }
  }
  for (const note of report.notes ?? []) {
    lines.push("", paint("dim", wrap(note, "  ", style), style));
  }
  if (!report.title) {
    return `${lines.join("\n")}\n`;
  }
  const framedLines = lines.flatMap((line) => line.split("\n"));
  const width = Math.max(
    outerStyle.width,
    report.title.length + 5,
    ...framedLines.map((line) => stripVTControlCharacters(line).length + 4)
  );
  const border = (text: string) => paint("cyan", text, outerStyle);
  return [
    "",
    border(
      `┌─ ${report.title} ${"─".repeat(width - report.title.length - 5)}┐`
    ),
    ...framedLines.map(
      (line) =>
        paint("dim", "│ ", outerStyle) +
        line +
        " ".repeat(width - 4 - stripVTControlCharacters(line).length) +
        paint("dim", " │", outerStyle)
    ),
    border(`└${"─".repeat(width - 2)}┘`),
    "",
  ].join("\n");
}
