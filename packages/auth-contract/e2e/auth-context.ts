import type { Page } from "@repo/e2e-testing";
import { Effect } from "effect";

import type { AuthScenario, AuthTestApplication } from "./auth-scenario";
import type {
  AuthTestControl,
  AuthTestIdentity,
  CreateAuthTestIdentityInput,
} from "./auth-test-control";

interface AuthApplication {
  readonly auth: AuthTestControl["Service"];
  readonly page: Page;
  readonly url: string;
}

export interface AuthContextOptions {
  readonly applications: Readonly<Record<AuthTestApplication, AuthApplication>>;
  readonly scenario: AuthScenario;
}

export interface GivenAuthUserInput extends CreateAuthTestIdentityInput {
  readonly application: AuthTestApplication;
}

export class AuthContext {
  readonly #options: AuthContextOptions;
  readonly #provisionedIdentities: {
    readonly application: AuthTestApplication;
    readonly identity: AuthTestIdentity;
  }[] = [];
  #disposed = false;

  constructor(options: AuthContextOptions) {
    this.#options = options;
  }

  rememberIdentity(
    name: string,
    identity: AuthTestIdentity,
    application: AuthTestApplication = "web"
  ): void {
    this.#options.scenario.identities.set(name, { application, identity });
  }

  identityFor(
    name: string,
    application: AuthTestApplication = "web"
  ): AuthTestIdentity | undefined {
    const scenarioIdentity = this.#options.scenario.identities.get(name);
    if (
      scenarioIdentity !== undefined &&
      scenarioIdentity.application !== application
    ) {
      throw new Error(
        `${name} belongs to the ${scenarioIdentity.application} application, not ${application}`
      );
    }
    return scenarioIdentity?.identity;
  }

  async givenUser(
    name: string,
    input: GivenAuthUserInput
  ): Promise<AuthTestIdentity> {
    const application = this.#options.applications[input.application];
    const identityInput: CreateAuthTestIdentityInput = {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
    };
    if (input.permissions !== undefined) {
      Object.assign(identityInput, { permissions: input.permissions });
    }
    const identity = await Effect.runPromise(
      application.auth.createVerifiedIdentity(identityInput)
    );
    this.#provisionedIdentities.push({
      application: input.application,
      identity,
    });
    this.rememberIdentity(name, identity, input.application);
    return identity;
  }

  async loginAs(name: string): Promise<void> {
    const scenarioIdentity = this.#options.scenario.identities.get(name);
    if (scenarioIdentity === undefined) {
      throw new Error(`The scenario does not have a user named ${name}`);
    }

    const application =
      this.#options.applications[scenarioIdentity.application];
    await Effect.runPromise(
      application.auth.signIn({
        applicationUrl: application.url,
        identity: scenarioIdentity.identity,
        page: application.page,
      })
    );
    await application.page.goto(application.url);
  }

  async acceptPendingInvitation(
    name: string,
    input: Omit<CreateAuthTestIdentityInput, "permissions">,
    page: Page,
    applicationName: AuthTestApplication = "web"
  ): Promise<AuthTestIdentity> {
    const application = this.#options.applications[applicationName];
    const identity = await Effect.runPromise(
      application.auth.acceptPendingInvitation({
        applicationUrl: application.url,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        page,
      })
    );
    this.#provisionedIdentities.push({
      application: applicationName,
      identity,
    });
    this.rememberIdentity(name, identity, applicationName);
    return identity;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) {
      return;
    }

    const failures: unknown[] = [];
    for (
      let index = this.#provisionedIdentities.length - 1;
      index >= 0;
      index -= 1
    ) {
      const provisioned = this.#provisionedIdentities[index];
      if (provisioned === undefined) {
        continue;
      }
      try {
        // oxlint-disable-next-line no-await-in-loop -- Identity teardown is intentionally ordered and continues after independent failures.
        await Effect.runPromise(
          this.#options.applications[
            provisioned.application
          ].auth.deleteIdentity(provisioned.identity)
        );
      } catch (error) {
        failures.push(error);
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(failures, "Failed to clean up auth test users");
    }
    this.#disposed = true;
  }
}

declare module "@repo/e2e-testing" {
  interface E2EFixtures {
    readonly auth: AuthContext;
  }
}
