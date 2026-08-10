"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { cn } from "@repo/design-system/lib/utils";
import { useLocale } from "@repo/i18n";
import { regions } from "@repo/i18n/config";
import { Link, usePathname } from "@repo/i18n/navigation";
import { Check, Globe } from "lucide-react";
import { useMemo } from "react";

export const RegionSelector = () => {
  const currentLocale = useLocale();
  const pathname = usePathname();

  const activeRegion = useMemo(
    () => regions.find((region) => region.localeCode === currentLocale),
    [currentLocale]
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          aria-label={`Current region ${activeRegion?.displayName ?? regions[0]?.displayName ?? ""}`}
        >
          <Globe className="h-4 w-4" />
          <span className="font-medium">
            {activeRegion?.displayCode ?? regions[0]?.displayCode}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {regions.map((region) => (
          <DropdownMenuItem asChild key={region.localeCode}>
            <Link
              className={cn(
                "flex cursor-pointer items-center gap-3 py-2",
                region.localeCode === currentLocale && "bg-muted"
              )}
              href={pathname}
              locale={region.localeCode}
            >
              <Check
                className={cn(
                  "h-4 w-4 transition-opacity",
                  region.localeCode === currentLocale
                    ? "opacity-100"
                    : "opacity-0"
                )}
              />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">
                  {region.displayName}
                </span>
                <span className="text-muted-foreground text-xs">
                  {region.currency}
                </span>
              </div>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
