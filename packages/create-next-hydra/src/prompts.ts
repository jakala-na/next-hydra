import { cancel, isCancel, text } from "@clack/prompts";

export class UserCancelledError extends Error {
  constructor() {
    super("Operation cancelled by user.");
    this.name = "UserCancelledError";
  }
}

export async function promptForTargetDirectory(): Promise<string> {
  const result = await text({
    message: "Where should the project be created?",
    placeholder: "my-next-hydra-app",
    validate(value) {
      if (!value?.trim()) {
        return "Please enter a folder name.";
      }

      return undefined;
    },
  });

  if (isCancel(result)) {
    cancel("Cancelled.");
    throw new UserCancelledError();
  }

  return result.trim();
}
