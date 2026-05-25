import { describe, expect, it } from "@effect/vitest";
import { RegistrationReviewerActor } from "@repo/registration-effect/domain/actors";
import { ApprovedDecision } from "@repo/registration-effect/domain/approval";
import { CommerceAccount } from "@repo/registration-effect/domain/commerce";
import {
  AcceptedAuthIdentity,
  AddressLine,
  AuthUserId,
  City,
  CommerceBusinessUnitId,
  CommerceCustomerId,
  CompanyName,
  CountryCode,
  Email,
  InvitationId,
  PersonName,
  PhoneNumber,
  PostalCode,
  RegistrationId,
} from "@repo/registration-effect/domain/identity";
import {
  ApprovedRegistration,
  CompanyAddress,
  CompanyRegistrationDetails,
} from "@repo/registration-effect/domain/registration";
import {
  CommerceAccountError,
  CommerceAccounts,
} from "@repo/registration-effect/services/commerce-account";
import { Effect, Redacted } from "effect";
import { beforeEach, vi } from "vitest";
import { layerCommercetoolsCommerceAccounts } from "./commerce-accounts";

const mocks = vi.hoisted(() => {
  const businessUnitGetExecute = vi.fn();
  const businessUnitPostExecute = vi.fn();
  const businessUnitGet = vi.fn(() => ({ execute: businessUnitGetExecute }));
  const businessUnitPost = vi.fn(() => ({
    execute: businessUnitPostExecute,
  }));
  const businessUnitWithId = vi.fn(() => ({
    get: businessUnitGet,
    post: businessUnitPost,
  }));
  const businessUnits = vi.fn(() => ({ withId: businessUnitWithId }));
  const customerGetExecute = vi.fn();
  const customerPostExecute = vi.fn();
  const customerGet = vi.fn(() => ({ execute: customerGetExecute }));
  const customerPost = vi.fn(() => ({ execute: customerPostExecute }));
  const customerWithId = vi.fn(() => ({
    get: customerGet,
    post: customerPost,
  }));
  const customers = vi.fn(() => ({ withId: customerWithId }));

  return {
    businessUnitGet,
    businessUnitGetExecute,
    businessUnitPost,
    businessUnitPostExecute,
    businessUnitWithId,
    businessUnits,
    customerGet,
    customerGetExecute,
    customerPost,
    customerPostExecute,
    customerWithId,
    customers,
  };
});

vi.mock("../../client/api-root", () => ({
  apiRoot: {
    businessUnits: mocks.businessUnits,
    customers: mocks.customers,
  },
}));

const details = new CompanyRegistrationDetails({
  companyName: CompanyName.make("Hydra Supplies"),
  companyPhone: Redacted.make(PhoneNumber.make("+1 555 0100"), {
    label: "companyPhone",
  }),
  contactFirstName: Redacted.make(PersonName.make("Ada"), {
    label: "personName",
  }),
  contactLastName: Redacted.make(PersonName.make("Lovelace"), {
    label: "personName",
  }),
  email: Redacted.make(Email.make("ada@example.com"), { label: "email" }),
  address: new CompanyAddress({
    streetName: Redacted.make(AddressLine.make("1 Computation Way"), {
      label: "addressLine",
    }),
    postalCode: Redacted.make(PostalCode.make("10001"), {
      label: "postalCode",
    }),
    city: Redacted.make(City.make("New York"), { label: "city" }),
    country: CountryCode.make("US"),
  }),
});

const acceptedIdentity = new AcceptedAuthIdentity({
  authUserId: AuthUserId.make("user_01KG3ZSVVGPQ0NQ1FBZZJ2HTXV"),
  email: Redacted.make(Email.make("ada@example.com"), { label: "email" }),
  firstName: Redacted.make(PersonName.make("Ada"), { label: "personName" }),
  lastName: Redacted.make(PersonName.make("Lovelace"), {
    label: "personName",
  }),
});

const registration = new ApprovedRegistration({
  _tag: "ApprovedRegistration",
  status: "approved",
  id: RegistrationId.make("registration-1"),
  details,
  decision: new ApprovedDecision({
    decision: "approved",
    actor: new RegistrationReviewerActor({
      actorType: "registration_reviewer",
      authUserId: AuthUserId.make("reviewer-1"),
      email: Redacted.make(Email.make("reviewer@example.com"), {
        label: "email",
      }),
      name: "Reviewer",
    }),
    decidedAt: new Date(0),
  }),
  commerceAccount: new CommerceAccount({
    registrationId: RegistrationId.make("registration-1"),
    customerId: CommerceCustomerId.make("customer-1"),
    businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
  }),
  invitationId: InvitationId.make("invitation-1"),
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

beforeEach(() => {
  mocks.customerGet.mockClear();
  mocks.customerGetExecute.mockReset();
  mocks.customerPost.mockClear();
  mocks.customerPostExecute.mockReset();
  mocks.customerWithId.mockClear();
  mocks.customers.mockClear();
  mocks.businessUnitGet.mockClear();
  mocks.businessUnitGetExecute.mockReset();
  mocks.businessUnitPost.mockClear();
  mocks.businessUnitPostExecute.mockReset();
  mocks.businessUnitWithId.mockClear();
  mocks.businessUnits.mockClear();
});

describe("layerCommercetoolsCommerceAccounts", () => {
  it("uses the commerce failure reason as the error message", () => {
    const error = new CommerceAccountError({
      message: "Failed to add Commercetools business unit associate",
    });

    expect(error.message).toBe(
      "Failed to add Commercetools business unit associate"
    );
    expect(error.stack).toContain(
      "Failed to add Commercetools business unit associate"
    );
  });

  it.effect("sets the WorkOS user id as the customer external id", () =>
    Effect.gen(function* () {
      mocks.customerGetExecute.mockResolvedValueOnce({
        body: {
          id: "customer-1",
          version: 7,
          email: "ada@example.com",
          firstName: "Ada",
          lastName: "Lovelace",
        },
      });
      mocks.customerPostExecute.mockResolvedValueOnce({
        body: {
          id: "customer-1",
          version: 8,
          externalId: "user_01KG3ZSVVGPQ0NQ1FBZZJ2HTXV",
          email: "ada@example.com",
          firstName: "Ada",
          lastName: "Lovelace",
        },
      });
      mocks.businessUnitGetExecute.mockResolvedValueOnce({
        body: {
          id: "business-unit-1",
          version: 3,
          status: "Active",
          associates: [],
        },
      });
      mocks.businessUnitPostExecute.mockResolvedValueOnce({
        body: {
          id: "business-unit-1",
          version: 4,
          status: "Active",
        },
      });

      const commerceAccounts = yield* CommerceAccounts;
      yield* commerceAccounts.linkRegistrantIdentity({
        registration,
        acceptedIdentity,
      });

      expect(mocks.customerPost).toHaveBeenCalledWith({
        body: {
          version: 7,
          actions: [
            {
              action: "setExternalId",
              externalId: "user_01KG3ZSVVGPQ0NQ1FBZZJ2HTXV",
            },
          ],
        },
      });
      expect(mocks.businessUnitPost).toHaveBeenCalledWith({
        body: {
          version: 3,
          actions: [
            {
              action: "addAssociate",
              associate: {
                customer: { typeId: "customer", id: "customer-1" },
                associateRoleAssignments: [
                  {
                    associateRole: {
                      typeId: "associate-role",
                      key: "owner",
                    },
                    inheritance: "Enabled",
                  },
                ],
              },
            },
          ],
        },
      });
    }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

  it.effect(
    "does not update the business unit when the owner associate already exists",
    () =>
      Effect.gen(function* () {
        mocks.customerGetExecute.mockResolvedValueOnce({
          body: {
            id: "customer-1",
            version: 8,
            externalId: "user_01KG3ZSVVGPQ0NQ1FBZZJ2HTXV",
            email: "ada@example.com",
            firstName: "Ada",
            lastName: "Lovelace",
          },
        });
        mocks.businessUnitGetExecute.mockResolvedValueOnce({
          body: {
            id: "business-unit-1",
            version: 3,
            status: "Active",
            associates: [
              {
                customer: { typeId: "customer", id: "customer-1" },
                associateRoleAssignments: [
                  {
                    associateRole: {
                      typeId: "associate-role",
                      key: "owner",
                    },
                    inheritance: "Enabled",
                  },
                ],
              },
            ],
          },
        });

        const commerceAccounts = yield* CommerceAccounts;
        yield* commerceAccounts.linkRegistrantIdentity({
          registration,
          acceptedIdentity,
        });

        expect(mocks.customerPost).not.toHaveBeenCalled();
        expect(mocks.businessUnitPost).not.toHaveBeenCalled();
      }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );

  it.effect(
    "includes Commercetools response details when owner association fails",
    () =>
      Effect.gen(function* () {
        mocks.customerGetExecute.mockResolvedValueOnce({
          body: {
            id: "customer-1",
            version: 8,
            externalId: "user_01KG3ZSVVGPQ0NQ1FBZZJ2HTXV",
            email: "ada@example.com",
            firstName: "Ada",
            lastName: "Lovelace",
          },
        });
        mocks.businessUnitGetExecute.mockResolvedValueOnce({
          body: {
            id: "business-unit-1",
            version: 3,
            status: "Active",
            associates: [],
          },
        });
        mocks.businessUnitPostExecute.mockRejectedValueOnce({
          statusCode: 400,
          body: {
            message: "The referenced associate role does not exist.",
            errors: [
              {
                code: "ReferencedResourceNotFound",
                message: "Referenced resource with key owner was not found.",
              },
            ],
          },
        });

        const commerceAccounts = yield* CommerceAccounts;
        const error = yield* commerceAccounts
          .linkRegistrantIdentity({
            registration,
            acceptedIdentity,
          })
          .pipe(Effect.flip);

        expect(error).toBeInstanceOf(CommerceAccountError);
        expect(error.message).toContain(
          "Failed to add Commercetools business unit associate"
        );
        expect(error.message).toContain(
          "The referenced associate role does not exist."
        );
        expect(error.message).toContain("ReferencedResourceNotFound");
      }).pipe(Effect.provide(layerCommercetoolsCommerceAccounts))
  );
});
