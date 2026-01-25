// Reusable type for livePreviewProps
export type LivePreviewProps<T extends readonly string[]> = {
  root: { [key: string]: string };
} & {
  [K in T[number]]: { [key: string]: string };
};
