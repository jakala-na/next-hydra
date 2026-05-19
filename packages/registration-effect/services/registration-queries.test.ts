import { describe, expect, it } from "@effect/vitest";
import { Effect, Redacted } from "effect";
import { RegistrationReviewerActor } from "../domain/actors";
import { ApprovedDecision, RejectedDecision } from "../domain/approval";
import { CommerceAccount } from "../domain/commerce";
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
  PendingRegistrationInvitation,
  RegistrationApprovalIntent,
} from "../domain/invitations";
import {
  ApprovedRegistration,
  AwaitingApprovalRegistration,
  CompanyAddress,
  CompanyRegistrationDetails,
  type Registration,
  RejectedRegistration,
} from "../domain/registration";
import {
  RegistrationQueries,
  RegistrationQueryInvalidCursor,
  type RegistrationQueryRecord,
} from "./registration-queries";

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
    companyName: CompanyName.make(companyName),
    contactFirstName: Redacted.make(PersonName.make(firstName), {
      label: "personName",
    }),
    contactLastName: Redacted.make(PersonName.make(lastName), {
      label: "personName",
    }),
    email: Redacted.make(Email.make(email), { label: "email" }),
    address: new CompanyAddress({
      streetName: Redacted.make(AddressLine.make("1 Computation Way"), {
        label: "addressLine",
      }),
      postalCode: Redacted.make(PostalCode.make("10001"), {
        label: "postalCode",
      }),
      city: Redacted.make(City.make("New York"), { label: "city" }),
      country: CountryCode.make("US"),
    }),
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
    id: RegistrationId.make(id),
    details: makeDetails({ companyName, firstName, lastName, email }),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date(updatedAt),
  });

const makeApproved = (registration: AwaitingApprovalRegistration) =>
  new ApprovedRegistration({
    _tag: "ApprovedRegistration",
    id: registration.id,
    details: registration.details,
    decision: new ApprovedDecision({
      decision: "approved",
      actor: reviewer,
      decidedAt: new Date("2026-01-02T00:00:00.000Z"),
    }),
    commerceAccount: new CommerceAccount({
      registrationId: registration.id,
      customerId: CommerceCustomerId.make(`customer-${registration.id}`),
      businessUnitId: CommerceBusinessUnitId.make(
        `business-unit-${registration.id}`
      ),
    }),
    invitation: new PendingRegistrationInvitation({
      _tag: "PendingInvitation",
      id: InvitationId.make(`invitation-${registration.id}`),
      intent: new RegistrationApprovalIntent({
        intent: "registration_approval",
        registrationId: registration.id,
        inviteeEmail: registration.details.email,
        role: "owner",
      }),
      issuedBy: reviewer,
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
    }),
    createdAt: registration.createdAt,
    updatedAt: registration.updatedAt,
  });

const makeRejected = (registration: AwaitingApprovalRegistration) =>
  new RejectedRegistration({
    _tag: "RejectedRegistration",
    id: registration.id,
    details: registration.details,
    decision: new RejectedDecision({
      decision: "rejected",
      actor: reviewer,
      decidedAt: new Date("2026-01-02T00:00:00.000Z"),
    }),
    createdAt: registration.createdAt,
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
  id,
  registration,
  createdAt,
  lastModifiedAt,
});

const listWith = (records: readonly RegistrationQueryRecord[]) =>
  RegistrationQueries.pipe(
    Effect.provide(RegistrationQueries.layerMemoryFrom(records))
  );

describe("RegistrationQueries.layerMemoryFrom", () => {
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

      expect(result.items.map((item) => item.registrationId)).toEqual([
        "registration-approved",
      ]);
      expect(result.items[0]?.status).toBe("approved");
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

      expect(result.items.map((item) => item.registrationId)).toEqual([
        "registration-a",
        "registration-c",
        "registration-b",
      ]);
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

      expect(firstPage.items.map((item) => item.registrationId)).toEqual([
        "registration-d",
        "registration-c",
      ]);
      expect(secondPage.items.map((item) => item.registrationId)).toEqual([
        "registration-b",
        "registration-a",
      ]);
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

      expect(firstPage.items.map((item) => item.registrationId)).toEqual([
        "registration-c",
        "registration-b",
      ]);
      expect(secondPage.items.map((item) => item.registrationId)).toEqual([
        "registration-a",
      ]);
    })
  );

  it.effect("sorts by created time with stable cursor pagination", () =>
    Effect.gen(function* () {
      const queries = yield* listWith([
        record(
          makeAwaiting({
            id: "registration-z",
            updatedAt: "2026-01-03T00:00:00.000Z",
            companyName: "Zenith Tools",
          }),
          {
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            id: "custom-object-z",
          }
        ),
        record(
          makeAwaiting({
            id: "registration-a",
            updatedAt: "2026-01-02T00:00:00.000Z",
            companyName: "Acme Industrial",
          }),
          {
            createdAt: new Date("2026-01-02T00:00:00.000Z"),
            id: "custom-object-a",
          }
        ),
        record(
          makeAwaiting({
            id: "registration-h-1",
            updatedAt: "2026-01-01T00:00:00.000Z",
            companyName: "Hydra Supplies",
          }),
          {
            createdAt: new Date("2026-01-03T00:00:00.000Z"),
            id: "custom-object-h-1",
          }
        ),
        record(
          makeAwaiting({
            id: "registration-h-2",
            updatedAt: "2026-01-04T00:00:00.000Z",
            companyName: "Hydra Supplies",
          }),
          {
            createdAt: new Date("2026-01-04T00:00:00.000Z"),
            id: "custom-object-h-2",
          }
        ),
      ]);

      const firstPage = yield* queries.list({
        limit: 2,
        sort: { field: "createdAt", direction: "asc" },
      });
      expect(firstPage.nextCursor).toBeDefined();
      const cursor = firstPage.nextCursor;
      if (!cursor) {
        throw new Error("Expected a next cursor");
      }
      const secondPage = yield* queries.list({
        cursor,
        limit: 2,
        sort: { field: "createdAt", direction: "asc" },
      });

      expect(firstPage.items.map((item) => item.registrationId)).toEqual([
        "registration-z",
        "registration-a",
      ]);
      expect(secondPage.items.map((item) => item.registrationId)).toEqual([
        "registration-h-1",
        "registration-h-2",
      ]);
    })
  );

  it.effect("rejects cursors created for a different sort", () =>
    Effect.gen(function* () {
      const queries = yield* listWith([
        record(
          makeAwaiting({
            id: "registration-a",
            updatedAt: "2026-01-01T00:00:00.000Z",
            companyName: "Acme Industrial",
          })
        ),
        record(
          makeAwaiting({
            id: "registration-b",
            updatedAt: "2026-01-02T00:00:00.000Z",
            companyName: "Hydra Supplies",
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
          sort: { field: "createdAt", direction: "asc" },
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
