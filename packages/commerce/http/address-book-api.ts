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

export class AddressBookApiBadRequest extends Schema.TaggedErrorClass<AddressBookApiBadRequest>()(
  "AddressBookApiBadRequest",
  {
    code: Schema.Literal("addressBook.badRequest"),
    message: Schema.String,
  },
  { httpApiStatus: 400 }
) {}

export class AddressBookApiUnauthorized extends Schema.TaggedErrorClass<AddressBookApiUnauthorized>()(
  "AddressBookApiUnauthorized",
  {
    code: Schema.Literal("auth.unauthorized"),
    message: Schema.String,
  },
  { httpApiStatus: 401 }
) {}

export class AddressBookApiForbidden extends Schema.TaggedErrorClass<AddressBookApiForbidden>()(
  "AddressBookApiForbidden",
  {
    code: Schema.Literal("addressBook.accessDenied"),
    message: Schema.String,
  },
  { httpApiStatus: 403 }
) {}

export class AddressBookApiError extends Schema.TaggedErrorClass<AddressBookApiError>()(
  "AddressBookApiError",
  {
    code: Schema.Literals([
      "addressBook.internal",
      "addressBook.providerFailure",
    ]),
    message: Schema.String,
  },
  { httpApiStatus: 500 }
) {}

export class AddressBookSchemaErrorMiddleware extends HttpApiMiddleware.Service<
  AddressBookSchemaErrorMiddleware,
  { readonly requires: never }
>()("@repo/commerce/http/AddressBookSchemaErrorMiddleware", {
  error: AddressBookApiBadRequest,
}) {}

export class AddressBookAccessMiddleware extends HttpApiMiddleware.Service<
  AddressBookAccessMiddleware,
  {
    readonly provides: AddressBook;
    readonly requires: never;
  }
>()("@repo/commerce/http/AddressBookAccessMiddleware", {
  error: [
    AddressBookApiBadRequest,
    AddressBookApiUnauthorized,
    AddressBookApiForbidden,
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
  .annotateMerge(
    OpenApi.annotations({
      title: "Address Book HTTP API",
      version: "1.0.0",
    })
  ) {}
