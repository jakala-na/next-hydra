import { InputInvalid, definePublicError } from "@repo/errors";
import { UnexpectedHttpErrors } from "@repo/errors/http";
import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSecurity,
  OpenApi,
} from "effect/unstable/httpapi";

import { AddressBookEntry } from "../domain/address-book";
import type { AddressBook } from "../services/address-book";
import { CommerceRequestHeaders } from "./commerce-request";

const AddressBookApiUnauthorizedDefinition = definePublicError({
  category: "unauthenticated",
  code: "auth.unauthorized",
  fields: {},
  recovery: "reauthenticate",
  status: 401,
  tag: "AddressBookApiUnauthorized",
});
export const AddressBookApiUnauthorized =
  AddressBookApiUnauthorizedDefinition.schema;
export type AddressBookApiUnauthorized = typeof AddressBookApiUnauthorized.Type;
export const makeAddressBookApiUnauthorized =
  AddressBookApiUnauthorizedDefinition.make;

const AddressBookApiForbiddenDefinition = definePublicError({
  category: "forbidden",
  code: "addressBook.accessDenied",
  fields: {},
  recovery: "request_access",
  status: 403,
  tag: "AddressBookApiForbidden",
});
export const AddressBookApiForbidden = AddressBookApiForbiddenDefinition.schema;
export type AddressBookApiForbidden = typeof AddressBookApiForbidden.Type;
export const makeAddressBookApiForbidden =
  AddressBookApiForbiddenDefinition.make;

const AddressBookContextUnavailableDefinition = definePublicError({
  category: "not_found",
  code: "addressBook.contextUnavailable",
  fields: {
    reason: Schema.Literals([
      "noPrincipal",
      "noCustomerMapping",
      "noBuyingContext",
    ]),
  },
  recovery: "refresh",
  status: 404,
  tag: "CommerceRequestContextNotFound",
});
export const AddressBookContextUnavailable =
  AddressBookContextUnavailableDefinition.schema;
export type AddressBookContextUnavailable =
  typeof AddressBookContextUnavailable.Type;
export const makeAddressBookContextUnavailable =
  AddressBookContextUnavailableDefinition.make;

const AddressBookApiErrorDefinition = definePublicError({
  category: "unavailable",
  code: "addressBook.unavailable",
  fields: {},
  recovery: "retry",
  status: 503,
  tag: "AddressBookApiError",
});
export const AddressBookApiError = AddressBookApiErrorDefinition.schema;
export type AddressBookApiError = typeof AddressBookApiError.Type;
export const makeAddressBookApiError = AddressBookApiErrorDefinition.make;

export class AddressBookSchemaErrorMiddleware extends HttpApiMiddleware.Service<
  AddressBookSchemaErrorMiddleware,
  { readonly requires: never }
>()("@repo/commerce/http/AddressBookSchemaErrorMiddleware", {
  error: InputInvalid,
}) {}

export class AddressBookAccessMiddleware extends HttpApiMiddleware.Service<
  AddressBookAccessMiddleware,
  {
    readonly provides: AddressBook;
    readonly requires: never;
  }
>()("@repo/commerce/http/AddressBookAccessMiddleware", {
  error: [
    InputInvalid,
    AddressBookApiUnauthorized,
    AddressBookApiForbidden,
    AddressBookContextUnavailable,
    AddressBookApiError,
  ],
  security: {
    accessToken: HttpApiSecurity.bearer,
  },
}) {}

export class AddressBookApiGroup extends HttpApiGroup.make("addressBook")
  .add(
    HttpApiEndpoint.get("list", "/address-book", {
      headers: CommerceRequestHeaders,
      success: Schema.Array(AddressBookEntry),
    }).annotate(OpenApi.Summary, "List the current Business Unit address book")
  )
  .middleware(AddressBookSchemaErrorMiddleware)
  .middleware(AddressBookAccessMiddleware)
  .annotateMerge(
    OpenApi.annotations({
      description: "Authenticated Business Unit Address Book endpoints",
      title: "Address Book",
    })
  ) {}

export class AddressBookHttpApi extends HttpApi.make("address-book-http-api")
  .add(AddressBookApiGroup)
  .middleware(UnexpectedHttpErrors)
  .annotateMerge(
    OpenApi.annotations({
      title: "Address Book HTTP API",
      version: "1.0.0",
    })
  ) {}
