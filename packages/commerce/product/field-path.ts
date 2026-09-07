type Scalar = boolean | bigint | Date | null | number | string | symbol;

type NestedFieldPath<Value> = Value extends Scalar
  ? never
  : Value extends readonly (infer Item)[]
    ? FieldPath<Item>
    : Value extends object
      ? FieldPath<Value>
      : never;

/** Dot-separated paths through every member of a domain-model union. */
export type FieldPath<Document> = Document extends object
  ? {
      [Key in Extract<keyof Document, string>]:
        | Key
        | (NestedFieldPath<
            NonNullable<Document[Key]>
          > extends infer Child extends string
            ? `${Key}.${Child}`
            : never);
    }[Extract<keyof Document, string>]
  : never;
