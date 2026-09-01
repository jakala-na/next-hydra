export interface CardPaymentEntryDriver {
  readonly enterValidDetails: () => Promise<void>;
}

declare module "@repo/e2e-testing" {
  interface E2EFixtures {
    readonly cardPaymentEntry: CardPaymentEntryDriver;
  }
}
