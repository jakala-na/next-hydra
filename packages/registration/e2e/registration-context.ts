import type {
  AuthTestControl,
  AuthTestIdentity,
} from "@repo/auth-contract/e2e/auth-test-control";
import type {
  CommerceAccount,
  CommerceAssociateMembership,
  CommerceBusinessUnitId,
  CommerceCustomerId,
} from "@repo/commerce/domain/commerce-account";
import { INITIAL_COMPANY_ROLES } from "@repo/commerce/domain/commerce-account";
import type { StoreKey } from "@repo/commerce/store";
import { Effect, Redacted } from "effect";

import { CompanyActor, RegistrationReviewerActor } from "../domain/actors";
import { ApprovedDecision } from "../domain/approval";
import {
  AcceptedAuthIdentity,
  AddressLine,
  AuthUserId,
  City,
  CompanyName,
  CountryCode,
  Email,
  PersonName,
  PostalCode,
  Region,
  RegistrationId,
} from "../domain/identity";
import {
  ApprovedRegistration,
  CompanyAddress,
  CompanyRegistrationDetails,
} from "../domain/registration";
import type { CompanyRoles } from "../domain/roles";
import type { ProvisionCompanyMemberInput } from "../programs/company-member-invitations";
import type { ProvisionApprovedRegistrationInput } from "../programs/registration-onboarding";

export interface RegistrationCompanyMember {
  readonly authUserId: AuthUserId;
  readonly customerId: CommerceCustomerId;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly memberships: ReadonlyMap<CommerceBusinessUnitId, CompanyRoles>;
}

export interface RegistrationCompany {
  readonly administrator: RegistrationCompanyMember;
  readonly businessUnitId: CommerceBusinessUnitId;
  readonly name: string;
}

export interface RegistrationContextOptions {
  readonly auth: AuthTestControl["Service"];
  readonly deleteCommerceAccount: (account: {
    readonly businessUnitId: CommerceBusinessUnitId;
    readonly customerId: CommerceCustomerId;
  }) => Promise<void>;
  readonly deleteRegistration: (registrationId: string) => Promise<void>;
  readonly provisionCompany: (
    input: ProvisionApprovedRegistrationInput
  ) => Promise<CommerceAccount>;
  readonly provisionCompanyMember: (
    input: ProvisionCompanyMemberInput
  ) => Promise<CommerceAssociateMembership>;
  readonly storeKey: StoreKey;
  readonly uniqueEmail: (localPart: string) => string;
  readonly uniqueId: (prefix: string) => string;
}

export interface GivenCompanyInput {
  readonly administrator: {
    readonly firstName: string;
    readonly lastName: string;
  };
  readonly name: string;
}

export interface GivenCompanyMemberInput {
  readonly company: RegistrationCompany;
  readonly companyMember?: RegistrationCompanyMember;
  readonly firstName: string;
  readonly lastName: string;
  readonly roles: CompanyRoles;
}

const emailLocalPart = (firstName: string, lastName: string) =>
  `${firstName}-${lastName}`
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");

const acceptedIdentityFrom = (identity: AuthTestIdentity) => ({
  authUserId: AuthUserId.make(identity.authUserId),
  email: Redacted.make(Email.make(identity.email), { label: "email" }),
  firstName: Redacted.make(PersonName.make(identity.firstName), {
    label: "personName",
  }),
  lastName: Redacted.make(PersonName.make(identity.lastName), {
    label: "personName",
  }),
});

interface RegistrationCleanup {
  readonly commerce: (() => Promise<void>)[];
  readonly identities: (() => Promise<void>)[];
  readonly invitations: (() => Promise<void>)[];
  readonly registrations: (() => Promise<void>)[];
}

interface IdentityInput {
  readonly firstName: string;
  readonly lastName: string;
}

export class RegistrationContext {
  readonly #options: RegistrationContextOptions;
  readonly #cleanup: RegistrationCleanup = {
    commerce: [],
    identities: [],
    invitations: [],
    registrations: [],
  };
  #disposed = false;

  constructor(options: RegistrationContextOptions) {
    this.#options = options;
  }

  #approvedRegistration(
    identity: AuthTestIdentity,
    companyName: string
  ): ApprovedRegistration {
    const acceptedIdentity = acceptedIdentityFrom(identity);
    const now = new Date();
    const reviewer = new RegistrationReviewerActor({
      actorType: "registration_reviewer",
      authUserId: AuthUserId.make(
        this.#options.uniqueId("registration-reviewer")
      ),
      email: Redacted.make(
        Email.make(this.#options.uniqueEmail("registration-reviewer")),
        { label: "email" }
      ),
      name: "E2E Registration Reviewer",
    });

    return new ApprovedRegistration({
      createdAt: now,
      decision: new ApprovedDecision({
        actor: reviewer,
        decidedAt: now,
        decision: "approved",
      }),
      details: new CompanyRegistrationDetails({
        address: new CompanyAddress({
          city: Redacted.make(City.make("New York"), { label: "city" }),
          country: CountryCode.make("US"),
          postalCode: Redacted.make(PostalCode.make("10001"), {
            label: "postalCode",
          }),
          region: Redacted.make(Region.make("NY"), { label: "region" }),
          streetName: Redacted.make(AddressLine.make("1 E2E Way"), {
            label: "addressLine",
          }),
        }),
        companyName: CompanyName.make(companyName),
        contactFirstName: acceptedIdentity.firstName,
        contactLastName: acceptedIdentity.lastName,
        email: acceptedIdentity.email,
      }),
      id: RegistrationId.make(
        this.#options.uniqueId(
          `registration-${emailLocalPart(companyName, "company")}`
        )
      ),
      onboarding: {
        acceptedAuthUserId: acceptedIdentity.authUserId,
        status: "accepted",
      },
      status: "approved",
      storeKey: this.#options.storeKey,
      submittedByAuthUserId: acceptedIdentity.authUserId,
      updatedAt: now,
    });
  }

  async #provisionIdentity(input: IdentityInput): Promise<AuthTestIdentity> {
    const identity = await Effect.runPromise(
      this.#options.auth.createVerifiedIdentity({
        email: this.#options.uniqueEmail(
          emailLocalPart(input.firstName, input.lastName)
        ),
        firstName: input.firstName,
        lastName: input.lastName,
      })
    );
    this.#cleanup.identities.push(async () => {
      await Effect.runPromise(this.#options.auth.deleteIdentity(identity));
    });
    return identity;
  }

  async givenCompany(input: GivenCompanyInput): Promise<RegistrationCompany> {
    const identity = await this.#provisionIdentity(input.administrator);
    const acceptedIdentity = new AcceptedAuthIdentity(
      acceptedIdentityFrom(identity)
    );
    const commerceAccount = await this.#options.provisionCompany({
      acceptedIdentity,
      registration: this.#approvedRegistration(identity, input.name),
    });
    this.#cleanup.commerce.push(async () => {
      await this.#options.deleteCommerceAccount(commerceAccount);
    });

    return {
      administrator: {
        authUserId: acceptedIdentity.authUserId,
        customerId: commerceAccount.customerId,
        email: identity.email,
        firstName: identity.firstName,
        lastName: identity.lastName,
        memberships: new Map([
          [commerceAccount.businessUnitId, INITIAL_COMPANY_ROLES],
        ]),
      },
      businessUnitId: commerceAccount.businessUnitId,
      name: input.name,
    };
  }

  async givenCompanyMember(
    input: GivenCompanyMemberInput
  ): Promise<RegistrationCompanyMember> {
    const identity =
      input.companyMember ?? (await this.#provisionIdentity(input));
    const acceptedIdentity = new AcceptedAuthIdentity(
      acceptedIdentityFrom(identity)
    );
    const administratorRoles = input.company.administrator.memberships.get(
      input.company.businessUnitId
    );
    if (administratorRoles === undefined) {
      throw new Error(
        `The Company administrator has no membership in ${input.company.name}`
      );
    }
    const membership = await this.#options.provisionCompanyMember({
      acceptedIdentity,
      actor: new CompanyActor({
        actorType: "company",
        authUserId: input.company.administrator.authUserId,
        businessUnitId: input.company.businessUnitId,
        email: Redacted.make(Email.make(input.company.administrator.email), {
          label: "email",
        }),
        roles: administratorRoles,
      }),
      roles: input.roles,
    });
    if (
      input.companyMember !== undefined &&
      input.companyMember.customerId !== membership.customerId
    ) {
      throw new Error(
        `Company Member ${identity.email} was assigned a different Customer in ${input.company.name}`
      );
    }

    return {
      authUserId: acceptedIdentity.authUserId,
      customerId: membership.customerId,
      email: identity.email,
      firstName: identity.firstName,
      lastName: identity.lastName,
      memberships: new Map([
        ...(input.companyMember?.memberships ?? []),
        [membership.businessUnitId, membership.roles],
      ]),
    };
  }

  trackCompanyMemberInvitation(email: string): void {
    this.#cleanup.invitations.push(async () => {
      await Effect.runPromise(
        this.#options.auth.revokePendingInvitationsFor(email)
      );
    });
  }

  trackRegistration(input: {
    readonly email: string;
    readonly registrationId: string;
  }): void {
    this.#cleanup.registrations.push(async () => {
      const failures: unknown[] = [];
      const revokeInvitation = async () => {
        try {
          await Effect.runPromise(
            this.#options.auth.revokePendingInvitationsFor(input.email)
          );
        } catch (error) {
          failures.push(error);
        }
      };

      await revokeInvitation();
      try {
        await this.#options.deleteRegistration(input.registrationId);
      } catch (error) {
        failures.push(error);
      }
      await revokeInvitation();

      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          `Failed to clean up Registration ${input.registrationId}`
        );
      }
    });
  }

  async dispose(): Promise<void> {
    if (this.#disposed) {
      return;
    }
    const failures: unknown[] = [];
    const phases = [
      this.#cleanup.registrations,
      this.#cleanup.invitations,
      this.#cleanup.commerce,
      this.#cleanup.identities,
    ];
    for (const phase of phases) {
      for (let index = phase.length - 1; index >= 0; index -= 1) {
        const cleanup = phase[index];
        if (cleanup === undefined) {
          continue;
        }
        try {
          // oxlint-disable-next-line no-await-in-loop -- Cleanup phases are ordered and continue after each independent failure.
          await cleanup();
        } catch (error) {
          failures.push(error);
        }
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        "Failed to clean up Registration scenario resources"
      );
    }
    this.#disposed = true;
  }
}
