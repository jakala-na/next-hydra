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
import type { RegistrationDetailView } from "@repo/registration";
import { RegistrationDecisionSheet } from "@repo/registration/components/admin/registration-decision-sheet";
import {
  registrationStatusFilters,
  registrationStatusLabels,
} from "@repo/registration/components/admin/registration-lifecycle";
import { RegistrationStatusBadge } from "@repo/registration/components/admin/registration-status-badge";
import type { RegistrationDetailStatus } from "@repo/registration/components/admin/registration-view-models";

import {
  ADMIN_REGISTRATION_DECIDE_PERMISSION,
  ADMIN_REGISTRATION_READ_PERMISSION,
  requireAdminPermission,
} from "@/lib/admin-auth";
import {
  getAdminRegistration,
  listAdminRegistrations,
} from "@/lib/admin-registration";
import {
  approveRegistration,
  rejectRegistration,
} from "@/lib/admin-registration-actions";

type AdminSearchParams = Promise<Record<string, string | string[] | undefined>>;

const PAGE_SIZE = 20;
const registrationStatusFilterSet: ReadonlySet<string> = new Set(
  registrationStatusFilters
);
const isStatus = (
  value?: string
): value is (typeof registrationStatusFilters)[number] =>
  value !== undefined && registrationStatusFilterSet.has(value);

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
  status?: RegistrationDetailStatus;
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
  status?: RegistrationDetailStatus;
  search?: string;
  cursor?: string;
  cursorStack?: string[];
  registrationId?: string;
}) => {
  const params = getBaseParams({ search, status });

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
    ? `/registration-approvals?${query}`
    : "/registration-approvals";
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "numeric",
    year: "2-digit",
  }).format(new Date(value));

const getReviewSummary = (registration: RegistrationDetailView) =>
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
  const status = isStatus(rawStatus) ? rawStatus : "awaiting_approval";
  const search = rawSearch && rawSearch.length > 0 ? rawSearch : undefined;
  const canDecide = session.permissions.has(
    ADMIN_REGISTRATION_DECIDE_PERMISSION
  );

  const [listResult, selectedRegistration] = await Promise.all([
    listAdminRegistrations({
      cursor: currentCursor,
      limit: PAGE_SIZE,
      search,
      status,
    }),
    registrationId
      ? getAdminRegistration({ registrationId })
      : Promise.resolve(null),
  ]);

  const previousHref = currentCursor
    ? buildAdminHref({
        cursor: cursorStack.at(-1),
        cursorStack: cursorStack.slice(0, -1),
        search,
        status,
      })
    : undefined;
  const nextHref = listResult.nextCursor
    ? buildAdminHref({
        cursor: listResult.nextCursor,
        cursorStack: currentCursor
          ? [...cursorStack, currentCursor]
          : cursorStack,
        search,
        status,
      })
    : undefined;
  const closeHref = buildAdminHref({
    cursor: currentCursor,
    cursorStack,
    search,
    status,
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
            {registrationStatusFilters.map((option) => {
              const href = buildAdminHref({
                search,
                status: option,
              });

              return (
                <Button
                  asChild
                  key={option}
                  variant={option === status ? "default" : "outline"}
                >
                  <a href={href}>{registrationStatusLabels[option]}</a>
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
                <TableHead className="hidden xl:table-cell">Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20 text-xs">Updated</TableHead>
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
                    cursor: currentCursor,
                    cursorStack,
                    registrationId: registration.registrationId,
                    search,
                    status,
                  });

                  return (
                    <TableRow key={registration.registrationId}>
                      <TableCell className="whitespace-normal px-6 py-4 align-top">
                        <div className="grid gap-1">
                          <p className="font-medium text-sm text-stone-950">
                            {registration.companyName}
                          </p>
                          <p className="text-muted-foreground text-sm">
                            {registration.vatId || "No VAT ID supplied"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden py-4 align-top text-sm text-stone-700 xl:table-cell">
                        {getReviewSummary(registration)}
                      </TableCell>
                      <TableCell className="py-4 align-top">
                        <RegistrationStatusBadge status={registration.status} />
                      </TableCell>
                      <TableCell className="py-4 align-top text-stone-600 text-xs">
                        {formatDate(registration.updatedAt)}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right align-top">
                        <Button asChild size="sm" variant="outline">
                          <a href={rowHref}>Open review</a>
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
        approve={approveRegistration}
        canDecide={canDecide}
        closeHref={closeHref}
        registration={selectedRegistration}
        reject={rejectRegistration}
      />
    </div>
  );
}
