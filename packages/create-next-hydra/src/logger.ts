import { log, note, outro, spinner } from "@clack/prompts";

export function info(message: string): void {
  log.info(message);
}

export function warn(message: string): void {
  log.warn(message);
}

export function success(message: string): void {
  log.success(message);
}

export function printNextSteps(message: string, title = "Next steps"): void {
  note(message, title);
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
