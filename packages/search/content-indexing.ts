/** Operations a CMS needs to maintain its Content records, not provider ACLs. */
export type ContentIndexingOperation =
  | "list-indices"
  | "search"
  | "browse"
  | "upsert"
  | "delete"
  | "clear";
