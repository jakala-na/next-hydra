import { ArchitectureBoundary } from "@repo/demo-architecture/boundary";
import { ArchitectureToolbar } from "@repo/demo-architecture/toolbar";

import "@repo/demo-architecture/styles.css";

export function View({ tags }: { tags: readonly string[] }) {
  return (
    <main>
      <ArchitectureBoundary name="Article" cacheTags={() => tags}>
        <article>Article</article>
      </ArchitectureBoundary>
      <ArchitectureToolbar />
    </main>
  );
}
