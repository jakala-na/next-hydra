"use client";

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
import { Menu } from "lucide-react";
import { DynamicIcon } from "lucide-react/dynamic";
import Link from "next/link";

import type { NavigationItem } from "./navigation";

type MobileMenuProps = {
  navigationItems: NavigationItem[];
};

export function MobileMenu({ navigationItems }: MobileMenuProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[300px] overflow-y-auto sm:w-[400px]"
      >
        <SheetHeader className="px-4 sm:px-6">
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <div className="mt-8 flex flex-col gap-4 px-4 pb-6 sm:px-6">
          <div className="border-b pb-4">
            <SearchAutocomplete />
          </div>
          <div className="flex flex-col gap-2">
            {navigationItems.map((item, index) => {
              const hasChildren =
                Array.isArray(item.children) && item.children.length > 0;

              if (hasChildren) {
                const accordionValue = `item-${index.toString()}`;

                return (
                  <Accordion
                    // eslint-disable-next-line react/no-array-index-key
                    key={`accordion-${index.toString()}`}
                    type="single"
                    collapsible
                    className="w-full"
                  >
                    <AccordionItem
                      value={accordionValue}
                      className="border-b-0"
                    >
                      <AccordionTrigger className="py-2 font-semibold text-lg hover:no-underline">
                        {item.title}
                      </AccordionTrigger>
                      <AccordionContent className="mt-2">
                        <div className="flex flex-col gap-1">
                          {item.href ? (
                            <Link
                              href={item.href}
                              className="group flex gap-3 rounded-md border-transparent border-l-2 p-3 font-medium text-sm transition-colors hover:border-primary hover:bg-neutral-100"
                            >
                              <span className="text-primary">
                                View all {item.title}
                              </span>
                            </Link>
                          ) : null}
                          {item.children?.map((child, childIndex) => (
                            <Link
                              // eslint-disable-next-line react/no-array-index-key
                              key={`child-${childIndex.toString()}`}
                              href={child.href}
                              className="group flex gap-3 rounded-md border-transparent border-l-2 p-3 transition-colors hover:border-primary hover:bg-neutral-100"
                            >
                              {child.icon ? (
                                <div className="text-foreground transition-colors group-hover:text-primary">
                                  <DynamicIcon
                                    name={child.icon}
                                    className="size-5 shrink-0"
                                  />
                                </div>
                              ) : null}
                              <div>
                                <div className="font-semibold text-foreground text-sm">
                                  {child.title}
                                </div>
                                {child.description ? (
                                  <p className="text-muted-foreground text-xs leading-snug">
                                    {child.description}
                                  </p>
                                ) : null}
                              </div>
                            </Link>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                );
              }

              if (item.href) {
                return (
                  <Link
                    // eslint-disable-next-line react/no-array-index-key
                    key={`link-${index.toString()}`}
                    href={item.href}
                    className="py-2 font-medium text-lg transition-colors hover:text-primary"
                  >
                    {item.title}
                  </Link>
                );
              }

              return null;
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
