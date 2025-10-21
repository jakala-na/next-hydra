import type { LivePreviewHelper } from "@repo/cms/lib/utils/live-preview-helper";
import type { Locale } from "@repo/i18n";

export type Maybe<T> = T | null;

export type Connection<T> = {
  edges: Edge<T>[];
};

export type Edge<T> = {
  node: T;
};

export type CMSLocale = Lowercase<Locale>;

export type ComponentBaseProps = {
  livePreviewHelper?: LivePreviewHelper;
};

/** Custom Field - Commercetools Category */
export type CommercetoolsCategoryField = {
  data: Array<{
    id: string;
    version: number;
    versionModifiedAt: string;
    lastMessageSequenceNumber: number;
    createdAt: string;
    lastModifiedAt: string;
    lastModifiedBy: {
      isPlatformClient: boolean;
      user: {
        typeId: string;
        id: string;
      };
    };
    createdBy: {
      isPlatformClient: boolean;
      user: {
        typeId: string;
        id: string;
      };
    };
    key: string;
    name: Record<string, string>;
    slug: Record<string, string>;
    ancestors: unknown[];
    orderHint: string;
    assets: unknown[];
    cs_metadata: {
      multiConfigName: string;
      isConfigDeleted: boolean;
    };
  }>;
  type: string;
};
