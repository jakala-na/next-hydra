export interface CardPaymentEntryDriver {
  readonly cancelAuthentication: () => Promise<void>;
  readonly enterAuthenticationRequiredDetails: () => Promise<void>;
  readonly enterValidDetails: () => Promise<void>;
  readonly expectAuthenticationRequired: () => Promise<void>;
}

declare module "@repo/e2e-testing" {
  interface E2EFixtures {
    readonly cardPaymentEntry: CardPaymentEntryDriver;
  }
}
