import { analytics } from "@repo/analytics/posthog/server";
import { withAuth } from "@repo/auth/server";
import { flag } from "flags/next";

export const createFlag = (key: string) =>
  flag({
    async decide() {
      const user = await withAuth();

      if (!user.user) {
        return this.defaultValue as boolean;
      }

      const isEnabled = await analytics.isFeatureEnabled(key, user.user.id);

      return isEnabled ?? (this.defaultValue as boolean);
    },
    defaultValue: false,
    key,
  });
