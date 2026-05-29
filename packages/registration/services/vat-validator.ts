import { Context, Effect, Layer, Redacted } from "effect";
import type { RedactedVatId } from "../domain/registration";

export interface VatValidatorMemoryInput {
  readonly validVatIds?: Iterable<string>;
  readonly invalidVatIds?: Iterable<string>;
}

const normalizedVatId = (vatId: string) => vatId.trim().toUpperCase();

export class VatValidator extends Context.Service<
  VatValidator,
  {
    readonly isValid: (vatId: RedactedVatId) => Effect.Effect<boolean>;
  }
>()("@repo/registration/VatValidator") {
  static readonly layerMemoryFrom = ({
    validVatIds = [],
    invalidVatIds = [],
  }: VatValidatorMemoryInput = {}) => {
    const valid = new Set([...validVatIds].map(normalizedVatId));
    const invalid = new Set([...invalidVatIds].map(normalizedVatId));

    return Layer.succeed(
      VatValidator,
      VatValidator.of({
        isValid: Effect.fn("VatValidator.isValid")((vatId) => {
          const value = normalizedVatId(String(Redacted.value(vatId)));

          if (invalid.has(value)) {
            return Effect.succeed(false);
          }

          return Effect.succeed(valid.size === 0 || valid.has(value));
        }),
      })
    );
  };

  static readonly layerMemory = VatValidator.layerMemoryFrom();
}
