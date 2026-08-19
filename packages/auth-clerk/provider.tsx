"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { Theme } from "@clerk/types";
import type { ComponentProps } from "react";
import { Suspense } from "react";

type AuthProviderProperties = ComponentProps<typeof ClerkProvider> & {
  privacyUrl?: string;
  termsUrl?: string;
  helpUrl?: string;
};

export const AuthProvider = ({
  privacyUrl,
  termsUrl,
  helpUrl,
  ...properties
}: AuthProviderProperties) => {
  const variables: Theme["variables"] = {
    fontFamily: "var(--font-sans)",
    fontFamilyButtons: "var(--font-sans)",
    fontWeight: {
      bold: "var(--font-weight-bold)",
      medium: "var(--font-weight-medium)",
      normal: "var(--font-weight-normal)",
    },
  };

  const elements: Theme["elements"] = {
    dividerLine: "bg-border",
    navbarButton: "text-foreground",
    organizationPreviewAvatarContainer: "shrink-0",
    organizationPreviewMainIdentifier: "text-foreground",
    organizationPreview__organizationSwitcherTrigger: "gap-2",
    organizationSwitcherTriggerIcon: "text-muted-foreground",
    organizationSwitcherTrigger__open: "bg-background",
    socialButtonsIconButton: "bg-card",
  };

  const layout: Theme["layout"] = {
    helpPageUrl: helpUrl,
    privacyPageUrl: privacyUrl,
    termsPageUrl: termsUrl,
  };

  return (
    <Suspense fallback={null}>
      <ClerkProvider
        {...properties}
        appearance={{ elements, layout, variables }}
      />
    </Suspense>
  );
};
