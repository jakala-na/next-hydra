/* oxlint-disable eslint/class-methods-use-this -- The browser-compatible ResizeObserver test double implements required no-op instance methods. */
import { ActionClient, ActionMiddleware } from "@repo/actions";
import { NextIntlClientProvider } from "@repo/i18n";
import messages from "@repo/i18n/messages/en-US.json";
import { Effect, Layer, ManagedRuntime, Redacted, Schema } from "effect";
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

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
import {
  CustomerAccountMemberInvitation,
  CustomerAccountMembers,
  CustomerAccountInvitationId,
} from "../services/customer-account-members";
import type { InviteCustomerAccountMemberInput } from "../services/customer-account-members";
import { CommerceLocale, resolveStore } from "../store";
import { inviteCompanyMemberFailureMessageKey } from "./action-contract";
import type { InviteCompanyMemberAction } from "./action-contract";
import { CompanyMemberInvitationForm } from "./company-member-invitation-form";
import { makeCustomerAccountProcedures } from "./procedures";

const roots: ReturnType<typeof createRoot>[] = [];
type InvitationIssue = (
  input: InviteCustomerAccountMemberInput
) => Effect.Effect<CustomerAccountMemberInvitation>;

const makeInvitationAction = () => {
  const invite = vi.fn<InvitationIssue>((input) =>
    Effect.succeed(
      new CustomerAccountMemberInvitation({
        expiresAt: Schema.decodeSync(Schema.DateFromString)(
          "2026-09-24T12:00:00.000Z"
        ),
        invitationId: CustomerAccountInvitationId.make("invitation-1"),
        inviteeEmail: input.inviteeEmail,
      })
    )
  );
  const members = CustomerAccountMembers.of({ invite });
  const runtime = ManagedRuntime.make(
    Layer.succeed(CustomerAccountMembers, members)
  );
  const customerId = CommerceCustomerId.make("customer-1");
  const principal = new CustomerCommercePrincipal({
    authUserId: AuthUserId.make("auth-admin-1"),
    businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
    businessUnitKey: CommerceBusinessUnitKey.make("company-1"),
    customerId,
    roles: ["admin", "buyer"],
  });
  const commerceContext = CommerceContext.of({
    customerPrincipal: () => Effect.succeed(principal),
    customerProfile: () =>
      Effect.succeed(
        new CommerceCustomerProfile({
          customerId,
          email: Redacted.make("administrator@example.com", {
            label: "email",
          }),
        })
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
  const { inviteCompanyMemberProcedure } =
    makeCustomerAccountProcedures(actions);
  const action = inviteCompanyMemberProcedure.toFormAction({
    getFailureMessage: (error) =>
      messages.web.customerArea.errors[
        inviteCompanyMemberFailureMessageKey(error)
      ],
  });

  return { action, invite };
};

const renderForm = (action: InviteCompanyMemberAction) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  act(() => {
    root.render(
      <NextIntlClientProvider locale="en-US" messages={messages}>
        <CompanyMemberInvitationForm canInvite inviteAction={action} />
      </NextIntlClientProvider>
    );
  });

  const email = container.querySelector("#company-member-email");
  const form = container.querySelector("form");
  if (
    !(email instanceof HTMLInputElement) ||
    !(form instanceof HTMLFormElement)
  ) {
    throw new Error("Expected the customer invitation form to render");
  }

  return { container, email, form };
};

describe(CompanyMemberInvitationForm, () => {
  beforeAll(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        readonly disconnect = () => {};
        readonly observe = () => {};
        readonly unobserve = () => {};
      }
    );
  });

  afterEach(() => {
    act(() => {
      for (const root of roots.splice(0)) {
        root.unmount();
      }
    });
    document.body.replaceChildren();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("submits the rendered role controls through the customer invitation procedure", async () => {
    const { action, invite } = makeInvitationAction();
    const { container, email, form } = renderForm(action);
    email.value = "new.member@example.com";
    const approver = container.querySelector("#company-member-role-approver");
    if (!(approver instanceof HTMLButtonElement)) {
      throw new Error("Expected the Approver role control to render");
    }

    act(() => {
      approver.click();
    });
    act(() => {
      form.requestSubmit();
    });

    await vi.waitFor(() => {
      expect(invite).toHaveBeenCalledOnce();
      expect(container.textContent).toContain(
        "An invitation was sent to new.member@example.com."
      );
    });
    const [input] = invite.mock.calls[0] ?? [];
    expect(input?.roles).toStrictEqual(["buyer", "approver"]);
  });

  it("shows role-specific guidance when no company role is selected", async () => {
    const { action, invite } = makeInvitationAction();
    const { container, email, form } = renderForm(action);
    email.value = "new.member@example.com";
    const buyer = container.querySelector("#company-member-role-buyer");
    if (!(buyer instanceof HTMLButtonElement)) {
      throw new Error("Expected the Buyer role control to render");
    }

    act(() => {
      buyer.click();
    });
    act(() => {
      form.requestSubmit();
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain(
        "Select at least one company role."
      );
    });
    expect(invite).not.toHaveBeenCalled();
  });
});
