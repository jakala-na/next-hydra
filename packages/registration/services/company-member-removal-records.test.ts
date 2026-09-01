import { describe, expect, it } from "@effect/vitest";
import { CommerceCustomerId } from "@repo/commerce/domain/commerce-account";
import { AuthUserId } from "@repo/commerce/domain/commerce-request-context";
import { CompanyMemberRemovalRecords } from "@repo/commerce/services/company-member-removal-records";
import { VersionedKeyValueStore } from "@repo/versioned-store";
import { Effect, Layer, Option } from "effect";

import { CommerceBusinessUnitId } from "../domain/identity";
import { companyMemberRemovalRecordsLayerStorage } from "./company-member-removal-records";

const layer = companyMemberRemovalRecordsLayerStorage.pipe(
  Layer.provide(VersionedKeyValueStore.layerMemory)
);

describe("company member removal records", () => {
  it.effect("persists and completes a tenant-scoped removal receipt", () =>
    Effect.gen(function* () {
      const records = yield* CompanyMemberRemovalRecords;
      const input = {
        authUserId: AuthUserId.make("auth-member-1"),
        businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
        customerId: CommerceCustomerId.make("customer-1"),
      };

      const pending = yield* records.begin(input);
      yield* records.complete(pending);
      const completed = yield* records.find(input);

      expect(Option.getOrUndefined(completed)).toMatchObject({
        ...input,
        status: "completed",
      });
    }).pipe(Effect.provide(layer))
  );

  it.effect("starts a new attempt when a current member is removed again", () =>
    Effect.gen(function* () {
      const records = yield* CompanyMemberRemovalRecords;
      const identity = {
        businessUnitId: CommerceBusinessUnitId.make("business-unit-1"),
        customerId: CommerceCustomerId.make("customer-1"),
      };
      const first = yield* records.begin({
        ...identity,
        authUserId: AuthUserId.make("auth-member-1"),
      });
      yield* records.complete(first);

      const next = yield* records.begin({
        ...identity,
        authUserId: AuthUserId.make("auth-member-2"),
      });

      expect(next).toMatchObject({
        authUserId: "auth-member-2",
        status: "pending",
      });
    }).pipe(Effect.provide(layer))
  );
});
