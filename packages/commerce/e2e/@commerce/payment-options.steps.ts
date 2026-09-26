import { Given, Then } from "@repo/e2e-testing";

Given(
  "Company {string} has Net 30 with {string} available to spend in currency {string}",
  async (
    { businessUnits, checkoutScenario },
    companyName: string,
    amount: string,
    currency: string
  ) => {
    await checkoutScenario.setNetTerms({
      amount,
      businessUnitId: businessUnits.idForCompany(companyName),
      currency,
      termsInDays: 30,
    });
  }
);

Then(
  "Company {string} still has {string} available to spend in currency {string}",
  async (
    { businessUnits, checkoutScenario },
    companyName: string,
    amount: string,
    currency: string
  ) => {
    await checkoutScenario.expectNetTerms({
      amount,
      businessUnitId: businessUnits.idForCompany(companyName),
      currency,
      termsInDays: 30,
    });
  }
);
