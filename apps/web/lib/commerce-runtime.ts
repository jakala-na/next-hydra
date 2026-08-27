import "server-only";
import type { NextServer } from "@repo/actions/next-server";
/* oxlint-disable promise/prefer-await-to-callbacks, promise/prefer-await-to-then -- Effect combinators use callback APIs to transform Effect values. */
import type {
  CommerceRequestProvisionError,
  CommerceRequestLayerServices,
  CommerceRequestServices,
  CommerceStableServices,
} from "@repo/commerce/runtime/make-commerce-app";
import { CommerceAccountUnavailable } from "@repo/commerce/services/commerce-accounts";
import { CompanyMemberRemovalRecords } from "@repo/commerce/services/company-member-removal-records";
import { CustomerAccountMembers } from "@repo/commerce/services/customer-account-members";
import type { Locale } from "@repo/i18n/types";
import { Effect, Layer, Schema } from "effect";

import { Actions } from "./actions";
import { AppRuntime, CommerceApp } from "./app-runtime";
import { nextCommerceRequest } from "./commerce-request";
import type { NextCommerceRequestOptions } from "./commerce-request";
import type { CurrentAuth } from "./current-auth";
import type { NextRequestApi } from "./next-request";

export { CommerceApp } from "./app-runtime";
export {
  makeCommerceRequest,
  makeNextCommerceRequest,
  type NextCommerceRequestOptions,
} from "./commerce-request";

type CommerceRuntimeServices =
  | CommerceStableServices
  | CompanyMemberRemovalRecords
  | CustomerAccountMembers
  | CurrentAuth
  | NextServer
  | NextRequestApi;

export type NextCommerceRequestError = CommerceRequestProvisionError;

const logCommerceRequestCause = (error: CommerceAccountUnavailable) =>
  Effect.logError(error.message, error.cause ?? error).pipe(
    Effect.annotateLogs({
      "commerce.error.tag": error._tag,
    })
  );

const provide =
  (locale: Locale, options?: NextCommerceRequestOptions) =>
  <A, E>(
    program: Effect.Effect<
      A,
      E,
      | CommerceRequestServices
      | CommerceStableServices
      | CompanyMemberRemovalRecords
      | CustomerAccountMembers
    >
  ): Effect.Effect<
    A,
    E | CommerceRequestProvisionError,
    CommerceRuntimeServices
  > =>
    Effect.gen(function* () {
      const customerAccountMembers = yield* CustomerAccountMembers;
      const companyMemberRemovalRecords = yield* CompanyMemberRemovalRecords;
      const request = yield* nextCommerceRequest(locale, options);

      return yield* program.pipe(
        Effect.provideService(CustomerAccountMembers, customerAccountMembers),
        Effect.provideService(
          CompanyMemberRemovalRecords,
          companyMemberRemovalRecords
        ),
        CommerceApp.provide(request)
      );
    }).pipe(
      Effect.tapError((error) =>
        Schema.is(CommerceAccountUnavailable)(error)
          ? logCommerceRequestCause(error)
          : Effect.void
      )
    );

export const CommerceActions = Actions.provide(
  ({
    locale,
  }): Layer.Layer<
    CommerceRequestLayerServices,
    CommerceRequestProvisionError,
    CommerceStableServices | CurrentAuth | NextRequestApi
  > =>
    Layer.unwrap(
      nextCommerceRequest(locale).pipe(
        Effect.tapError((error) =>
          Schema.is(CommerceAccountUnavailable)(error)
            ? logCommerceRequestCause(error)
            : Effect.void
        ),
        Effect.map((request) =>
          CommerceApp.requestLayer(request).pipe(
            Layer.tapError((error) =>
              Schema.is(CommerceAccountUnavailable)(error)
                ? logCommerceRequestCause(error)
                : Effect.void
            )
          )
        )
      )
    )
);

export const NextCommerce = {
  provide,
  runPromise: async <A, E>(
    program: Effect.Effect<A, E, CommerceRuntimeServices>
  ) => await AppRuntime.runPromise(program),
};
