"use client";

import { useAuth } from "@repo/auth/client";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Building2, Check, ChevronDown } from "lucide-react";

const businessUnits = [
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
];

const user = {
  id: "1",
  name: "John Doe",
  email: "john.doe@example.com",
  businessUnits,
  currentBusinessUnit: businessUnits[0],
};

const switchBusinessUnit = (businessUnitId: string) => {
  console.log(`Switching to business unit ${businessUnitId}`);
};

export function BusinessUnitSwitcher() {
  const { isSignedIn } = useAuth();

  if (!isSignedIn || businessUnits.length <= 1) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="max-w-[200px] gap-2 bg-transparent"
        >
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="truncate">{user.currentBusinessUnit?.name}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[280px]">
        <DropdownMenuLabel>Switch Business Unit</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.businessUnits.map((unit) => (
          <DropdownMenuItem
            key={unit.id}
            onClick={() => switchBusinessUnit(unit.id)}
            className="flex cursor-pointer items-start gap-2 py-3"
          >
            <Check
              className={`mt-0.5 h-4 w-4 shrink-0 ${
                unit.id === user.currentBusinessUnit?.id
                  ? "opacity-100"
                  : "opacity-0"
              }`}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-medium">{unit.name}</span>
              <span className="text-muted-foreground text-xs">{unit.role}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
