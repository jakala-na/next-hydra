import { z } from "zod";

const contentTypeBlockSchema = z
  .object({ uid: z.string().min(1) })
  .passthrough();
const entryComponentSchema = z.object({}).passthrough();
const entryBlockSchema = z
  .record(z.string(), entryComponentSchema)
  .refine(
    (block) => Object.keys(block).length === 1,
    "a contributed entry block must have exactly one component key"
  );

const contributionSchema = z.object({
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

export type MaterializedRecipeContribution = {
  contentTypeUid: string;
  entryContentType: string;
  entryLocale: string;
  entryUid: string;
  id: string;
};

export type AppliedRecipeContribution = {
  contentType: string;
  contribution: MaterializedRecipeContribution;
  entries: string;
};

export function recipeContributionTarget(
  input: string
): MaterializedRecipeContribution {
  const contribution = contributionSchema.parse(JSON.parse(input));
  return {
    contentTypeUid: contribution.contentType.uid,
    entryContentType: contribution.entry.contentType,
    entryLocale: contribution.entry.locale,
    entryUid: contribution.entry.uid,
    id: contribution.id,
  };
}

export function applyRecipeContribution(options: {
  contentType: string;
  contribution: string;
  entries: string;
}): AppliedRecipeContribution {
  const contribution = contributionSchema.parse(
    JSON.parse(options.contribution)
  );
  const contentType = contentTypeSchema.parse(JSON.parse(options.contentType));
  const entries = entriesSchema.parse(JSON.parse(options.entries));
  const blockField = contentType.schema.find(
    (field) => field.uid === contribution.contentType.blockField
  );
  if (!blockField?.blocks) {
    throw new Error(
      `${contribution.id} targets missing block field ${contribution.contentType.blockField}`
    );
  }

  const contributedBlockUid = contribution.contentType.block.uid;
  if (!blockField.blocks.some((block) => block.uid === contributedBlockUid)) {
    blockField.blocks.push(contribution.contentType.block);
  }

  const entry = entries[contribution.entry.uid];
  if (!entry || entry.locale !== contribution.entry.locale) {
    throw new Error(
      `${contribution.id} targets missing ${contribution.entry.contentType} entry ${contribution.entry.uid} (${contribution.entry.locale})`
    );
  }
  const contributedEntryBlockUid = Object.keys(contribution.entry.block).at(0);
  if (contributedEntryBlockUid === undefined) {
    throw new Error(`${contribution.id} contributes an empty entry block`);
  }
  if (
    !entry.components.some(
      (block) => Object.keys(block).at(0) === contributedEntryBlockUid
    )
  ) {
    entry.components.push(contribution.entry.block);
  }

  return {
    contentType: `${JSON.stringify(contentType, null, 2)}\n`,
    contribution: {
      contentTypeUid: contribution.contentType.uid,
      entryContentType: contribution.entry.contentType,
      entryLocale: contribution.entry.locale,
      entryUid: contribution.entry.uid,
      id: contribution.id,
    },
    entries: `${JSON.stringify(entries, null, 2)}\n`,
  };
}
