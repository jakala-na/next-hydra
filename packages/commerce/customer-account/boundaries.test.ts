import { ActionClient, ActionMiddleware } from "@repo/actions";
import { Effect, Layer, ManagedRuntime, Redacted, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
  CommerceCustomerProfile,
} from "../domain/commerce-account";
import {
  AuthUserId,
  CustomerCommercePrincipal,
} from "../domain/commerce-request-context";
import { CommerceContext } from "../services/commerce-context";
import type {
  InviteCustomerAccountMemberFailure,
  InviteCustomerAccountMemberInput,
} from "../services/customer-account-members";
import {
  CompanyMemberInvitationNotFound,
  CustomerAccountMemberInvitation,
  CustomerAccountMembers,
  CustomerAccountInvitationId,
  InvitationIssueOutcomeUnknown,
  InvitationProviderFailure,
} from "../services/customer-account-members";
import { CommerceLocale, resolveStore } from "../store";
import { inviteCompanyMemberFailureMessageKey } from "./action-contract";
import { makeCustomerAccountProcedures } from "./procedures";

const customerId = CommerceCustomerId.make("customer-1");
const businessUnitId = CommerceBusinessUnitId.make("business-unit-1");
const profileEmail = Redacted.make("administrator@example.com", {
  label: "email",
});

type InvitationIssue = (
  input: InviteCustomerAccountMemberInput
) => Effect.Effect<
  CustomerAccountMemberInvitation,
  InviteCustomerAccountMemberFailure
>;

interface HarnessOptions {
  readonly cancel?: CustomerAccountMembers["Service"]["cancelInvitation"];
  readonly issue?: InvitationIssue;
}

const defaultIssue: InvitationIssue = (input) =>
  Effect.succeed(
    new CustomerAccountMemberInvitation({
      expiresAt: Schema.decodeSync(Schema.DateFromString)(
        "2026-09-24T12:00:00.000Z"
      ),
      invitationId: CustomerAccountInvitationId.make("invitation-1"),
      inviteeEmail: input.inviteeEmail,
    })
  );

const makeHarness = (options: HarnessOptions = {}) => {
  const issue = options.issue ?? defaultIssue;
  const issueInvitation = vi.fn<InvitationIssue>(issue);
  const members = CustomerAccountMembers.of({
    cancelInvitation: options.cancel ?? (() => Effect.die("not used")),
    invite: issueInvitation,
    listInvitations: () => Effect.die("not used"),
    reissueInvitation: () => Effect.die("not used"),
  });
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(Layer.succeed(CustomerAccountMembers, members))
  );
  const principal = new CustomerCommercePrincipal({
    authUserId: AuthUserId.make("auth-user-1"),
    businessUnitId,
    businessUnitKey: CommerceBusinessUnitKey.make("business-unit-key-1"),
    customerId,
    roles: ["admin", "buyer"],
  });
  const commerceContext = CommerceContext.of({
    customerPrincipal: () => Effect.succeed(principal),
    customerProfile: () =>
      Effect.succeed(
        new CommerceCustomerProfile({ customerId, email: profileEmail })
      ),
    principal,
    store: resolveStore({ locale: CommerceLocale.make("en-US") }),
  });
  const actions = ActionClient.make(runtime)
    .use(
      ActionMiddleware.context(() =>
        Effect.succeed({ locale: "en-US" as const })
      )
    )
    .provide(() => Layer.succeed(CommerceContext, commerceContext));
  const {
    cancelCompanyMemberInvitationProcedure,
    inviteCompanyMemberProcedure,
  } = makeCustomerAccountProcedures(actions);

  return {
    action: inviteCompanyMemberProcedure.toFormAction({
      getFailureMessage: (error) =>
        `Localized ${inviteCompanyMemberFailureMessageKey(error)}`,
    }),
    cancelAction: cancelCompanyMemberInvitationProcedure.toFormAction({
      getFailureMessage: (error) =>
        `Localized ${inviteCompanyMemberFailureMessageKey(error)}`,
    }),
    issueInvitation,
  };
};

const invitationForm = (
  email: string,
  roles: readonly ("admin" | "approver" | "buyer")[] = ["buyer"]
) => {
  const formData = new FormData();
  formData.set("firstName", "Ada");
  formData.set("lastName", "Lovelace");
  formData.set("email", email);
  for (const role of roles) {
    formData.append(`roles[${role}]`, role);
  }
  return formData;
};

describe("Customer account invitation boundaries", () => {
  it("lets an administrator invite a user with multiple company roles", async () => {
    const harness = makeHarness();

    const result = await harness.action(
      null,
      invitationForm("new.user@example.com", ["buyer", "approver"])
    );

    expect(result).toStrictEqual({
      _tag: "Success",
      success: {
        invitationId: "invitation-1",
        inviteeEmail: "new.user@example.com",
      },
    });
    const [invitationInput] = harness.issueInvitation.mock.calls[0] ?? [];
    expect(
      invitationInput === undefined
        ? undefined
        : {
            actor: invitationInput.actor,
            email: Redacted.value(invitationInput.inviteeEmail),
            firstName: Redacted.value(invitationInput.inviteeName.firstName),
            lastName: Redacted.value(invitationInput.inviteeName.lastName),
            roles: invitationInput.roles,
          }
    ).toMatchObject({
      actor: {
        authUserId: "auth-user-1",
        businessUnitId: "business-unit-1",
        roles: ["admin", "buyer"],
      },
      email: "new.user@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      roles: ["buyer", "approver"],
    });
  });

  it("requires at least one company role", async () => {
    const harness = makeHarness();

    const result = await harness.action(
      null,
      invitationForm("new.user@example.com", [])
    );

    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        displayMessage: "Localized InputInvalidRoles",
        error: {
          _tag: "InputInvalid",
          issues: [{ path: ["roles"] }],
        },
      },
    });
    expect(harness.issueInvitation).not.toHaveBeenCalled();
  });

  it("rejects malformed invitations before calling the application port", async () => {
    const invalidHarness = makeHarness();
    const invalid = await invalidHarness.action(
      null,
      invitationForm("not-an-email")
    );
    expect(invalid).toMatchObject({
      _tag: "Failure",
      failure: {
        error: {
          _tag: "InputInvalid",
          issues: [{ path: ["email"] }],
        },
      },
    });
    expect(invalidHarness.issueInvitation).not.toHaveBeenCalled();
  });

  it("requires the invitee's first and last name", async () => {
    const harness = makeHarness();
    const formData = invitationForm("new.user@example.com");
    formData.set("firstName", "");

    const result = await harness.action(null, formData);

    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        displayMessage: "Localized InputInvalidName",
        error: {
          _tag: "InputInvalid",
          issues: [{ path: ["firstName"] }],
        },
      },
    });
    expect(harness.issueInvitation).not.toHaveBeenCalled();
  });

  it("does not expose provider failure causes through the action", async () => {
    const harness = makeHarness({
      issue: () =>
        Effect.fail(
          new InvitationProviderFailure({
            cause: new Error("provider secret"),
            message: "provider diagnostic",
            operation: "issue",
          })
        ),
    });

    const result = await harness.action(
      null,
      invitationForm("new.user@example.com")
    );

    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        displayMessage: "Localized InvitationProviderFailure",
        error: { _tag: "InvitationProviderFailure" },
      },
    });
    expect(JSON.stringify(result)).not.toContain("provider secret");
    expect(JSON.stringify(result)).not.toContain("provider diagnostic");
  });

  it("does not offer a blind retry when invitation delivery is ambiguous", async () => {
    const harness = makeHarness({
      issue: () =>
        Effect.fail(
          new InvitationIssueOutcomeUnknown({
            cause: new Error("connection closed after write"),
            message: "The provider response could not be confirmed",
          })
        ),
    });

    const result = await harness.action(
      null,
      invitationForm("new.user@example.com")
    );

    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        displayMessage: "Localized InvitationIssueOutcomeUnknown",
        error: {
          _tag: "InvitationIssueOutcomeUnknown",
          recovery: "refresh",
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("connection closed");
  });

  it("preserves an exact durable invitation not-found failure", async () => {
    const harness = makeHarness({
      cancel: () =>
        Effect.fail(
          new CompanyMemberInvitationNotFound({
            message: "Invitation does not exist",
          })
        ),
    });
    const formData = new FormData();
    formData.set("companyMemberInvitationId", "missing-invitation");

    const result = await harness.cancelAction(null, formData);

    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        displayMessage: "Localized CompanyMemberInvitationNotFound",
        error: {
          _tag: "CompanyMemberInvitationNotFound",
          recovery: "refresh",
        },
      },
    });
  });
});
