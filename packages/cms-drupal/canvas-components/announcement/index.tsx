import { Announcement } from "@repo/design-system/components/cms/announcement";

import type { CanvasComponentProps } from "../../generated/canvas-component-props";

export default function CanvasAnnouncement(
  props: CanvasComponentProps<"announcement">
) {
  return <Announcement {...props} />;
}
