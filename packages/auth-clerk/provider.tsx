"use client";

import { ClerkProvider } from "@clerk/nextjs";
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
  return (
    <Suspense fallback={null}>
      <ClerkProvider
        {...properties}
        appearance={{
          elements: {
            dividerLine: "bg-border",
            navbarButton: "text-foreground",
            organizationPreviewAvatarContainer: "shrink-0",
            organizationPreviewMainIdentifier: "text-foreground",
            organizationPreview__organizationSwitcherTrigger: "gap-2",
            organizationSwitcherTriggerIcon: "text-muted-foreground",
            organizationSwitcherTrigger__open: "bg-background",
            socialButtonsIconButton: "bg-card",
          },
          options: {
            helpPageUrl: helpUrl,
            privacyPageUrl: privacyUrl,
            termsPageUrl: termsUrl,
          },
          variables: {
            fontFamily: "var(--font-sans)",
            fontFamilyButtons: "var(--font-sans)",
            fontWeight: {
              bold: "var(--font-weight-bold)",
              medium: "var(--font-weight-medium)",
              normal: "var(--font-weight-normal)",
            },
          },
        }}
      />
    </Suspense>
  );
};
