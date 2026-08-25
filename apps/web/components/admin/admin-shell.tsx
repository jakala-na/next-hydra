"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@repo/design-system/components/ui/sidebar";
import {
  LayoutGridIcon,
  ShieldCheckIcon,
  UserRoundCogIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  {
    description: "Start here",
    href: "/admin",
    icon: LayoutGridIcon,
    label: "Overview",
  },
  {
    description: "Review requests",
    href: "/admin/registration-approvals",
    icon: ShieldCheckIcon,
    label: "Registration approvals",
  },
  {
    description: "Support tools",
    href: "/admin/user-impersonation",
    icon: UserRoundCogIcon,
    label: "User impersonation",
  },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <SidebarProvider>
      <Sidebar collapsible="none" variant="inset">
        <SidebarHeader className="gap-4 border-sidebar-border border-b px-3 py-4">
          <div className="grid gap-1 px-2">
            <p className="text-[11px] text-sidebar-foreground/60 uppercase tracking-[0.3em]">
              Workspace
            </p>
            <p className="font-medium text-sidebar-foreground text-sm">
              Admin tools
            </p>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Experiences</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navigationItems.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    item.href === "/admin"
                      ? pathname === item.href
                      : pathname.startsWith(item.href);

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive} size="lg">
                        <Link href={item.href}>
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarSeparator />
      </Sidebar>

      <SidebarInset className="bg-[linear-gradient(180deg,_#f7f7f5_0%,_#edece6_100%)]">
        <div className="flex items-center gap-3 border-stone-200/80 border-b bg-white/70 px-4 py-3 backdrop-blur sm:px-6">
          <SidebarTrigger className="md:hidden" />
          <div className="grid gap-0.5">
            <p className="font-medium text-sm text-stone-950">Admin tools</p>
            <p className="text-sm text-stone-600">
              Move between review and support workspaces.
            </p>
          </div>
        </div>

        <div className="px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto grid max-w-7xl gap-6">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
