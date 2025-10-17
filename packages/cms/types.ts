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
