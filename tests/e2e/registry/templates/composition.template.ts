import { mergeTests } from "@playwright/test";
import { test as base } from "@repo/e2e-testing";

/*{% echo imports %}*/

export const test = mergeTests(base, {/*{{ slots.fixtures }}*/});
