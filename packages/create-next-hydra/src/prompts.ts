import { cancel, isCancel, select, text } from "@clack/prompts";

import type { ProviderSlot } from "./composition/types.js";

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
    },
  });

  if (isCancel(result)) {
    cancel("Cancelled.");
    throw new UserCancelledError();
  }

  return result.trim();
}

const PROVIDER_CHOICES: Record<
  ProviderSlot,
  { label: string; value: string; hint?: string }[]
> = {
  auth: [{ label: "WorkOS", value: "workos" }],
  cms: [
    {
      hint: "includes the Drupal backend app",
      label: "Drupal",
      value: "drupal",
    },
    { label: "Contentstack", value: "contentstack" },
  ],
  commerce: [{ label: "Commercetools", value: "commercetools" }],
};

export async function promptForProvider(
  slot: ProviderSlot,
  initialValue?: string
): Promise<string> {
  const result = await select({
    initialValue,
    message: `Choose the ${slot} provider`,
    options: PROVIDER_CHOICES[slot],
  });

  if (isCancel(result)) {
    cancel("Cancelled.");
    throw new UserCancelledError();
  }

  return result;
}
