import type { AuthContext } from "@repo/auth-contract/e2e/auth-context";
import { Given, Then, When } from "@repo/e2e-testing";
import type { APIRequestContext, Page } from "@repo/e2e-testing";
import {
  REGISTRATION_DECIDE_PERMISSION,
  REGISTRATION_READ_PERMISSION,
} from "@repo/registration/http/registration-api";

import { parseCompanyMemberName } from "../company-member-name";
import { RegistrationApiDriver } from "../drivers/registration-api.driver";
import { RegistrationReviewDriver } from "../drivers/registration-review.driver";
import type { RegistrationTestData } from "../fixtures";
import type { RegistrationContext } from "../registration-context";
import type { RegistrationScenario } from "../registration-scenario";

interface RegistrationReviewFixtures {
  readonly adminPage: Page;
  readonly apiRequest: APIRequestContext;
  readonly auth: AuthContext;
  readonly registration: RegistrationContext;
  readonly registrationScenario: RegistrationScenario;
  readonly registrationTestData: RegistrationTestData;
}

const getRegistrationReference = (
  registrationScenario: RegistrationScenario,
  companyName: string
) => {
  const reference = registrationScenario.registrations.get(companyName);
  if (!reference) {
    throw new Error(
      `The scenario does not have a Registration for ${companyName}`
    );
  }
  return { companyName, ...reference };
};

Given(
  "a Registration exists for {string}",
  async (
    {
      apiRequest,
      registration,
      registrationScenario,
      registrationTestData,
    }: RegistrationReviewFixtures,
    companyName: string
  ) => {
    const email = registrationTestData.uniqueEmail(companyName);
    const registrationId = await new RegistrationApiDriver(apiRequest).submit({
      companyName,
      email,
    });
    const reference = { email, registrationId };
    registrationScenario.registrations.set(companyName, reference);
    registration.trackRegistration(reference);
  }
);

Given(
  "{string} is a Registration reviewer",
  async (
    { auth, registrationTestData }: RegistrationReviewFixtures,
    name: string
  ) => {
    const { firstName, lastName } = parseCompanyMemberName(name);
    await auth.givenUser(name, {
      application: "admin",
      email: registrationTestData.uniqueEmail(`${firstName}.${lastName}`),
      firstName,
      lastName,
      permissions: [
        REGISTRATION_READ_PERMISSION,
        REGISTRATION_DECIDE_PERMISSION,
      ],
    });
  }
);

When(
  "I approve the Registration for {string}",
  async (
    { adminPage, registrationScenario }: RegistrationReviewFixtures,
    companyName: string
  ) => {
    await new RegistrationReviewDriver(adminPage).approve(
      getRegistrationReference(registrationScenario, companyName)
    );
  }
);

Then(
  "the Registration for {string} is awaiting onboarding",
  async (
    { adminPage, registrationScenario }: RegistrationReviewFixtures,
    companyName: string
  ) => {
    await new RegistrationReviewDriver(adminPage).expectAwaitingOnboarding(
      getRegistrationReference(registrationScenario, companyName)
    );
  }
);
