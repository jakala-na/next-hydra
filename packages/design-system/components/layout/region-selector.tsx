"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { cn } from "@repo/design-system/lib/utils";
import { Check, Globe } from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import type { Region } from "./site-header";

const DEFAULT_LOCALE = "en-US";

type RegionSelectorProps = {
  regions: Region[];
};

const escapeForRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * TODO: Get router and pathname from next-intl.
 * @see https://github.com/amannn/next-intl/blob/main/examples/example-app-router/src/components/LocaleSwitcherSelect.tsx
 */
export const RegionSelector = ({ regions }: RegionSelectorProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [isPending, startTransition] = useTransition();

  const currentLocale = useMemo(() => {
    const localeParam = params.locale;

    if (typeof localeParam === "string") {
      return localeParam;
    }

    if (Array.isArray(localeParam) && localeParam.length > 0) {
      return localeParam[0] ?? DEFAULT_LOCALE;
    }

    return DEFAULT_LOCALE;
  }, [params.locale]);

  const activeRegion = useMemo(
    () => regions.find((region) => region.localeCode === currentLocale),
    [regions, currentLocale]
  );

  const resolvePathname = () => {
    if (typeof pathname !== "string" || pathname.length === 0) {
      return `/${currentLocale}`;
    }

    if (pathname.startsWith(`/${currentLocale}`)) {
      return pathname;
    }

    if (currentLocale === DEFAULT_LOCALE) {
      return pathname.startsWith("/")
        ? `/${currentLocale}${pathname}`
        : `/${currentLocale}/${pathname}`;
    }

    return pathname;
  };

  const buildPathWithLocale = (nextLocale: string) => {
    const normalizedPath = resolvePathname();
    const currentLocalePattern = new RegExp(
      `^/${escapeForRegExp(currentLocale)}`
    );

    if (currentLocalePattern.test(normalizedPath)) {
      return normalizedPath.replace(currentLocalePattern, `/${nextLocale}`);
    }

    return `/${nextLocale}`;
  };

  const handleRegionChange = (region: Region) => {
    if (region.localeCode === currentLocale) {
      return;
    }

    const nextPath = buildPathWithLocale(region.localeCode);

    startTransition(() => {
      router.push(nextPath);
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          aria-label={`Current region ${activeRegion?.displayName ?? regions[0]?.displayName ?? ""}`}
          disabled={isPending}
        >
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">
            {activeRegion?.displayCode ?? regions[0]?.displayCode}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {regions.map((region) => (
          <DropdownMenuItem
            key={region.localeCode}
            className={cn(
              "flex cursor-pointer items-center gap-3 py-2",
              region.localeCode === currentLocale && "bg-muted"
            )}
            onClick={() => handleRegionChange(region)}
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
              <span className="truncate font-medium">{region.displayName}</span>
              <span className="text-muted-foreground text-xs">
                {region.currency}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
