import { styleText } from "node:util";

import { Console, Effect, Schema, Stdio, Terminal } from "effect";

import type { RegistryInstruction } from "./model.ts";

/** Package-authored terminal guidance. This describes work; it never executes it. */
export const SetupInstructions = Schema.Struct({
  group: Schema.NonEmptyString,
  title: Schema.NonEmptyString,
  order: Schema.Finite,
  optional: Schema.optionalKey(Schema.Boolean),
  steps: Schema.Array(
    Schema.Struct({
      id: Schema.NonEmptyString,
      title: Schema.NonEmptyString,
      order: Schema.Finite,
      optional: Schema.optionalKey(Schema.Boolean),
      detail: Schema.optionalKey(Schema.NonEmptyString),
      commands: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)),
    })
  ),
});
export type SetupInstructions = typeof SetupInstructions.Type;

export function groupSetupInstructions(
  instructions: readonly RegistryInstruction[]
): readonly SetupInstructions[] {
  const groups = new Map<string, SetupInstructions>();
  for (const instruction of instructions) {
    const authored =
      "setup" in instruction
        ? instruction.setup
        : {
            group: instruction.item,
            title: instruction.item,
            order: 100,
            steps: [
              {
                id: instruction.item,
                title: "Setup notes",
                order: 0,
                detail: instruction.text,
              },
            ],
          };
    // Preserve an optional recipe's intent when it joins a required package group.
    const contribution: SetupInstructions = {
      ...authored,
      steps: authored.steps.map((step) =>
        authored.optional ? { ...step, optional: true } : step
      ),
    };
    const existing = groups.get(contribution.group);
    groups.set(
      contribution.group,
      existing
        ? {
            ...existing,
            order: Math.min(existing.order, contribution.order),
            optional:
              existing.optional === true && contribution.optional === true,
            steps: [...existing.steps, ...contribution.steps],
          }
        : contribution
    );
  }
  return [...groups.values()]
    .sort(
      (a, b) =>
        Number(a.optional === true) - Number(b.optional === true) ||
        a.order - b.order ||
        a.group.localeCompare(b.group)
    )
    .map((group) => ({
      ...group,
      steps: [...group.steps].sort(
        (a, b) =>
          Number(a.optional === true) - Number(b.optional === true) ||
          a.order - b.order ||
          a.id.localeCompare(b.id)
      ),
    }));
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  // Preserve authored paragraph boundaries, including legacy third-party docs.
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
      if (line && line.length + 1 + word.length > width) {
        lines.push(line);
        line = word;
      } else line += (line ? " " : "") + word;
    }
    lines.push(line);
  }
  return lines;
}

export function renderSetupInstructions(
  instructions: readonly RegistryInstruction[],
  style: { readonly color: boolean; readonly width: number }
): string {
  const paint = (format: Parameters<typeof styleText>[0], text: string) =>
    style.color ? styleText(format, text, { validateStream: false }) : text;
  const groups = groupSetupInstructions(instructions);
  if (!groups.length) return "";
  const lines = [
    "",
    paint("bold", "Set up your application"),
    "  Run these steps from the project directory. Replace <placeholders>.",
  ];
  for (const group of groups) {
    const title = `${group.title}${group.optional ? " · Optional" : ""}`;
    const accent = group.optional ? "yellow" : "cyan";
    const commandLines = group.steps.flatMap((step) =>
      (step.commands ?? []).flatMap((command) => command.split("\n"))
    );
    // Commands stay intact. An unusually long authored command may exceed a narrow terminal.
    const width = Math.max(
      36,
      Math.min(style.width, 96),
      title.length + 8,
      ...commandLines.map((line) => line.length + 9)
    );
    const inner = width - 4;
    const frame = (text: string, format?: Parameters<typeof styleText>[0]) =>
      paint(group.optional ? ["yellow", "dim"] : "dim", "│ ") +
      (format ? paint(format, text) : text) +
      " ".repeat(Math.max(0, inner - text.length)) +
      paint(group.optional ? ["yellow", "dim"] : "dim", " │");
    lines.push(
      "",
      paint(accent, `┌─ ${title} ${"─".repeat(width - title.length - 5)}┐`),
      frame("")
    );
    group.steps.forEach((step, index) => {
      if (index) lines.push(frame(""));
      const optional = group.optional || step.optional;
      const label = `${index + 1}. ${step.title}${step.optional && !group.optional ? " · Optional" : ""}`;
      wrap(label, inner).forEach((line) =>
        lines.push(frame(line, optional ? ["yellow", "bold"] : "bold"))
      );
      if (step.detail)
        wrap(step.detail, inner - 3).forEach((line) =>
          lines.push(frame(`   ${line}`))
        );
      for (const command of step.commands ?? []) {
        lines.push(frame(""));
        command
          .split("\n")
          .forEach((line, lineIndex) =>
            lines.push(
              frame(
                `   ${lineIndex ? "  " : "$ "}${line}`,
                optional ? "yellow" : "cyan"
              )
            )
          );
      }
    });
    lines.push(frame(""), paint(accent, `└${"─".repeat(width - 2)}┘`));
  }
  return lines.join("\n") + "\n";
}

export const printSetupInstructions = (
  instructions: readonly RegistryInstruction[],
  summary?: string
) =>
  Effect.gen(function* () {
    if (!instructions.length) {
      if (summary) yield* Console.log(summary);
      return;
    }
    const stdio = yield* Stdio.Stdio;
    const terminal = yield* Terminal.Terminal;
    const tty = yield* stdio.stdoutIsTerminal;
    const columns = yield* terminal.columns;
    yield* Console.log(
      (summary ? `${summary}\n` : "") +
        renderSetupInstructions(instructions, {
          color: tty && !process.env.NO_COLOR && process.env.TERM !== "dumb",
          width: columns || 88,
        })
    );
  });
