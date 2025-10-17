"use client";

import { useAuth } from "@repo/auth/client";
import { BusinessUnitSwitcher } from "@repo/design-system/components/layout/business-unit-switcher";
import { SearchAutocomplete } from "@repo/design-system/components/layout/search-autocomplete";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/design-system/components/ui/accordion";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/design-system/components/ui/sheet";

import {
  BookOpen,
  Cog,
  FileText,
  GraduationCap,
  Headphones,
  Menu,
  Shield,
  Truck,
  Wrench,
} from "lucide-react";
import Link from "next/link";

const productCategories = [
  {
    title: "Excavators",
    description: "Heavy-duty excavators for construction and mining",
    icon: <Truck className="size-5 shrink-0" />,
    url: "/products?category=excavators",
  },
  {
    title: "Bulldozers",
    description: "Powerful bulldozers for earthmoving operations",
    icon: <Cog className="size-5 shrink-0" />,
    url: "/products?category=bulldozers",
  },
  {
    title: "Loaders",
    description: "Wheel and track loaders for material handling",
    icon: <Wrench className="size-5 shrink-0" />,
    url: "/products?category=loaders",
  },
  {
    title: "Cranes",
    description: "Mobile and tower cranes for lifting operations",
    icon: <FileText className="size-5 shrink-0" />,
    url: "/products?category=cranes",
  },
];

const resourcesMenu = [
  {
    title: "Support Center",
    description: "Get help with your equipment and find solutions",
    icon: <Headphones className="size-5 shrink-0" />,
    url: "/support",
  },
  {
    title: "Training & Certification",
    description: "Operator training programs and certifications",
    icon: <GraduationCap className="size-5 shrink-0" />,
    url: "/training",
  },
  {
    title: "Documentation",
    description: "Manuals, guides, and technical specifications",
    icon: <BookOpen className="size-5 shrink-0" />,
    url: "/support#documentation",
  },
  {
    title: "Warranty & Service",
    description: "Warranty information and service agreements",
    icon: <Shield className="size-5 shrink-0" />,
    url: "/warranty",
  },
];

export function MobileMenu({
  AccountMenuSlot,
}: {
  AccountMenuSlot: React.ReactNode;
}) {
  const { isSignedIn } = useAuth();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[300px] overflow-y-auto sm:w-[400px]"
      >
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <div className="mt-8 flex flex-col gap-4">
          <div className="border-b pb-4">
            <SearchAutocomplete />
          </div>

          {isSignedIn && (
            <div className="border-b pb-4">
              <BusinessUnitSwitcher />
            </div>
          )}

          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="products" className="border-b-0">
              <AccordionTrigger className="py-2 font-semibold text-lg hover:no-underline">
                Products
              </AccordionTrigger>
              <AccordionContent className="mt-2">
                <div className="flex flex-col gap-1">
                  {productCategories.map((item) => (
                    <Link
                      key={item.title}
                      href={item.url}
                      className="flex gap-3 rounded-md border-transparent border-l-2 p-3 transition-colors hover:border-primary hover:bg-neutral-100"
                    >
                      <div className="text-foreground transition-colors group-hover:text-primary">
                        {item.icon}
                      </div>
                      <div>
                        <div className="font-semibold text-foreground text-sm">
                          {item.title}
                        </div>
                        <p className="text-muted-foreground text-xs leading-snug">
                          {item.description}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="resources" className="border-b-0">
              <AccordionTrigger className="py-2 font-semibold text-lg hover:no-underline">
                Resources
              </AccordionTrigger>
              <AccordionContent className="mt-2">
                <div className="flex flex-col gap-1">
                  {resourcesMenu.map((item) => (
                    <Link
                      key={item.title}
                      href={item.url}
                      className="flex gap-3 rounded-md border-transparent border-l-2 p-3 transition-colors hover:border-primary hover:bg-neutral-100"
                    >
                      <div className="text-foreground transition-colors group-hover:text-primary">
                        {item.icon}
                      </div>
                      <div>
                        <div className="font-semibold text-foreground text-sm">
                          {item.title}
                        </div>
                        <p className="text-muted-foreground text-xs leading-snug">
                          {item.description}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <nav className="flex flex-col gap-2">
            <Link
              href="/solutions"
              className="py-2 font-medium text-lg transition-colors hover:text-primary"
            >
              Solutions
            </Link>
            <Link
              href="/industries"
              className="py-2 font-medium text-lg transition-colors hover:text-primary"
            >
              Industries
            </Link>
            <Link
              href="/about"
              className="py-2 font-medium text-lg transition-colors hover:text-primary"
            >
              About
            </Link>
          </nav>

          <div className="flex flex-col gap-2 border-t pt-4">
            {AccountMenuSlot}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
