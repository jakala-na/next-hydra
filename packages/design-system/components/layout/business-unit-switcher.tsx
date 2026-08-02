"use client";

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

export type BusinessUnitSwitcherItem = {
  readonly id: string;
  readonly label: string;
  readonly role?: string;
};

export type BusinessUnitSwitcherProps = {
  readonly currentBusinessUnitId?: string;
  readonly items: readonly BusinessUnitSwitcherItem[];
  readonly label?: string;
  readonly onSwitchBusinessUnit?: (businessUnitId: string) => void;
};

export function BusinessUnitSwitcher({
  currentBusinessUnitId,
  items,
  label = "Switch Business Unit",
  onSwitchBusinessUnit,
}: BusinessUnitSwitcherProps) {
  const currentBusinessUnit = items.find(
    (unit) => unit.id === currentBusinessUnitId
  );

  if (items.length === 0 || (items.length === 1 && currentBusinessUnit)) {
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
          <span className="truncate">
            {currentBusinessUnit?.label ?? label}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[280px]">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((unit) => (
          <DropdownMenuItem
            key={unit.id}
            onClick={() => onSwitchBusinessUnit?.(unit.id)}
            className="flex cursor-pointer items-start gap-2 py-3"
          >
            <Check
              className={`mt-0.5 h-4 w-4 shrink-0 ${
                unit.id === currentBusinessUnit?.id
                  ? "opacity-100"
                  : "opacity-0"
              }`}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-medium">{unit.label}</span>
              {unit.role ? (
                <span className="text-muted-foreground text-xs">
                  {unit.role}
                </span>
              ) : null}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
