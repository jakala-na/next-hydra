export interface BusinessUnitLookup {
  readonly idForCompany: (companyName: string) => string;
}

declare module "@repo/e2e-testing" {
  interface E2EFixtures {
    readonly businessUnits: BusinessUnitLookup;
  }
}
