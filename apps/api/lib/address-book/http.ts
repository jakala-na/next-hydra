import { AccessTokenVerifier } from "@repo/auth/access-token";
import type {
  AccessTokenInvalid,
  AccessTokenVerificationFailure,
} from "@repo/auth/access-token";
import {
  AuthUserId,
  CustomerCommerceContextRequest,
} from "@repo/commerce/domain/commerce-request-context";
import {
  AddressBookAccessMiddleware,
  AddressBookApiBadRequest,
  AddressBookApiError,
  AddressBookApiForbidden,
  AddressBookApiUnauthorized,
  AddressBookHttpApi,
  AddressBookSchemaErrorMiddleware,
} from "@repo/commerce/http/address-book-api";
import { CommerceRequestHeaders } from "@repo/commerce/http/commerce-request";
import type {
  CommerceApplication,
  CommerceRequestProvisionError,
  CommerceStableServices,
} from "@repo/commerce/runtime/make-commerce-app";
import { AddressBook } from "@repo/commerce/services/address-book";
import { resolveStore } from "@repo/commerce/store";
import { Effect, Layer, Schema } from "effect";
import type { Config } from "effect";
import {
  HttpRouter,
  HttpServer,
  HttpServerRequest,
} from "effect/unstable/http";
import { HttpApiBuilder, HttpApiMiddleware } from "effect/unstable/httpapi";

import { parseBearerAuthorization } from "../auth/bearer-token";

type AddressBookCommerceApp = CommerceApplication<
  Config.ConfigError,
  Config.ConfigError | CommerceRequestProvisionError,
  Config.ConfigError | CommerceRequestProvisionError
>;
type CommerceAuthenticationLayer = Layer.Layer<
  AccessTokenVerifier,
  Config.ConfigError
>;

export interface AddressBookHttpDependencies {
  readonly authenticationLayer: CommerceAuthenticationLayer;
  readonly commerceApp: AddressBookCommerceApp;
}

interface AddressBookDiagnosticFailure {
  readonly _tag: string;
  readonly message: string;
  readonly operation?: string;
}

const logAddressBookDiagnosticFailure = (error: AddressBookDiagnosticFailure) =>
  Effect.logError(error.message, error).pipe(
    Effect.annotateLogs({
      "addressBook.error.tag": error._tag,
      ...(error.operation === undefined
        ? {}
        : { "addressBook.operation": error.operation }),
    })
  );

const toAddressBookBadRequest = () =>
  new AddressBookApiBadRequest({
    code: "addressBook.badRequest",
    message: "The address book request is invalid.",
  });

const toAddressBookUnauthorized = () =>
  new AddressBookApiUnauthorized({
    code: "auth.unauthorized",
    message: "Authentication is required.",
  });

const toAddressBookForbidden = () =>
  new AddressBookApiForbidden({
    code: "addressBook.accessDenied",
    message: "Address Book access is denied.",
  });

const toAddressBookError = (
  code:
    | "addressBook.internal"
    | "addressBook.providerFailure" = "addressBook.internal"
) =>
  new AddressBookApiError({
    code,
    message:
      code === "addressBook.providerFailure"
        ? "Saved addresses could not be loaded. Try again."
        : "The Address Book is temporarily unavailable.",
  });

const getAddressBookRequestHeaders = Effect.gen(
  function* getAddressBookRequestHeaders() {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const locale = request.headers["x-context-locale"];
    const businessUnitId = request.headers["x-context-business-unit-id"];

    if (locale === undefined) {
      return yield* Effect.fail(toAddressBookBadRequest());
    }

    return yield* Schema.decodeUnknownEffect(CommerceRequestHeaders)({
      "x-context-locale": locale,
      ...(businessUnitId === undefined
        ? {}
        : { "x-context-business-unit-id": businessUnitId }),
    }).pipe(Effect.mapError(toAddressBookBadRequest));
  }
);

const makeAddressBookContextRequest = (
  headers: CommerceRequestHeaders,
  authUserId: AuthUserId
) =>
  new CustomerCommerceContextRequest({
    authUserId,
    store: resolveStore({ locale: headers["x-context-locale"] }),
    ...(headers["x-context-business-unit-id"] === undefined
      ? {}
      : { businessUnitId: headers["x-context-business-unit-id"] }),
  });

const toAddressBookAuthenticationError = (
  error: AccessTokenInvalid | AccessTokenVerificationFailure
) =>
  error._tag === "AccessTokenInvalid"
    ? toAddressBookUnauthorized()
    : toAddressBookError();

const addressBookAccessMiddlewareLayer = (
  commerceApp: AddressBookCommerceApp
) =>
  Layer.effect(
    AddressBookAccessMiddleware,
    Effect.gen(function* addressBookAccessMiddlewareLayer() {
      const verifier = yield* AccessTokenVerifier;
      const commerceServices = yield* Effect.context<CommerceStableServices>();
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
              Effect.tapError((error) =>
                error._tag === "AccessTokenVerificationFailure"
                  ? logAddressBookDiagnosticFailure(error)
                  : Effect.void
              ),
              Effect.mapError(toAddressBookAuthenticationError),
              Effect.provide(verifierLayer)
            );
            const contextRequest = makeAddressBookContextRequest(
              headers,
              AuthUserId.make(verifiedToken.authUserId)
            );

            return yield* httpEffect.pipe(
              commerceApp.provideAddressBook(contextRequest),
              Effect.provide(commerceServices),
              Effect.catchTags({
                CommerceAccountError: (error) =>
                  logAddressBookDiagnosticFailure(error).pipe(
                    Effect.andThen(Effect.fail(toAddressBookError()))
                  ),
                CommerceRequestContextNotFound: () =>
                  Effect.fail(toAddressBookForbidden()),
                ConfigError: (error) =>
                  logAddressBookDiagnosticFailure(error).pipe(
                    Effect.andThen(Effect.fail(toAddressBookError()))
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
    () => Effect.fail(toAddressBookBadRequest())
  );

const addressBookHandlers = HttpApiBuilder.group(
  AddressBookHttpApi,
  "addressBook",
  (handlers) =>
    handlers.handle("list", () =>
      AddressBook.list().pipe(
        Effect.tapError((error) =>
          error._tag === "AddressBookProviderFailure"
            ? logAddressBookDiagnosticFailure(error)
            : Effect.void
        ),
        Effect.mapError((error) => {
          switch (error._tag) {
            case "AddressBookAccessDenied":
            case "CommerceRequestContextNotFound": {
              return toAddressBookForbidden();
            }
            case "AddressBookProviderFailure": {
              return toAddressBookError("addressBook.providerFailure");
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
    Layer.provide(addressBookAccessMiddlewareLayer(dependencies.commerceApp)),
    Layer.provideMerge(dependencies.authenticationLayer),
    Layer.provideMerge(dependencies.commerceApp.layer),
    Layer.provide(HttpServer.layerServices)
  );

export const makeAddressBookHttpHandler = (
  dependencies: AddressBookHttpDependencies
) =>
  HttpRouter.toWebHandler(makeAddressBookHttpApiLayer(dependencies), {
    disableLogger: true,
  });
