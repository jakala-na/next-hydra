export class CompositionValidationError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[]) {
    super(`${message}\n${issues.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "CompositionValidationError";
    this.issues = issues;
  }
}
