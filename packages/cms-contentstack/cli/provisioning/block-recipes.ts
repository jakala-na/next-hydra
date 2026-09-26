import { z } from "zod";

const contentTypeBlockSchema = z
  .object({ uid: z.string().min(1) })
  .passthrough();
const entryComponentSchema = z.object({}).passthrough();
const entryBlockSchema = z
  .record(z.string(), entryComponentSchema)
  .refine(
    (block) => Object.keys(block).length === 1,
    "a recipe entry block must have exactly one component key"
  );

const blockRecipeSchema = z.object({
  contentType: z.object({
    block: contentTypeBlockSchema,
    blockField: z.string().min(1),
    uid: z.string().min(1),
  }),
  entry: z.object({
    block: entryBlockSchema,
    contentType: z.string().min(1),
    locale: z.string().min(1),
    uid: z.string().min(1),
  }),
  id: z.string().min(1),
});

const contentTypeSchema = z
  .object({
    schema: z.array(
      z
        .object({
          blocks: z.array(contentTypeBlockSchema).optional(),
          uid: z.string(),
        })
        .passthrough()
    ),
  })
  .passthrough();

const entriesSchema = z.record(
  z.string(),
  z
    .object({
      components: z.array(entryBlockSchema),
      locale: z.string(),
      uid: z.string(),
    })
    .passthrough()
);

export type BlockRecipeTarget = {
  contentTypeUid: string;
  entryContentType: string;
  entryLocale: string;
  entryUid: string;
  id: string;
};

export type AppliedBlockRecipe = {
  contentType: string;
  entries: string;
  recipe: BlockRecipeTarget;
};

export function blockRecipeTarget(input: string): BlockRecipeTarget {
  const recipe = blockRecipeSchema.parse(JSON.parse(input));
  return {
    contentTypeUid: recipe.contentType.uid,
    entryContentType: recipe.entry.contentType,
    entryLocale: recipe.entry.locale,
    entryUid: recipe.entry.uid,
    id: recipe.id,
  };
}

export function applyBlockRecipe(options: {
  contentType: string;
  entries: string;
  recipe: string;
}): AppliedBlockRecipe {
  const recipe = blockRecipeSchema.parse(JSON.parse(options.recipe));
  const contentType = contentTypeSchema.parse(JSON.parse(options.contentType));
  const entries = entriesSchema.parse(JSON.parse(options.entries));
  const blockField = contentType.schema.find(
    (field) => field.uid === recipe.contentType.blockField
  );
  if (!blockField?.blocks) {
    throw new Error(
      `${recipe.id} targets missing block field ${recipe.contentType.blockField}`
    );
  }

  const blockUid = recipe.contentType.block.uid;
  if (!blockField.blocks.some((block) => block.uid === blockUid)) {
    blockField.blocks.push(recipe.contentType.block);
  }

  const entry = entries[recipe.entry.uid];
  if (!entry || entry.locale !== recipe.entry.locale) {
    throw new Error(
      `${recipe.id} targets missing ${recipe.entry.contentType} entry ${recipe.entry.uid} (${recipe.entry.locale})`
    );
  }
  const entryBlockUid = Object.keys(recipe.entry.block).at(0);
  if (entryBlockUid === undefined) {
    throw new Error(`${recipe.id} contains an empty entry block`);
  }
  if (
    !entry.components.some(
      (block) => Object.keys(block).at(0) === entryBlockUid
    )
  ) {
    entry.components.push(recipe.entry.block);
  }

  return {
    contentType: `${JSON.stringify(contentType, null, 2)}\n`,
    entries: `${JSON.stringify(entries, null, 2)}\n`,
    recipe: {
      contentTypeUid: recipe.contentType.uid,
      entryContentType: recipe.entry.contentType,
      entryLocale: recipe.entry.locale,
      entryUid: recipe.entry.uid,
      id: recipe.id,
    },
  };
}
