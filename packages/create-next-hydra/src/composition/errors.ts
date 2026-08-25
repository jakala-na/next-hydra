export class CompositionValidationError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[], options?: ErrorOptions) {
    super(
      `${message}\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
      options
    );
    this.name = "CompositionValidationError";
    this.issues = issues;
  }
}
