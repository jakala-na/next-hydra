import type { RegistrationContext } from "./registration-context";
import type { RegistrationScenario } from "./registration-scenario";

export interface RegistrationTestData {
  readonly uniqueEmail: (localPart: string) => string;
  readonly uniqueId: (prefix: string) => string;
}

declare module "@repo/e2e-testing" {
  interface E2EFixtures {
    readonly registration: RegistrationContext;
    readonly registrationScenario: RegistrationScenario;
    readonly registrationTestData: RegistrationTestData;
  }
}
