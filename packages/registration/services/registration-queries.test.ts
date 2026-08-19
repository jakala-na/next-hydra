import { describe, expect, it } from "@effect/vitest";
import { CommerceAccount } from "@repo/commerce/domain/commerce-account";
import { StoreKey } from "@repo/commerce/store";
import { Effect, Redacted } from "effect";

import { RegistrationReviewerActor } from "../domain/actors";
import { ApprovedDecision, RejectedDecision } from "../domain/approval";
import {
  AddressLine,
  AuthUserId,
  City,
  CommerceBusinessUnitId,
  CommerceCustomerId,
  CompanyName,
  CountryCode,
  Email,
  InvitationId,
  PersonName,
  PostalCode,
  RegistrationId,
} from "../domain/identity";
import {
  ApprovedRegistration,
  AwaitingApprovalRegistration,
  CompanyAddress,
  CompanyRegistrationDetails,
  RejectedRegistration,
} from "../domain/registration";
import type { Registration } from "../domain/registration";
import {
  RegistrationQueries,
  RegistrationQueryInvalidCursor,
} from "./registration-queries";
import type { RegistrationQueryRecord } from "./registration-queries";

const reviewer = new RegistrationReviewerActor({
  actorType: "registration_reviewer",
  authUserId: AuthUserId.make("auth-reviewer-1"),
  email: Redacted.make(Email.make("reviewer@example.com"), {
    label: "email",
  }),
  name: "Registration Reviewer",
});

const makeDetails = ({
  companyName,
  firstName,
  lastName,
  email,
}: {
  readonly companyName: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
}) =>
  new CompanyRegistrationDetails({
    address: new CompanyAddress({
      city: Redacted.make(City.make("New York"), { label: "city" }),
      country: CountryCode.make("US"),
      postalCode: Redacted.make(PostalCode.make("10001"), {
        label: "postalCode",
      }),
      streetName: Redacted.make(AddressLine.make("1 Computation Way"), {
        label: "addressLine",
      }),
    }),
    companyName: CompanyName.make(companyName),
    contactFirstName: Redacted.make(PersonName.make(firstName), {
      label: "personName",
    }),
    contactLastName: Redacted.make(PersonName.make(lastName), {
      label: "personName",
    }),
    email: Redacted.make(Email.make(email), { label: "email" }),
  });

const makeAwaiting = ({
  id,
  updatedAt,
  companyName = "Hydra Supplies",
  firstName = "Ada",
  lastName = "Lovelace",
  email = "ada@example.com",
}: {
  readonly id: string;
  readonly updatedAt: string;
  readonly companyName?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly email?: string;
}) =>
  new AwaitingApprovalRegistration({
    _tag: "AwaitingApprovalRegistration",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    details: makeDetails({ companyName, email, firstName, lastName }),
    id: RegistrationId.make(id),
    status: "awaiting_approval",
    storeKey: StoreKey.make("default-store"),
    updatedAt: new Date(updatedAt),
  });

const makeApproved = (registration: AwaitingApprovalRegistration) =>
  new ApprovedRegistration({
    _tag: "ApprovedRegistration",
    commerceAccount: new CommerceAccount({
      businessUnitId: CommerceBusinessUnitId.make(
        `business-unit-${registration.id}`
      ),
      customerId: CommerceCustomerId.make(`customer-${registration.id}`),
      registrationId: registration.id,
    }),
    createdAt: registration.createdAt,
    decision: new ApprovedDecision({
      actor: reviewer,
      decidedAt: new Date("2026-01-02T00:00:00.000Z"),
      decision: "approved",
    }),
    details: registration.details,
    id: registration.id,
    invitationId: InvitationId.make(`invitation-${registration.id}`),
    status: "approved",
    storeKey: registration.storeKey,
    updatedAt: registration.updatedAt,
  });

const makeRejected = (registration: AwaitingApprovalRegistration) =>
  new RejectedRegistration({
    _tag: "RejectedRegistration",
    createdAt: registration.createdAt,
    decision: new RejectedDecision({
      actor: reviewer,
      decidedAt: new Date("2026-01-02T00:00:00.000Z"),
      decision: "rejected",
    }),
    details: registration.details,
    id: registration.id,
    status: "rejected",
    storeKey: registration.storeKey,
    updatedAt: registration.updatedAt,
  });

const record = (
  registration: Registration,
  {
    createdAt = registration.createdAt,
    id = String(registration.id),
    lastModifiedAt = registration.updatedAt,
  }: {
    readonly createdAt?: Date;
    readonly id?: string;
    readonly lastModifiedAt?: Date;
  } = {}
): RegistrationQueryRecord => ({
  createdAt,
  id,
  lastModifiedAt,
  registration,
});

const listWith = (records: readonly RegistrationQueryRecord[]) =>
  RegistrationQueries.pipe(
    Effect.provide(RegistrationQueries.layerMemoryFrom(records))
  );

describe("RegistrationQueries.layerMemoryFrom", () => {
  it.effect("searches registrations before paginating results", () =>
    Effect.gen(function* () {
      const queries = yield* listWith([
        record(
          makeAwaiting({
            companyName: "Hydra Supplies",
            id: "registration-match-newest",
            updatedAt: "2026-01-04T00:00:00.000Z",
          })
        ),
        record(
          makeAwaiting({
            companyName: "Acme Industrial",
            id: "registration-non-match",
            updatedAt: "2026-01-03T00:00:00.000Z",
          })
        ),
        record(
          makeAwaiting({
            companyName: "Hydra Parts",
            id: "registration-match-oldest",
            updatedAt: "2026-01-02T00:00:00.000Z",
          })
        ),
      ]);

      const result = yield* queries.list({ limit: 2, search: "hydra" });

      expect(
        result.items.map((item) => String(item.registration.id))
      ).toStrictEqual([
        "registration-match-newest",
        "registration-match-oldest",
      ]);
      expect(result.nextCursor).toBeUndefined();
    })
  );

  it.effect("finds pending registrations by normalized email", () =>
    Effect.gen(function* () {
      const awaiting = makeAwaiting({
        email: "Ada@Example.com",
        id: "registration-awaiting",
        updatedAt: "2026-01-03T00:00:00.000Z",
      });
      const approved = makeApproved(
        makeAwaiting({
          email: "grace@example.com",
          id: "registration-approved",
          updatedAt: "2026-01-02T00:00:00.000Z",
        })
      );
      const queries = yield* listWith([record(awaiting), record(approved)]);

      const hasPendingEmail = yield* queries.hasPendingEmail(
        Redacted.make(Email.make(" ada@example.com "), { label: "email" })
      );
      const hasApprovedEmailOnly = yield* queries.hasPendingEmail(
        Redacted.make(Email.make("grace@example.com"), { label: "email" })
      );

      expect(hasPendingEmail).toBeTruthy();
      expect(hasApprovedEmailOnly).toBeFalsy();
    })
  );

  it.effect("filters registrations by status", () =>
    Effect.gen(function* () {
      const awaiting = makeAwaiting({
        id: "registration-awaiting",
        updatedAt: "2026-01-03T00:00:00.000Z",
      });
      const approved = makeApproved(
        makeAwaiting({
          id: "registration-approved",
          updatedAt: "2026-01-02T00:00:00.000Z",
        })
      );
      const rejected = makeRejected(
        makeAwaiting({
          id: "registration-rejected",
          updatedAt: "2026-01-01T00:00:00.000Z",
        })
      );
      const queries = yield* listWith([
        record(awaiting),
        record(approved),
        record(rejected),
      ]);

      const result = yield* queries.list({ status: "approved" });

      expect(
        result.items.map((item) => String(item.registration.id))
      ).toStrictEqual(["registration-approved"]);
      expect(result.items[0]?.registration.status).toBe("approved");
    })
  );

  it.effect("sorts newest-first by last modified time and provider ID", () =>
    Effect.gen(function* () {
      const queries = yield* listWith([
        record(
          makeAwaiting({
            id: "registration-a",
            updatedAt: "2026-01-03T00:00:00.000Z",
          }),
          { id: "custom-object-a" }
        ),
        record(
          makeAwaiting({
            id: "registration-c",
            updatedAt: "2026-01-01T00:00:00.000Z",
          }),
          {
            id: "custom-object-c",
            lastModifiedAt: new Date("2026-01-02T00:00:00.000Z"),
          }
        ),
        record(
          makeAwaiting({
            id: "registration-b",
            updatedAt: "2026-01-01T00:00:00.000Z",
          }),
          {
            id: "custom-object-b",
            lastModifiedAt: new Date("2026-01-02T00:00:00.000Z"),
          }
        ),
      ]);

      const result = yield* queries.list({});

      expect(
        result.items.map((item) => String(item.registration.id))
      ).toStrictEqual(["registration-a", "registration-c", "registration-b"]);
    })
  );

  it.effect("uses cursors without skipping records at page boundaries", () =>
    Effect.gen(function* () {
      const queries = yield* listWith([
        record(
          makeAwaiting({
            id: "registration-a",
            updatedAt: "2026-01-01T00:00:00.000Z",
          })
        ),
        record(
          makeAwaiting({
            id: "registration-b",
            updatedAt: "2026-01-02T00:00:00.000Z",
          })
        ),
        record(
          makeAwaiting({
            id: "registration-c",
            updatedAt: "2026-01-03T00:00:00.000Z",
          })
        ),
        record(
          makeAwaiting({
            id: "registration-d",
            updatedAt: "2026-01-04T00:00:00.000Z",
          })
        ),
      ]);

      const firstPage = yield* queries.list({ limit: 2 });
      expect(firstPage.nextCursor).toBeDefined();
      const cursor = firstPage.nextCursor;
      if (!cursor) {
        throw new Error("Expected a next cursor");
      }
      const secondPage = yield* queries.list({
        cursor,
        limit: 2,
      });

      expect(
        firstPage.items.map((item) => String(item.registration.id))
      ).toStrictEqual(["registration-d", "registration-c"]);
      expect(
        secondPage.items.map((item) => String(item.registration.id))
      ).toStrictEqual(["registration-b", "registration-a"]);
      expect(secondPage.nextCursor).toBeUndefined();
    })
  );

  it.effect("keeps cursor pagination stable across same-time records", () =>
    Effect.gen(function* () {
      const queries = yield* listWith([
        record(
          makeAwaiting({
            id: "registration-a",
            updatedAt: "2026-01-01T00:00:00.000Z",
          }),
          { id: "custom-object-a" }
        ),
        record(
          makeAwaiting({
            id: "registration-c",
            updatedAt: "2026-01-01T00:00:00.000Z",
          }),
          { id: "custom-object-c" }
        ),
        record(
          makeAwaiting({
            id: "registration-b",
            updatedAt: "2026-01-01T00:00:00.000Z",
          }),
          { id: "custom-object-b" }
        ),
      ]);

      const firstPage = yield* queries.list({ limit: 2 });
      expect(firstPage.nextCursor).toBeDefined();
      const cursor = firstPage.nextCursor;
      if (!cursor) {
        throw new Error("Expected a next cursor");
      }
      const secondPage = yield* queries.list({
        cursor,
        limit: 2,
      });

      expect(
        firstPage.items.map((item) => String(item.registration.id))
      ).toStrictEqual(["registration-c", "registration-b"]);
      expect(
        secondPage.items.map((item) => String(item.registration.id))
      ).toStrictEqual(["registration-a"]);
    })
  );

  it.effect("sorts by created time with stable cursor pagination", () =>
    Effect.gen(function* () {
      const queries = yield* listWith([
        record(
          makeAwaiting({
            companyName: "Zenith Tools",
            id: "registration-z",
            updatedAt: "2026-01-03T00:00:00.000Z",
          }),
          {
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            id: "custom-object-z",
          }
        ),
        record(
          makeAwaiting({
            companyName: "Acme Industrial",
            id: "registration-a",
            updatedAt: "2026-01-02T00:00:00.000Z",
          }),
          {
            createdAt: new Date("2026-01-02T00:00:00.000Z"),
            id: "custom-object-a",
          }
        ),
        record(
          makeAwaiting({
            companyName: "Hydra Supplies",
            id: "registration-h-1",
            updatedAt: "2026-01-01T00:00:00.000Z",
          }),
          {
            createdAt: new Date("2026-01-03T00:00:00.000Z"),
            id: "custom-object-h-1",
          }
        ),
        record(
          makeAwaiting({
            companyName: "Hydra Supplies",
            id: "registration-h-2",
            updatedAt: "2026-01-04T00:00:00.000Z",
          }),
          {
            createdAt: new Date("2026-01-04T00:00:00.000Z"),
            id: "custom-object-h-2",
          }
        ),
      ]);

      const firstPage = yield* queries.list({
        limit: 2,
        sort: { direction: "asc", field: "createdAt" },
      });
      expect(firstPage.nextCursor).toBeDefined();
      const cursor = firstPage.nextCursor;
      if (!cursor) {
        throw new Error("Expected a next cursor");
      }
      const secondPage = yield* queries.list({
        cursor,
        limit: 2,
        sort: { direction: "asc", field: "createdAt" },
      });

      expect(
        firstPage.items.map((item) => String(item.registration.id))
      ).toStrictEqual(["registration-z", "registration-a"]);
      expect(
        secondPage.items.map((item) => String(item.registration.id))
      ).toStrictEqual(["registration-h-1", "registration-h-2"]);
    })
  );

  it.effect("rejects cursors created for a different sort", () =>
    Effect.gen(function* () {
      const queries = yield* listWith([
        record(
          makeAwaiting({
            companyName: "Acme Industrial",
            id: "registration-a",
            updatedAt: "2026-01-01T00:00:00.000Z",
          })
        ),
        record(
          makeAwaiting({
            companyName: "Hydra Supplies",
            id: "registration-b",
            updatedAt: "2026-01-02T00:00:00.000Z",
          })
        ),
      ]);
      const firstPage = yield* queries.list({ limit: 1 });
      const cursor = firstPage.nextCursor;
      if (!cursor) {
        throw new Error("Expected a next cursor");
      }

      const error = yield* queries
        .list({
          cursor,
          sort: { direction: "asc", field: "createdAt" },
        })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(RegistrationQueryInvalidCursor);
    })
  );

  it.effect("fails malformed cursors instead of restarting pagination", () =>
    Effect.gen(function* () {
      const queries = yield* listWith([
        record(
          makeAwaiting({
            id: "registration-a",
            updatedAt: "2026-01-01T00:00:00.000Z",
          })
        ),
      ]);

      const error = yield* queries
        .list({ cursor: "not-a-registration-query-cursor" })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(RegistrationQueryInvalidCursor);
      expect(error.operation).toBe("list");
    })
  );
});
