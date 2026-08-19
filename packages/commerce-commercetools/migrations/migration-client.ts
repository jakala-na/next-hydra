import type {
  ByProjectKeyRequestBuilder,
  Type,
  TypeDraft,
  TypeUpdateAction,
} from "@commercetools/platform-sdk";

type TypeConfiguration = Pick<
  TypeDraft,
  "name" | "description" | "resourceTypeIds"
>;

type FieldDefinition = NonNullable<TypeDraft["fieldDefinitions"]>[number];

const NOT_FOUND_STATUS_CODE = 404;

const isNotFound = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "statusCode" in error &&
  error.statusCode === NOT_FOUND_STATUS_CODE;

class TypeMigrationBuilder {
  readonly #actions: TypeUpdateAction[] = [];
  #existingType: Type | undefined;
  readonly apiRoot: ByProjectKeyRequestBuilder;
  readonly typeKey: string;
  readonly typeConfiguration?: TypeConfiguration;

  constructor(
    apiRoot: ByProjectKeyRequestBuilder,
    typeKey: string,
    typeConfiguration?: TypeConfiguration
  ) {
    this.apiRoot = apiRoot;
    this.typeKey = typeKey;
    this.typeConfiguration = typeConfiguration;
  }

  async init(): Promise<this> {
    try {
      const response = await this.apiRoot
        .types()
        .withKey({ key: this.typeKey })
        .get()
        .execute();
      this.#existingType = response.body;
      return this;
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }

    if (!this.typeConfiguration) {
      throw new Error(
        `Type "${this.typeKey}" does not exist and no creation configuration was provided`
      );
    }

    const response = await this.apiRoot
      .types()
      .post({
        body: {
          key: this.typeKey,
          ...this.typeConfiguration,
          fieldDefinitions: [],
        },
      })
      .execute();
    this.#existingType = response.body;

    return this;
  }

  fieldExists(name: string): boolean {
    return (
      this.#existingType?.fieldDefinitions.some(
        (field) => field.name === name
      ) ?? false
    );
  }

  addField(fieldDefinition: FieldDefinition): this {
    this.#actions.push({
      action: "addFieldDefinition",
      fieldDefinition,
    });
    return this;
  }

  addStringField(
    name: string,
    label: Record<string, string>,
    options?: {
      readonly inputHint?: "SingleLine" | "MultiLine";
      readonly required?: boolean;
    }
  ): this {
    return this.addField({
      inputHint: options?.inputHint ?? "SingleLine",
      label,
      name,
      required: options?.required ?? false,
      type: { name: "String" },
    });
  }

  addLocalizedStringField(
    name: string,
    label: Record<string, string>,
    options?: { readonly required?: boolean }
  ): this {
    return this.addField({
      label,
      name,
      required: options?.required ?? false,
      type: { name: "LocalizedString" },
    });
  }

  addBooleanField(
    name: string,
    label: Record<string, string>,
    options?: { readonly required?: boolean }
  ): this {
    return this.addField({
      label,
      name,
      required: options?.required ?? false,
      type: { name: "Boolean" },
    });
  }

  addNumberField(
    name: string,
    label: Record<string, string>,
    options?: { readonly required?: boolean }
  ): this {
    return this.addField({
      label,
      name,
      required: options?.required ?? false,
      type: { name: "Number" },
    });
  }

  addDateTimeField(
    name: string,
    label: Record<string, string>,
    options?: { readonly required?: boolean }
  ): this {
    return this.addField({
      label,
      name,
      required: options?.required ?? false,
      type: { name: "DateTime" },
    });
  }

  addEnumField(
    name: string,
    label: Record<string, string>,
    values: readonly { readonly key: string; readonly label: string }[],
    options?: { readonly required?: boolean }
  ): this {
    return this.addField({
      label,
      name,
      required: options?.required ?? false,
      type: {
        name: "Enum",
        values: [...values],
      },
    });
  }

  addReferenceField(
    name: string,
    label: Record<string, string>,
    referenceTypeId: string,
    options?: { readonly required?: boolean }
  ): this {
    return this.addField({
      label,
      name,
      required: options?.required ?? false,
      type: {
        name: "Reference",
        referenceTypeId,
      },
    });
  }

  addReferenceSetField(
    name: string,
    label: Record<string, string>,
    referenceTypeId: string,
    options?: { readonly required?: boolean }
  ): this {
    return this.addField({
      label,
      name,
      required: options?.required ?? false,
      type: {
        elementType: {
          name: "Reference",
          referenceTypeId,
        },
        name: "Set",
      },
    });
  }

  removeField(name: string): this {
    if (!this.fieldExists(name)) {
      return this;
    }

    this.#actions.push({
      action: "removeFieldDefinition",
      fieldName: name,
    });
    return this;
  }

  async execute(): Promise<void> {
    if (this.#actions.length === 0) {
      return;
    }
    if (!this.#existingType) {
      throw new Error(`Type "${this.typeKey}" has not been initialized`);
    }

    await this.apiRoot
      .types()
      .withKey({ key: this.typeKey })
      .post({
        body: {
          actions: this.#actions,
          version: this.#existingType.version,
        },
      })
      .execute();
  }
}

export const migrationClient = (apiRoot: ByProjectKeyRequestBuilder) => ({
  ensureType: (typeKey: string, configuration: TypeConfiguration) =>
    new TypeMigrationBuilder(apiRoot, typeKey, configuration),
  type: (typeKey: string) => new TypeMigrationBuilder(apiRoot, typeKey),
});
