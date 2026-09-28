import type { CanvasComponentProps } from "../../generated/canvas-component-props";

/** Native page-template slots; the application supplies its header and footer. */
export default function CanvasSiteShell({
  preHeader,
  postHeader,
  content,
  preFooter,
  postFooter,
}: CanvasComponentProps<"site-shell">) {
  return (
    <>
      {preHeader}
      {postHeader}
      {content}
      {preFooter}
      {postFooter}
    </>
  );
}
