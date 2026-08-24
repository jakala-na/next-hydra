import { describe, expect, it } from "vitest";

import { registrationApprovalUrl } from "./registration-emails-live";

describe(registrationApprovalUrl, () => {
  it("links approvers to the standalone admin application", () => {
    expect(
      registrationApprovalUrl("https://admin.example.com", "registration-1")
    ).toBe(
      "https://admin.example.com/registration-approvals?registrationId=registration-1"
    );
  });
});
