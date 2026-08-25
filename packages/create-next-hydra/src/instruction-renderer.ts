import { stripVTControlCharacters } from "node:util";

const DEFAULT_INSTRUCTION_COLUMNS = 80;
const MAX_INSTRUCTION_COLUMNS = 100;
const MIN_INSTRUCTION_COLUMNS = 12;
const PLAIN_INSTRUCTION_COLUMNS = 100;

export type InstructionEntry =
  | { kind: "text"; text: string }
  | { kind: "command"; command: string };

export type InstructionSection = {
  title: string;
  entries: readonly InstructionEntry[];
};

export type InstructionOutput = {
  columns?: number;
  isTTY: boolean;
};

function printableText(value: string): string {
  return stripVTControlCharacters(value).replaceAll(/\s+/g, " ").trim();
}

function printableWidth(value: string): number {
  return [...stripVTControlCharacters(value)].length;
}

function splitAtWidth(value: string, width: number): [string, string] {
  const characters = [...value];
  return [
    characters.slice(0, width).join(""),
    characters.slice(width).join(""),
  ];
}

function wrapText(value: string, width: number): string[] {
  const normalized = printableText(value);
  if (!normalized) {
    return [];
  }

  const lines: string[] = [];
  let currentLine = "";

  for (const inputWord of normalized.split(" ")) {
    let word = inputWord;
    while (printableWidth(word) > width) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }
      const [chunk, remainder] = splitAtWidth(word, width);
      lines.push(chunk);
      word = remainder;
    }

    if (!word) {
      continue;
    }
    if (!currentLine) {
      currentLine = word;
      continue;
    }
    if (printableWidth(`${currentLine} ${word}`) <= width) {
      currentLine += ` ${word}`;
      continue;
    }
    lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

function instructionColumns(output: InstructionOutput): number {
  if (!output.isTTY) {
    return PLAIN_INSTRUCTION_COLUMNS;
  }
  const columns = Number.isFinite(output.columns)
    ? Math.floor(output.columns ?? DEFAULT_INSTRUCTION_COLUMNS)
    : DEFAULT_INSTRUCTION_COLUMNS;
  return Math.max(
    MIN_INSTRUCTION_COLUMNS,
    Math.min(columns, MAX_INSTRUCTION_COLUMNS)
  );
}

function shouldSeparateEntries(
  previous: InstructionEntry | undefined,
  current: InstructionEntry
): boolean {
  return Boolean(
    previous && !(previous.kind === "command" && current.kind === "command")
  );
}

function renderTtyInstructions(
  sections: readonly InstructionSection[],
  columns: number
): string {
  const lines = ["│"];

  for (const [sectionIndex, section] of sections.entries()) {
    if (sectionIndex > 0) {
      lines.push("│");
    }
    lines.push(`◇  ${printableText(section.title)}`, "│");

    let instructionNumber = 0;
    for (const [entryIndex, entry] of section.entries.entries()) {
      if (shouldSeparateEntries(section.entries[entryIndex - 1], entry)) {
        lines.push("│");
      }
      if (entry.kind === "command") {
        lines.push(`│  $ ${printableText(entry.command)}`);
        continue;
      }

      instructionNumber += 1;
      const marker = `${instructionNumber}. `;
      const firstPrefix = `│  ${marker}`;
      const continuationPrefix = `│  ${" ".repeat(marker.length)}`;
      const textWidth = Math.max(1, columns - printableWidth(firstPrefix));
      const wrapped = wrapText(entry.text, textWidth);
      for (const [lineIndex, line] of wrapped.entries()) {
        lines.push(
          `${lineIndex === 0 ? firstPrefix : continuationPrefix}${line}`
        );
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

function renderPlainInstructions(
  sections: readonly InstructionSection[],
  columns: number
): string {
  const lines: string[] = [];

  for (const [sectionIndex, section] of sections.entries()) {
    if (sectionIndex > 0) {
      lines.push("");
    }
    lines.push(printableText(section.title), "");

    let instructionNumber = 0;
    for (const [entryIndex, entry] of section.entries.entries()) {
      if (shouldSeparateEntries(section.entries[entryIndex - 1], entry)) {
        lines.push("");
      }
      if (entry.kind === "command") {
        lines.push(`$ ${printableText(entry.command)}`);
        continue;
      }

      instructionNumber += 1;
      const marker = `${instructionNumber}. `;
      const continuationPrefix = " ".repeat(marker.length);
      const wrapped = wrapText(entry.text, columns - marker.length);
      for (const [lineIndex, line] of wrapped.entries()) {
        lines.push(`${lineIndex === 0 ? marker : continuationPrefix}${line}`);
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

export function renderInstructions(
  sections: readonly InstructionSection[],
  output: InstructionOutput
): string {
  if (sections.length === 0) {
    return "";
  }
  const columns = instructionColumns(output);
  return output.isTTY
    ? renderTtyInstructions(sections, columns)
    : renderPlainInstructions(sections, columns);
}
