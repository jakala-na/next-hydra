import { describe, expect, it } from "vitest";

import { createRegistrationScenario } from "./registration-scenario";

describe(createRegistrationScenario, () => {
  it("creates isolated state for each scenario", () => {
    const first = createRegistrationScenario();
    const second = createRegistrationScenario();

    first.companyMemberInvitee = {
      email: "grace@example.test",
      firstName: "Grace",
      lastName: "Hopper",
    };

    expect(first.companies).not.toBe(second.companies);
    expect(first.companyMembers).not.toBe(second.companyMembers);
    expect(first.registrations).not.toBe(second.registrations);
    expect(second.companyMemberInvitee).toBeUndefined();
  });
});
