export interface ContentIndexingHandoff {
  readonly instructions: readonly [string, ...string[]];
  readonly title: string;
}

export const formatContentIndexingHandoff = (
  handoff: ContentIndexingHandoff
): string =>
  [
    "",
    `${handoff.title}:`,
    ...handoff.instructions.map(
      (instruction, index) => `  ${index + 1}. ${instruction}`
    ),
  ].join("\n");
