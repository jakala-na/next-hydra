"use client";
import { Bolt } from "lucide-react";
import type { Route } from "next";
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

export type SiteHeaderProps = {
  MainNavigation: React.ReactNode;
  RegionSelectorSlot: React.ReactNode;
  Search?: React.ReactNode;
  BusinessUnitSwitcher?: React.ReactNode;
  MobileMenuSlot?: React.ReactNode;
  CartSlot: React.ReactNode;
  AccountSlot: React.ReactNode;
};

export function SiteHeader({
  RegionSelectorSlot,
  Search,
  BusinessUnitSwitcher,
  MobileMenuSlot,
  MainNavigation,
  CartSlot,
  AccountSlot,
}: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background">
      <div className="bg-accent text-accent-foreground">
        <nav
          aria-label="Utility navigation"
          className="container flex items-center justify-between gap-3 py-1 text-xs sm:text-sm"
        >
          {RegionSelectorSlot}
          <div className="flex items-center gap-2">
            {BusinessUnitSwitcher}
            {AccountSlot}
          </div>
        </nav>
      </div>

      <div className="container flex h-16 items-center justify-between gap-4 py-2">
        <div className="flex h-full items-center gap-6">
          <Link href={"/" as Route} className="flex items-center space-x-2">
            <Bolt className="h-8 w-8" />
            <span className="font-bold text-xl">TitanMach</span>
          </Link>
          {MainNavigation}
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden lg:block">{Search}</div>
          {CartSlot}
          {MobileMenuSlot}
        </div>
      </div>
    </header>
  );
}
