import { Given, When } from "@repo/e2e-testing";

import type { AuthContext } from "./auth-context";

const loginAs = async (
  { auth }: { readonly auth: AuthContext },
  name: string
): Promise<void> => {
  await auth.loginAs(name);
};

Given("I am logged in as {string}", loginAs);

When("I log in as {string}", loginAs);
