import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Input } from "@repo/design-system/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@repo/design-system/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import type {
  RegistrationDetail,
  RegistrationStatus,
} from "@repo/registration/domain/types";
import { formatDistanceToNowStrict } from "date-fns";
import type { Route } from "next";
import Link from "next/link";
import { RegistrationDecisionSheet } from "@/components/admin/registration-decision-sheet";
import { RegistrationStatusBadge } from "@/components/admin/registration-status-badge";
import {
  ADMIN_REGISTRATION_DECIDE_PERMISSION,
  ADMIN_REGISTRATION_READ_PERMISSION,
  requireAdminPermission,
} from "@/lib/admin-auth";
import {
  getAdminRegistration,
  listAdminRegistrations,
} from "@/lib/admin-registration";

type AdminSearchParams = Promise<Record<string, string | string[] | undefined>>;

const PAGE_SIZE = 20;
const statusOptions = ["pending", "approved", "rejected"] as const;

const isStatus = (value?: string): value is (typeof statusOptions)[number] =>
  Boolean(
    value && statusOptions.includes(value as (typeof statusOptions)[number])
  );

const getSingleParam = (
  value: string | string[] | undefined
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
};

const getBaseParams = ({
  status,
  search,
}: {
  status?: RegistrationStatus;
  search?: string;
}) => {
  const params = new URLSearchParams();

  if (status) {
    params.set("status", status);
  }

  if (search) {
    params.set("search", search);
  }

  return params;
};

const buildAdminHref = ({
  status,
  search,
  cursor,
  cursorStack,
  registrationId,
}: {
  status?: RegistrationStatus;
  search?: string;
  cursor?: string;
  cursorStack?: string[];
  registrationId?: string;
}) => {
  const params = getBaseParams({ status, search });

  if (cursor) {
    params.set("cursor", cursor);
  }

  if (cursorStack && cursorStack.length > 0) {
    params.set("cursorStack", cursorStack.join("."));
  }

  if (registrationId) {
    params.set("registrationId", registrationId);
  }

  const query = params.toString();
  return query.length > 0
    ? `/admin/registration-approvals?${query}`
    : "/admin/registration-approvals";
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const formatLastUpdated = (value: string) => {
  const date = new Date(value);

  return `${formatDistanceToNowStrict(date, { addSuffix: true })} (${formatDateTime(value)})`;
};

const getReviewSummary = (registration: RegistrationDetail) =>
  `${registration.contactFirstName} ${registration.contactLastName} - ${registration.email}`;

export default async function AdminRegistrationsPage({
  searchParams,
}: {
  searchParams: AdminSearchParams;
}) {
  const session = await requireAdminPermission(
    ADMIN_REGISTRATION_READ_PERMISSION
  );
  const params = await searchParams;
  const rawStatus = getSingleParam(params.status);
  const rawSearch = getSingleParam(params.search)?.trim();
  const currentCursor = getSingleParam(params.cursor);
  const registrationId = getSingleParam(params.registrationId);
  const cursorStack =
    getSingleParam(params.cursorStack)
      ?.split(".")
      .filter((value) => value.length > 0) ?? [];
  const status = isStatus(rawStatus) ? rawStatus : "pending";
  const search = rawSearch && rawSearch.length > 0 ? rawSearch : undefined;
  const canDecide =
    session.permissions?.includes(ADMIN_REGISTRATION_DECIDE_PERMISSION) ??
    false;

  const [listResult, selectedRegistration] = await Promise.all([
    listAdminRegistrations({
      status,
      search,
      cursor: currentCursor,
      limit: PAGE_SIZE,
    }),
    registrationId
      ? getAdminRegistration({ registrationId })
      : Promise.resolve(null),
  ]);

  const previousHref = currentCursor
    ? buildAdminHref({
        status,
        search,
        cursor: cursorStack.at(-1),
        cursorStack: cursorStack.slice(0, -1),
      })
    : undefined;
  const nextHref = listResult.nextCursor
    ? buildAdminHref({
        status,
        search,
        cursor: listResult.nextCursor,
        cursorStack: currentCursor
          ? [...cursorStack, currentCursor]
          : cursorStack,
      })
    : undefined;
  const closeHref = buildAdminHref({
    status,
    search,
    cursor: currentCursor,
    cursorStack,
  });

  return (
    <div className="grid gap-6">
      <section>
        <Card className="border-stone-300 bg-white/90 shadow-sm backdrop-blur">
          <CardHeader className="gap-3">
            <p className="text-[11px] text-stone-500 uppercase tracking-[0.3em]">
              Registration review
            </p>
            <CardTitle className="text-3xl text-stone-950">
              Review registrations
            </CardTitle>
            <CardDescription className="max-w-2xl text-base text-stone-600 leading-7">
              Check each registration, review the submitted details, and record
              an approval or rejection reason in one place.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      <Card className="border-stone-300 bg-white/95 shadow-sm">
        <CardHeader className="gap-4 border-stone-200 border-b">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-2">
              <CardTitle className="text-stone-950 text-xl">
                Approval queue
              </CardTitle>
              <CardDescription>
                Showing {listResult.items.length} registration
                {listResult.items.length === 1 ? "" : "s"}
                {search ? ` for "${search}"` : ""}.
              </CardDescription>
            </div>

            <form className="flex flex-col gap-3 sm:flex-row" method="get">
              <Input
                defaultValue={search}
                name="search"
                placeholder="Search company, contact, or email"
              />
              <input name="status" type="hidden" value={status} />
              <Button type="submit">Search</Button>
            </form>
          </div>

          <div className="flex flex-wrap gap-2">
            {statusOptions.map((option) => {
              const href = buildAdminHref({
                status: option,
                search,
              });

              return (
                <Button
                  asChild
                  key={option}
                  variant={option === status ? "default" : "outline"}
                >
                  <Link href={href as Route}>
                    {option.charAt(0).toUpperCase()}
                    {option.slice(1)}
                  </Link>
                </Button>
              );
            })}
          </div>
        </CardHeader>

        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-6">Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last updated</TableHead>
                <TableHead className="px-6 text-right">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listResult.items.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="px-6 py-12 text-muted-foreground"
                    colSpan={5}
                  >
                    No registrations match the current filter.
                  </TableCell>
                </TableRow>
              ) : (
                listResult.items.map((registration) => {
                  const rowHref = buildAdminHref({
                    status,
                    search,
                    cursor: currentCursor,
                    cursorStack,
                    registrationId: registration.registrationId,
                  });

                  return (
                    <TableRow key={registration.registrationId}>
                      <TableCell className="px-6 py-4 align-top">
                        <div className="grid gap-1">
                          <p className="font-medium text-sm text-stone-950">
                            {registration.companyName}
                          </p>
                          <p className="text-muted-foreground text-sm">
                            {registration.vatId || "No VAT ID supplied"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 align-top text-sm text-stone-700">
                        {getReviewSummary(registration)}
                      </TableCell>
                      <TableCell className="py-4 align-top">
                        <RegistrationStatusBadge status={registration.status} />
                      </TableCell>
                      <TableCell className="py-4 align-top text-sm text-stone-700">
                        {formatLastUpdated(registration.updatedAt)}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right align-top">
                        <Button asChild size="sm" variant="outline">
                          <Link href={rowHref as Route}>Open review</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <div className="border-stone-200 border-t px-6 py-4">
            <Pagination className="justify-end">
              <PaginationContent>
                {previousHref ? (
                  <PaginationItem>
                    <PaginationPrevious href={previousHref} />
                  </PaginationItem>
                ) : null}
                {nextHref ? (
                  <PaginationItem>
                    <PaginationNext href={nextHref} />
                  </PaginationItem>
                ) : null}
              </PaginationContent>
            </Pagination>
          </div>
        </CardContent>
      </Card>

      <RegistrationDecisionSheet
        canDecide={canDecide}
        closeHref={closeHref}
        registration={selectedRegistration}
      />
    </div>
  );
}
