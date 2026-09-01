/* oxlint-disable eslint/class-methods-use-this -- The browser-compatible ResizeObserver test double implements required no-op instance methods. */
import { NextIntlClientProvider } from "@repo/i18n";
import messages from "@repo/i18n/messages/en-US.json";
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

import type { CompanyMemberManagementAction } from "./action-contract";
import { CompanyMembersManagement } from "./company-members-management";

const roots: ReturnType<typeof createRoot>[] = [];
const successfulAction = (operation: "cancel" | "reissue" | "remove") =>
  vi.fn<CompanyMemberManagementAction>(
    async () =>
      await Promise.resolve({
        _tag: "Success",
        success: { operation },
      })
  );

const renderManagement = () => {
  const cancelInvitationAction = successfulAction("cancel");
  const reissueInvitationAction = successfulAction("reissue");
  const removeMemberAction = successfulAction("remove");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);

  act(() => {
    root.render(
      <NextIntlClientProvider locale="en-US" messages={messages}>
        <CompanyMembersManagement
          cancelInvitationAction={cancelInvitationAction}
          currentAuthUserId="auth-admin-1"
          invitations={[
            {
              companyMemberInvitationId: "pending-1",
              email: "pending@example.com",
              expiresAtLabel: "Sep 25, 2026",
              firstName: "Pending",
              lastName: "Person",
              roles: ["buyer", "approver"],
              status: "pending",
            },
            {
              companyMemberInvitationId: "expired-1",
              email: "expired@example.com",
              expiresAtLabel: "Aug 1, 2026",
              firstName: "Expired",
              lastName: "Person",
              roles: ["buyer"],
              status: "expired",
            },
            {
              companyMemberInvitationId: "revoked-1",
              email: "revoked@example.com",
              expiresAtLabel: "Aug 10, 2026",
              firstName: "Revoked",
              lastName: "Person",
              roles: ["approver"],
              status: "revoked",
            },
          ]}
          members={[
            {
              authUserId: "auth-admin-1",
              canRemove: true,
              customerId: "customer-admin-1",
              email: "admin@example.com",
              firstName: "Admin",
              lastName: "User",
              roles: ["admin", "buyer"],
            },
            {
              authUserId: "auth-buyer-1",
              canRemove: true,
              customerId: "customer-buyer-1",
              email: "buyer@example.com",
              firstName: "Buyer",
              lastName: "User",
              roles: ["buyer"],
            },
            {
              authUserId: "auth-inherited-1",
              canRemove: false,
              customerId: "customer-inherited-1",
              email: "inherited@example.com",
              firstName: "Inherited",
              lastName: "User",
              roles: ["approver"],
            },
          ]}
          reissueInvitationAction={reissueInvitationAction}
          removeMemberAction={removeMemberAction}
        />
      </NextIntlClientProvider>
    );
  });

  return {
    cancelInvitationAction,
    container,
    reissueInvitationAction,
    removeMemberAction,
  };
};

describe(CompanyMembersManagement, () => {
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

  it("renders active members and first-class invitation lifecycle actions", () => {
    const { container } = renderManagement();

    expect(
      [
        "Admin User",
        "Pending Person",
        "Expired Person",
        "Revoked Person",
        "Buyer",
        "Approver",
      ].every((label) => container.textContent?.includes(label))
    ).toBeTruthy();
    expect(
      [...container.querySelectorAll("button")].map(({ textContent }) =>
        textContent?.trim()
      )
    ).toStrictEqual([
      "Remove",
      "Cancel invitation",
      "Send again",
      "Send again",
    ]);
    expect(container.textContent).toContain("You");
    expect(container.textContent).toContain("Managed by parent company");
  });

  it("submits the durable invitation id for cancellation", async () => {
    const { cancelInvitationAction, container } = renderManagement();
    const pendingInput = container.querySelector('input[value="pending-1"]');
    const form = pendingInput?.closest("form");
    if (!(form instanceof HTMLFormElement)) {
      throw new Error("Expected the pending invitation cancellation form");
    }

    act(() => {
      form.requestSubmit();
    });

    await vi.waitFor(() => {
      expect(cancelInvitationAction).toHaveBeenCalledOnce();
    });
    const formData = cancelInvitationAction.mock.calls[0]?.[1];
    expect(formData?.get("companyMemberInvitationId")).toBe("pending-1");
  });
});
