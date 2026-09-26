import type { CanvasComponentProps } from "../../generated/canvas-component-props";

export default function CanvasRichText({
  html,
}: CanvasComponentProps<"rich-text">) {
  return (
    <div
      // oxlint-disable-next-line react/no-danger -- Canvas resolves HTML props through Drupal text filters; article bindings use body.processed.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
