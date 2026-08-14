import { AddressBookHttpApi } from "@repo/commerce/http/address-book-api";
import { CheckoutHttpApi } from "@repo/commerce/http/checkout-api";
import { RegistrationHttpApi } from "@repo/registration/http/registration-api";
import { HttpApi, OpenApi } from "effect/unstable/httpapi";

export class ApplicationHttpApi extends HttpApi.make("next-hydra-api")
  .addHttpApi(AddressBookHttpApi)
  .addHttpApi(CheckoutHttpApi)
  .addHttpApi(RegistrationHttpApi)
  .annotateMerge(
    OpenApi.annotations({
      title: "Next Hydra API",
      version: "1.0.0",
    })
  ) {}

export const applicationOpenApi = OpenApi.fromApi(ApplicationHttpApi);
