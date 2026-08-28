import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";

export const DesignSystemProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <>
    <TooltipProvider>{children}</TooltipProvider>
    <Toaster />
  </>
);
