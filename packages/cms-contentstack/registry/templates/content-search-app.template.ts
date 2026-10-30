import { searchableContentTypes } from "../../search-content-types";
import { createContentSearchAppInstaller } from "./program";
/*{% echo imports %}*/

export const installContentSearchApp = createContentSearchAppInstaller(
  searchableContentTypes
);
