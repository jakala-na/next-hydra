import { AccessTokenVerifier } from "@repo/auth/access-token";
import {
  AuthUserId,
  CustomerCommerceContextRequest,
} from "@repo/commerce/domain/commerce-request-context";
import {
  AddressBookAccessMiddleware,
  AddressBookHttpApi,
  AddressBookSchemaErrorMiddleware,
  makeAddressBookContextUnavailable,
  makeAddressBookApiError,
  makeAddressBookApiForbidden,
  makeAddressBookApiUnauthorized,
} from "@repo/commerce/http/address-book-api";
import { CommerceRequestHeaders } from "@repo/commerce/http/commerce-request";
import { AddressBook } from "@repo/commerce/services/address-book";
import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import { CommerceContext } from "@repo/commerce/services/commerce-context";
import { resolveStore } from "@repo/commerce/store";
import {
  ErrorIssue,
  makeInputInvalid,
  makeSchemaErrorIssues,
} from "@repo/errors";
import { unexpectedHttpErrorsLayer } from "@repo/errors/http";
import { Effect, Layer, Schema } from "effect";
import type { Config } from "effect";
import {
  HttpRouter,
  HttpServer,
  HttpServerRequest,
} from "effect/unstable/http";
import { HttpApiBuilder, HttpApiMiddleware } from "effect/unstable/httpapi";

import { parseBearerAuthorization } from "../auth/bearer-token";

type CommerceAuthenticationLayer = Layer.Layer<
  AccessTokenVerifier,
  Config.ConfigError
>;

export interface AddressBookHttpDependencies {
  readonly addressBookLayer: Layer.Layer<
    AddressBook,
    Config.ConfigError,
    CommerceContext
  >;
  readonly authenticationLayer: CommerceAuthenticationLayer;
  readonly commerceAccountsLayer: Layer.Layer<
    CommerceAccounts,
    Config.ConfigError
  >;
}

interface AddressBookDiagnosticFailure {
  readonly _tag: string;
  readonly message: string;
  readonly operation?: string;
}

const logAddressBookDiagnosticFailure = (error: AddressBookDiagnosticFailure) =>
  Effect.logError(error.message, error).pipe(
    Effect.annotateLogs(
      error.operation === undefined
        ? { "addressBook.error.tag": error._tag }
        : {
            "addressBook.error.tag": error._tag,
            "addressBook.operation": error.operation,
          }
    )
  );

const addressBookBadRequestMessage = "The address book request is invalid.";

const toAddressBookBadRequest = (cause?: Schema.SchemaError) =>
  makeInputInvalid({
    issues:
      cause === undefined
        ? [new ErrorIssue({ message: addressBookBadRequestMessage, path: [] })]
        : makeSchemaErrorIssues(cause, addressBookBadRequestMessage),
    message: addressBookBadRequestMessage,
  });

const toAddressBookUnauthorized = () =>
  makeAddressBookApiUnauthorized({
    message: "Authentication is required.",
  });

const toAddressBookForbidden = () =>
  makeAddressBookApiForbidden({
    message: "Address Book access is denied.",
  });

const toAddressBookContextUnavailable = (
  reason: "noPrincipal" | "noCustomerMapping" | "noBuyingContext"
) =>
  makeAddressBookContextUnavailable({
    message: "The Address Book is unavailable for the current account.",
    reason,
  });

const toAddressBookError = () =>
  makeAddressBookApiError({
    message: "The Address Book is temporarily unavailable.",
  });

const getAddressBookRequestHeaders = Effect.gen(
  function* getAddressBookRequestHeaders() {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const locale = request.headers["x-context-locale"];
    const businessUnitId = request.headers["x-context-business-unit-id"];

    if (locale === undefined) {
      return yield* Effect.fail(toAddressBookBadRequest());
    }

    const requestHeaders =
      businessUnitId === undefined
        ? { "x-context-locale": locale }
        : {
            "x-context-locale": locale,
            "x-context-business-unit-id": businessUnitId,
          };
    return yield* Schema.decodeUnknownEffect(CommerceRequestHeaders)(
      requestHeaders
    ).pipe(Effect.mapError(toAddressBookBadRequest));
  }
);

const makeAddressBookContextRequest = (
  headers: CommerceRequestHeaders,
  authUserId: AuthUserId
) => {
  const request = {
    authUserId,
    store: resolveStore({ locale: headers["x-context-locale"] }),
  };
  const businessUnitId = headers["x-context-business-unit-id"];
  return businessUnitId === undefined
    ? new CustomerCommerceContextRequest(request)
    : new CustomerCommerceContextRequest({ ...request, businessUnitId });
};

const addressBookAccessMiddlewareLayer = (
  addressBookLayer: AddressBookHttpDependencies["addressBookLayer"]
) =>
  Layer.effect(
    AddressBookAccessMiddleware,
    Effect.gen(function* addressBookAccessMiddlewareLayer() {
      const verifier = yield* AccessTokenVerifier;
      const accounts = yield* CommerceAccounts;
      const accountsLayer = Layer.succeed(CommerceAccounts, accounts);
      const verifierLayer = Layer.succeed(AccessTokenVerifier, verifier);

      return {
        accessToken: (httpEffect, { credential }) =>
          Effect.gen(function* accessToken() {
            const request = yield* HttpServerRequest.HttpServerRequest;
            const authorization = parseBearerAuthorization(
              request.headers.authorization,
              credential
            );
            if (authorization._tag !== "Token") {
              return yield* Effect.fail(toAddressBookUnauthorized());
            }

            const headers = yield* getAddressBookRequestHeaders;
            const verifiedToken = yield* AccessTokenVerifier.verify(
              authorization.token
            ).pipe(
              Effect.catchTags({
                AccessTokenInvalid: () =>
                  Effect.fail(toAddressBookUnauthorized()),
                AccessTokenVerificationFailure: (error) =>
                  logAddressBookDiagnosticFailure(error).pipe(
                    Effect.andThen(
                      error.reason === "unavailable"
                        ? Effect.fail(toAddressBookError())
                        : Effect.die(error)
                    )
                  ),
              }),
              Effect.provide(verifierLayer)
            );
            const contextRequest = makeAddressBookContextRequest(
              headers,
              AuthUserId.make(verifiedToken.authUserId)
            );

            return yield* httpEffect.pipe(
              Effect.provide(
                addressBookLayer.pipe(
                  Layer.provideMerge(CommerceContext.layer(contextRequest)),
                  Layer.provide(accountsLayer)
                )
              ),
              Effect.catchTags({
                CommerceAccountUnavailable: (error) =>
                  logAddressBookDiagnosticFailure(error).pipe(
                    Effect.andThen(Effect.fail(toAddressBookError()))
                  ),
                CommerceRequestContextNotFound: (error) =>
                  Effect.fail(toAddressBookContextUnavailable(error.reason)),
                ConfigError: (error) =>
                  logAddressBookDiagnosticFailure(error).pipe(
                    Effect.andThen(Effect.die(error))
                  ),
              })
            );
          }),
      };
    })
  );

const addressBookSchemaErrorMiddlewareLayer =
  HttpApiMiddleware.layerSchemaErrorTransform(
    AddressBookSchemaErrorMiddleware,
    (error) =>
      error.kind === "Body"
        ? Effect.die(error)
        : Effect.fail(toAddressBookBadRequest(error.cause))
  );

const addressBookHandlers = HttpApiBuilder.group(
  AddressBookHttpApi,
  "addressBook",
  (handlers) =>
    handlers.handle("list", () =>
      AddressBook.list().pipe(
        Effect.catchTag("AddressBookProviderFailure", (error) =>
          logAddressBookDiagnosticFailure(error).pipe(
            Effect.andThen(
              error.reason === "unavailable"
                ? Effect.fail(error)
                : Effect.die(error)
            )
          )
        ),
        Effect.mapError((error) => {
          switch (error._tag) {
            case "AddressBookAccessDenied": {
              return toAddressBookForbidden();
            }
            case "CommerceRequestContextNotFound": {
              return toAddressBookContextUnavailable(error.reason);
            }
            case "AddressBookProviderFailure": {
              return toAddressBookError();
            }
            default: {
              const exhaustiveError: never = error;
              return exhaustiveError;
            }
          }
        })
      )
    )
);

const makeAddressBookHttpApiLayer = (
  dependencies: AddressBookHttpDependencies
) =>
  HttpApiBuilder.layer(AddressBookHttpApi).pipe(
    Layer.provide(addressBookHandlers),
    Layer.provide(addressBookSchemaErrorMiddlewareLayer),
    Layer.provide(
      addressBookAccessMiddlewareLayer(dependencies.addressBookLayer)
    ),
    Layer.provide(unexpectedHttpErrorsLayer),
    Layer.provideMerge(dependencies.authenticationLayer),
    Layer.provideMerge(dependencies.commerceAccountsLayer),
    Layer.provide(HttpServer.layerServices)
  );

export const makeAddressBookHttpHandler = (
  dependencies: AddressBookHttpDependencies
) =>
  HttpRouter.toWebHandler(makeAddressBookHttpApiLayer(dependencies), {
    disableLogger: true,
  });
