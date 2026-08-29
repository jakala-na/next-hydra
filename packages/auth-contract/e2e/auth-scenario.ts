import type { AuthTestIdentity } from "./auth-test-control";

export type AuthTestApplication = "admin" | "web";

export interface AuthScenarioIdentity {
  readonly application: AuthTestApplication;
  readonly identity: AuthTestIdentity;
}

export interface AuthScenario {
  readonly identities: Map<string, AuthScenarioIdentity>;
}

export const createAuthScenario = (): AuthScenario => ({
  identities: new Map(),
});

declare module "@repo/e2e-testing" {
  interface E2EFixtures {
    readonly authScenario: AuthScenario;
  }
}
