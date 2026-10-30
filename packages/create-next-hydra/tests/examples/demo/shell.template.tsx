/*{% echo imports %}*/
import { ArchitectureBoundary } from "@repo/demo-architecture/boundary";
import { ArchitectureToolbar } from "@repo/demo-architecture/toolbar";

import "@repo/demo-architecture/styles.css";
export const shell = (
  <main>
    <ArchitectureBoundary name="Shell">
      <article>Content</article>
      {/*{{ slots.content }}*/}
    </ArchitectureBoundary>
    <ArchitectureToolbar />
  </main>
);
