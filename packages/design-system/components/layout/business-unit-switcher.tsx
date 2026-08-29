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
  readonly roles?: readonly string[];
};

export type BusinessUnitSwitcherProps = {
  readonly currentBusinessUnitId?: string;
  readonly items: readonly BusinessUnitSwitcherItem[];
  readonly label?: string;
  readonly onSwitchBusinessUnit?: (
    businessUnitId: string
  ) => void | Promise<void>;
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

  if (items.length === 0) {
    return null;
  }

  if (items.length === 1 && currentBusinessUnit) {
    return (
      <fieldset
        aria-label="Company switcher"
        className="flex h-8 max-w-[200px] items-center gap-2 rounded-md border bg-background px-2.5 font-medium text-sm shadow-xs"
        title={`Operating as ${currentBusinessUnit.label}`}
      >
        <Building2 className="h-4 w-4 shrink-0" />
        <span className="sr-only">Operating as </span>
        <span className="truncate">{currentBusinessUnit.label}</span>
      </fieldset>
    );
  }

  return (
    <fieldset aria-label="Company switcher">
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
              onClick={() => {
                void onSwitchBusinessUnit?.(unit.id);
              }}
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
                {unit.roles && unit.roles.length > 0 ? (
                  <span className="text-muted-foreground text-xs">
                    {unit.roles.join(", ")}
                  </span>
                ) : null}
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </fieldset>
  );
}
