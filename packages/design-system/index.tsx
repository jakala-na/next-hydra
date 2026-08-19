import { AnalyticsProvider } from "@repo/analytics";

import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";

export const DesignSystemProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <AnalyticsProvider>
    <TooltipProvider>{children}</TooltipProvider>
    <Toaster />
  </AnalyticsProvider>
);
