import { log, outro, spinner } from "@clack/prompts";

import { renderInstructions } from "./instruction-renderer.js";
import type { InstructionSection } from "./instruction-renderer.js";

export function info(message: string): void {
  log.info(message);
}

export function warn(message: string): void {
  log.warn(message);
}

export function success(message: string): void {
  log.success(message);
}

export function printInstructions(
  sections: readonly InstructionSection[]
): void {
  process.stdout.write(
    renderInstructions(sections, {
      columns: process.stdout.columns,
      isTTY: process.stdout.isTTY,
    })
  );
}

export function finish(message: string): void {
  outro(message);
}

export function createSpinner() {
  return spinner();
}

export function formatCommand(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}
