import { Context, Effect, Layer } from "effect";

import { CountryCode } from "../domain/identity";

export class RegistrationMarketPolicy extends Context.Service<
  RegistrationMarketPolicy,
  {
    readonly canRegisterCompany: (
      country: CountryCode
    ) => Effect.Effect<boolean>;
  }
>()("@repo/registration/RegistrationMarketPolicy") {
  static readonly layerMemoryFrom = ({
    supportedCountries,
  }: {
    supportedCountries: Iterable<CountryCode>;
  }) => {
    const supported = new Set([...supportedCountries].map(String));

    return Layer.succeed(
      RegistrationMarketPolicy,
      RegistrationMarketPolicy.of({
        canRegisterCompany: Effect.fn(
          "RegistrationMarketPolicy.canRegisterCompany"
        )((country) => Effect.succeed(supported.has(String(country)))),
      })
    );
  };

  static readonly layerDefault = RegistrationMarketPolicy.layerMemoryFrom({
    supportedCountries: [
      "US",
      "CA",
      "GB",
      "DE",
      "FR",
      "IT",
      "ES",
      "NL",
      "PT",
    ].map((country) => CountryCode.make(country)),
  });
}
