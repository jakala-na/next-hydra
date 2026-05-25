"use client";

import { useAuth } from "@repo/auth-workos/client";
import { BusinessUnitSwitcher as BusinessUnitSwitcherView } from "@repo/design-system/components/layout/business-unit-switcher";

const mockBusinessUnits = [
  {
    id: "1",
    name: "Business Unit 1",
    role: "Admin",
  },
  {
    id: "2",
    name: "Business Unit 2",
    role: "User",
  },
] as const;

const currentBusinessUnit = mockBusinessUnits[0];

export function BusinessUnitSwitcher() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <BusinessUnitSwitcherView
      currentBusinessUnitId={currentBusinessUnit.id}
      items={mockBusinessUnits}
      onSwitchBusinessUnit={() => undefined}
    />
  );
}
