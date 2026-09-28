import { ArrowUpRight, Megaphone } from "lucide-react";

import { Alert, AlertDescription } from "../ui/alert";

export type AnnouncementProps = {
  message: string;
  linkLabel: string;
  linkUrl: string;
};

export function Announcement({
  message,
  linkLabel,
  linkUrl,
}: AnnouncementProps) {
  return (
    <Alert
      aria-label="Announcement"
      className="flex items-center justify-center gap-3 rounded-none border-x-0 border-t-0 bg-primary px-4 py-2.5 text-primary-foreground"
      role="note"
    >
      <Megaphone aria-hidden="true" className="hidden shrink-0 sm:block" />
      <AlertDescription className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-primary-foreground">
        <span>{message}</span>
        <a
          className="inline-flex items-center gap-1 font-semibold underline underline-offset-4 hover:no-underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4"
          href={linkUrl}
        >
          {linkLabel}
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </a>
      </AlertDescription>
    </Alert>
  );
}
