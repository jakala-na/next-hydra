import { Badge } from "@repo/design-system/components/ui/badge";
import { cn } from "@repo/design-system/lib/utils";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export interface CustomerAreaNavigationItem {
  readonly current?: boolean;
  readonly href?: string;
  readonly label: string;
  readonly statusLabel?: string;
}

export interface CustomerAreaProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly companyLabel: string;
  readonly description: string;
  readonly navigation: readonly CustomerAreaNavigationItem[];
  readonly title: string;
}

export const CustomerArea = ({
  children,
  className,
  companyLabel,
  description,
  navigation,
  title,
}: CustomerAreaProps) => (
  <main
    className={cn("mx-auto w-full max-w-6xl px-4 py-8 sm:py-12", className)}
  >
    <header className="mb-8 grid gap-2">
      <p className="font-medium text-primary text-sm">{companyLabel}</p>
      <h1 className="font-semibold text-3xl tracking-tight">{title}</h1>
      <p className="max-w-2xl text-muted-foreground">{description}</p>
    </header>
    <div className="grid gap-8 md:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label={title}>
        <ul className="flex gap-2 overflow-x-auto pb-2 md:grid md:overflow-visible md:pb-0">
          {navigation.map((item) => (
            <li className="shrink-0" key={item.label}>
              {item.href === undefined ? (
                <span
                  aria-disabled="true"
                  className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-muted-foreground text-sm opacity-70"
                >
                  {item.label}
                  {item.statusLabel === undefined ? null : (
                    <Badge variant="outline">{item.statusLabel}</Badge>
                  )}
                </span>
              ) : (
                // SAFETY: Customer-area routes are server-authored application paths, never untrusted input.
                <Link
                  aria-current={item.current ? "page" : undefined}
                  className="block rounded-md px-3 py-2 font-medium text-sm transition-colors hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
                  href={item.href as Route}
                >
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  </main>
);
