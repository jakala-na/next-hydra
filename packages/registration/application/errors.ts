export class RegistrationNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistrationNotFoundError";
  }

  static [Symbol.hasInstance](instance: unknown) {
    return (
      instance instanceof Error && instance.name === "RegistrationNotFoundError"
    );
  }
}

export class RegistrationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistrationConflictError";
  }

  static [Symbol.hasInstance](instance: unknown) {
    return (
      instance instanceof Error && instance.name === "RegistrationConflictError"
    );
  }
}
