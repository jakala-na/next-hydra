import { describe, expect, it } from "vitest";

import { createRegistrationScenario } from "./registration-scenario";

describe(createRegistrationScenario, () => {
  it("creates isolated state for each scenario", () => {
    const first = createRegistrationScenario();
    const second = createRegistrationScenario();

    first.companyMemberInvitations.set("Grace Hopper", {
      email: "grace@example.test",
      firstName: "Grace",
      lastName: "Hopper",
      roles: ["Buyer", "Approver"],
    });

    expect(first.companies).not.toBe(second.companies);
    expect(first.companyMemberInvitations).not.toBe(
      second.companyMemberInvitations
    );
    expect(first.companyMembers).not.toBe(second.companyMembers);
    expect(first.registrations).not.toBe(second.registrations);
    expect(second.companyMemberInvitations.size).toBe(0);
  });
});
