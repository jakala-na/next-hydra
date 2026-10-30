import schema from "../content_types/landing_page.json" with { type: "json" };
import type { SearchContentType } from "./types.ts";

export const landingPageSearchType = {
  uid: schema.uid,
  label: schema.title,
  searchTextRoot: "landing_pages",
  mappingFields: ["display_title", "url"],
  instructions: [
    "Use the page's display title and URL in the mapping. Check that content.title is populated when the optional display title is empty.",
  ],
} satisfies SearchContentType;
