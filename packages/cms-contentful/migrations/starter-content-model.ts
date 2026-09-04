import type {
  BuiltinEditor,
  ContentType,
  IEditorInterfaceOptions,
  IValidation,
  LinkMimetype,
  MigrationFunction,
} from "contentful-migration";

export const PAGE_NAME_PREFIX = "Page - ";
export const COMPONENT_NAME_PREFIX = "Component - ";
export const ITEM_NAME_PREFIX = "Item - ";

export type StarterFieldType =
  | "Array"
  | "Boolean"
  | "Link"
  | "RichText"
  | "Symbol"
  | "Text";

export type StarterField = {
  readonly helpText?: string;
  readonly id: string;
  readonly items?: {
    readonly linkContentTypes: readonly string[];
    readonly linkType: "Entry";
    readonly type: "Link";
  };
  readonly linkContentTypes?: readonly string[];
  readonly linkMimetypeGroup?: readonly LinkMimetype[];
  readonly linkType?: "Asset" | "Entry";
  readonly localized: boolean;
  readonly name: string;
  readonly required: boolean;
  readonly size?: { readonly max: number };
  readonly type: StarterFieldType;
  readonly unique?: boolean;
  readonly widgetId?: BuiltinEditor;
  readonly widgetSettings?: IEditorInterfaceOptions;
};

export type StarterContentType = {
  readonly description: string;
  readonly displayField: string;
  readonly fields: readonly StarterField[];
  readonly id: string;
  readonly name: string;
};

const slugField = (helpText: string): StarterField => ({
  helpText,
  id: "slug",
  localized: true,
  name: "Slug",
  required: true,
  type: "Symbol",
  unique: true,
  widgetId: "slugEditor",
  widgetSettings: { trackingFieldId: "title" },
});

const titleField: StarterField = {
  id: "title",
  localized: true,
  name: "Title",
  required: true,
  type: "Symbol",
};

export const STARTER_CONTENT_TYPES: readonly StarterContentType[] = [
  {
    description: "A labeled internal or external link used by hero actions.",
    displayField: "label",
    fields: [
      {
        id: "label",
        localized: true,
        name: "Label",
        required: true,
        type: "Symbol",
      },
      {
        id: "internalContent",
        linkContentTypes: ["article", "landingPage"],
        linkType: "Entry",
        localized: true,
        name: "Internal content",
        required: false,
        type: "Link",
      },
      {
        helpText: "Used when the action should leave the site.",
        id: "externalUrl",
        localized: true,
        name: "External URL",
        required: false,
        type: "Symbol",
        widgetId: "urlEditor",
      },
    ],
    id: "callToAction",
    name: `${ITEM_NAME_PREFIX}Call to Action`,
  },
  {
    description:
      "Hero with tagline, heading, description, image, and up to two actions.",
    displayField: "heading",
    fields: [
      {
        helpText: "Optional short label above the hero heading.",
        id: "tagline",
        localized: true,
        name: "Tagline",
        required: false,
        type: "Symbol",
      },
      {
        id: "heading",
        localized: true,
        name: "Heading",
        required: true,
        type: "Symbol",
      },
      {
        id: "description",
        localized: true,
        name: "Description",
        required: true,
        type: "Text",
      },
      {
        id: "image",
        linkMimetypeGroup: ["image"],
        linkType: "Asset",
        localized: false,
        name: "Image",
        required: true,
        type: "Link",
      },
      {
        id: "actions",
        items: {
          linkContentTypes: ["callToAction"],
          linkType: "Entry",
          type: "Link",
        },
        localized: true,
        name: "Actions",
        required: false,
        size: { max: 2 },
        type: "Array",
      },
    ],
    id: "hero",
    name: `${COMPONENT_NAME_PREFIX}Hero`,
  },
  {
    description: "Editorial equipment guides.",
    displayField: "title",
    fields: [
      titleField,
      slugField("Public path for the article."),
      {
        helpText: "Short teaser shown in article collections and page headers.",
        id: "summary",
        localized: true,
        name: "Summary",
        required: true,
        type: "Text",
      },
      {
        id: "image",
        linkMimetypeGroup: ["image"],
        linkType: "Asset",
        localized: true,
        name: "Image",
        required: true,
        type: "Link",
      },
      {
        id: "body",
        localized: true,
        name: "Body",
        required: true,
        type: "RichText",
      },
    ],
    id: "article",
    name: `${PAGE_NAME_PREFIX}Article`,
  },
  {
    description: "A curated collection of article teasers.",
    displayField: "heading",
    fields: [
      {
        id: "heading",
        localized: true,
        name: "Heading",
        required: true,
        type: "Symbol",
      },
      {
        id: "description",
        localized: true,
        name: "Description",
        required: false,
        type: "Text",
      },
      {
        helpText: "Select up to three articles to feature.",
        id: "articles",
        items: {
          linkContentTypes: ["article"],
          linkType: "Entry",
          type: "Link",
        },
        localized: true,
        name: "Articles",
        required: true,
        size: { max: 3 },
        type: "Array",
      },
    ],
    id: "featuredArticles",
    name: `${COMPONENT_NAME_PREFIX}Featured Articles`,
  },
  {
    description:
      "Renders products selected by an external commerce category ID.",
    displayField: "heading",
    fields: [
      {
        id: "heading",
        localized: true,
        name: "Heading",
        required: false,
        type: "Symbol",
      },
      {
        id: "description",
        localized: true,
        name: "Description",
        required: false,
        type: "Text",
      },
      {
        helpText:
          "Optional external category ID resolved by the active commerce provider. Leave empty to show products without a category filter.",
        id: "productCategory",
        localized: false,
        name: "Commerce category ID",
        required: false,
        type: "Symbol",
      },
    ],
    id: "dynamicProductCollection",
    name: `${COMPONENT_NAME_PREFIX}Dynamic Product Collection`,
  },
  {
    description: "Routeable pages composed from ordered content blocks.",
    displayField: "title",
    fields: [
      titleField,
      slugField("Public path for the landing page."),
      {
        helpText:
          "Optional public heading; the node title remains the editorial name.",
        id: "displayTitle",
        localized: true,
        name: "Display title",
        required: false,
        type: "Symbol",
      },
      {
        helpText:
          "Keep the display title available to metadata while hiding it visually.",
        id: "hideDisplayTitle",
        localized: false,
        name: "Hide display title",
        required: false,
        type: "Boolean",
      },
      {
        helpText: "Ordered content blocks.",
        id: "components",
        items: {
          linkContentTypes: [
            "dynamicProductCollection",
            "featuredArticles",
            "hero",
          ],
          linkType: "Entry",
          type: "Link",
        },
        localized: true,
        name: "Components",
        required: false,
        type: "Array",
      },
    ],
    id: "landingPage",
    name: `${PAGE_NAME_PREFIX}Landing Page`,
  },
];

const isEntryReference = (field: StarterField) =>
  field.type === "Array" ||
  (field.type === "Link" && field.linkType === "Entry");

const defaultWidget = (field: StarterField): BuiltinEditor => {
  if (field.type === "Link") {
    return field.linkType === "Asset" ? "assetLinkEditor" : "entryLinkEditor";
  }

  const widgets = {
    Array: "entryLinksEditor",
    Boolean: "boolean",
    RichText: "richTextEditor",
    Symbol: "singleLine",
    Text: "multipleLine",
  } as const satisfies Record<Exclude<StarterFieldType, "Link">, BuiltinEditor>;

  return widgets[field.type];
};

const fieldValidations = (field: StarterField): IValidation[] => {
  const validations: IValidation[] = [];

  if (field.unique === true) {
    validations.push({ unique: true });
  }

  if (field.size !== undefined) {
    validations.push({ size: field.size });
  }

  if (field.linkContentTypes !== undefined) {
    validations.push({ linkContentType: [...field.linkContentTypes] });
  }

  if (field.linkMimetypeGroup !== undefined) {
    validations.push({ linkMimetypeGroup: [...field.linkMimetypeGroup] });
  }

  return validations;
};

const applyField = (contentType: ContentType, field: StarterField) => {
  const created = contentType
    .createField(field.id)
    .name(field.name)
    .type(field.type)
    .required(field.required)
    .localized(field.localized);

  if (field.linkType !== undefined) {
    created.linkType(field.linkType);
  }

  if (field.items !== undefined) {
    created.items({
      linkType: field.items.linkType,
      type: field.items.type,
      validations: [{ linkContentType: [...field.items.linkContentTypes] }],
    });
  }

  const validations = fieldValidations(field);

  if (validations.length > 0) {
    created.validations(validations);
  }
};

const applyFieldControl = (contentType: ContentType, field: StarterField) => {
  if (field.widgetId === undefined && field.helpText === undefined) {
    return;
  }

  const settings: IEditorInterfaceOptions = { ...field.widgetSettings };

  if (field.helpText !== undefined) {
    settings.helpText = field.helpText;
  }

  contentType.changeFieldControl(
    field.id,
    "builtin",
    field.widgetId ?? defaultWidget(field),
    settings
  );
};

export const applyStarterContentModel = (
  migration: Parameters<MigrationFunction>[0]
) => {
  for (const definition of STARTER_CONTENT_TYPES) {
    const contentType = migration
      .createContentType(definition.id)
      .name(definition.name)
      .description(definition.description)
      .displayField(definition.displayField);

    for (const field of definition.fields) {
      if (!isEntryReference(field)) {
        applyField(contentType, field);
      }
    }
  }

  for (const definition of STARTER_CONTENT_TYPES) {
    const contentType = migration.editContentType(definition.id);

    for (const field of definition.fields) {
      if (isEntryReference(field)) {
        applyField(contentType, field);
      }
    }

    for (const field of definition.fields) {
      applyFieldControl(contentType, field);
    }
  }
};

export const createStarterContentModel: MigrationFunction = (migration) => {
  applyStarterContentModel(migration);
};
