// Reusable type for livePreviewProps
export type LivePreviewProps<T extends readonly string[]> = {
  root: Record<string, string>;
} & Record<T[number], Record<string, string>>;
