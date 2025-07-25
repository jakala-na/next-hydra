export type Maybe<T> = T | null;

export type Connection<T> = {
  edges: Edge<T>[];
};

export type Edge<T> = {
  node: T;
};

export type Image = {
  url: string;
  altText: string;
};

export type NavigationItem = {
  title: string;
  href?: string;
  items?: { title: string; href: string }[];
};

export type Page = {
  id: string;
  title: string;
  handle: string;
  body: string;
  bodySummary: string;
  seo?: SEO;
  createdAt: string;
  updatedAt: string;
};

export type Article = {
  id: string;
  title: string;
  summary: string;
  system: {
    updated_at: string;
  };
};

export type SEO = {
  title: string;
  description: string;
};

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
