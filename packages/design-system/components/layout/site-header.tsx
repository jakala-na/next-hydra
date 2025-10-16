import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Bolt, Globe } from "lucide-react";
import Link from "next/link";

export type NavItem = {
  title: string;
  description?: string;
  href: string;
  icon?: React.ReactNode;
  children?: NavItem[];
};

export type CartSummaryProps = {
  count: number;
  href: string;
  subtotal?: { value: number; currency: string };
};

export type AccountProps = {
  isAuthenticated: boolean;
  displayName?: string;
  avatarUrl?: string;
  hrefs: Partial<{
    signIn: string;
    profile: string;
    orders: string;
    signOut: string;
  }>;
};

export type Region = {
  code: string;
  name: string;
  currency: string;
  locale: string;
};

export type SiteHeaderProps = {
  MainNavigation: React.ReactNode;
  regions: Region[];
  Search?: React.ReactNode;
  BusinessUnitSwitcher?: React.ReactNode;
  MobileMenu?: React.ReactNode;
  CartSlot: React.ReactNode;
  AccountSlot: React.ReactNode;
};

export function SiteHeader({
  regions,
  Search,
  BusinessUnitSwitcher,
  MobileMenu,
  MainNavigation,
  CartSlot,
  AccountSlot,
}: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center space-x-2">
            <Bolt className="h-8 w-8" />
            <span className="font-bold text-xl">TitanMach</span>
          </Link>
          {MainNavigation}
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden lg:block">{Search}</div>
          <div className="hidden lg:block">{BusinessUnitSwitcher}</div>

          <RegionSelector regions={regions} />

          {CartSlot}
          {AccountSlot}
          {MobileMenu}
        </div>
      </div>
    </header>
  );
}

function RegionSelector({ regions }: { regions: Region[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">{regions[0]?.code}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {regions.map((r) => (
          <DropdownMenuItem key={r.code} className="cursor-pointer">
            <div className="flex flex-col">
              <span className="font-medium">{r.name}</span>
              <span className="text-muted-foreground text-xs">
                {r.currency}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
