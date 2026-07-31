export type ProductAttribute<
  TKind extends "lenum" | "enum" | "ltext" | "text" | "number" | "boolean",
> = {
  readonly name: string;
  readonly value: TKind extends "lenum"
    ? {
        readonly key: string;
        readonly label: Record<string, string>;
      }
    : TKind extends "enum"
      ? {
          readonly key: string;
          readonly label: string;
        }
      : TKind extends "ltext"
        ? Record<string, string>
        : TKind extends "text"
          ? string
          : TKind extends "number"
            ? number
            : TKind extends "boolean"
              ? boolean
              : never;
};
