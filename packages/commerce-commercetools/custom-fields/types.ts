export type CustomFieldRaw = {
  readonly name: string;
  readonly value: unknown;
};

export type LocalizedString = Record<string, string>;

export type LocalizedEnumValue = {
  readonly key: string;
  readonly label: LocalizedString;
};

export type EnumValue = {
  readonly key: string;
  readonly label: string;
};

export type CustomField<
  TKind extends
    | "lenum"
    | "enum"
    | "ltext"
    | "text"
    | "number"
    | "boolean"
    | "datetime",
  TEnum extends string = string,
> = {
  readonly name: string;
  readonly value: TKind extends "lenum"
    ? TEnum
    : TKind extends "enum"
      ? TEnum
      : TKind extends "ltext"
        ? LocalizedString
        : TKind extends "text"
          ? string
          : TKind extends "number"
            ? number
            : TKind extends "boolean"
              ? boolean
              : TKind extends "datetime"
                ? string
                : never;
};

export type ExtractedCustomFieldValue<TField> =
  TField extends CustomField<infer TKind, infer TEnum>
    ? TKind extends "lenum" | "enum"
      ? TEnum
      : TKind extends "ltext" | "text" | "datetime"
        ? string
        : TKind extends "number"
          ? number
          : TKind extends "boolean"
            ? boolean
            : never
    : never;

export type ExtractedCustomFields<TSchema> = {
  [TField in keyof TSchema]?: ExtractedCustomFieldValue<TSchema[TField]>;
};
