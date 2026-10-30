/* oxlint-disable no-await-in-loop -- Setup hooks run in composition order after application health checks. */
import type { FullConfig } from "@playwright/test";

import { checkApplicationHealth } from "./application-health";

/*{% echo imports %}*/

export default async function setup(config: FullConfig) {
  await checkApplicationHealth(config);
  const initializers: (() => Promise<void>)[] = [/*{% echo slots.setup %}*/];
  for (const initialize of initializers) {
    await initialize();
  }
}
