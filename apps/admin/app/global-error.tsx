"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { fonts } from "@repo/design-system/lib/fonts";
import { captureException } from "@sentry/nextjs";
import type NextError from "next/error";
import { useEffect } from "react";

type GlobalErrorProperties = {
  readonly error: NextError & { digest?: string };
  readonly reset: () => void;
};

const GlobalError = ({ error, reset }: GlobalErrorProperties) => {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <html className={fonts} lang="en-US">
      <body className="grid min-h-dvh place-items-center p-6">
        <div className="grid gap-4 text-center">
          <h1 className="font-semibold text-2xl">Something went wrong</h1>
          <Button onClick={reset}>Try again</Button>
        </div>
      </body>
    </html>
  );
};

export default GlobalError;
