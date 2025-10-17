import { RegionSelector } from "@repo/design-system/components/layout/region-selector";
import { Bolt } from "lucide-react";
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
  displayCode: string;
  displayName: string;
  currency: string;
  localeCode: string;
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
