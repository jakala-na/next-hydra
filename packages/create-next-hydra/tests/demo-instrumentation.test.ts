import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { eraseDemoInstrumentation } from "../src/demo-instrumentation.ts";

it.effect(
  "rejects lowercase aliases so intrinsic HTML elements cannot be erased",
  () =>
    Effect.gen(function* () {
      for (const source of [
        'import { ArchitectureBoundary as main } from "@repo/demo-architecture/boundary"; const view = <main><h1>Title</h1></main>;',
        'import { ArchitectureToolbar as input } from "@repo/demo-architecture/toolbar"; const view = <input />;',
      ]) {
        const error = yield* eraseDemoInstrumentation(
          "intrinsic.tsx",
          source
        ).pipe(Effect.flip);
        expect(error._tag).toBe("InvalidComposition");
      }
    })
);

it.effect(
  "rejects indirect imports and demo values escaping into application interfaces",
  () =>
    Effect.gen(function* () {
      for (const source of [
        "const demo = import(`@repo/demo-architecture/boundary`);",
        'export { ArchitectureBoundary } from "@repo/demo-architecture/boundary";',
        'import { ArchitectureBoundary } from "@repo/demo-architecture/boundary"; export const Wrapper = ArchitectureBoundary;',
      ]) {
        const error = yield* eraseDemoInstrumentation(
          "escape.tsx",
          source
        ).pipe(Effect.flip);
        expect(error._tag).toBe("InvalidComposition");
      }
    })
);

it.effect(
  "removes lazy display computations without touching application components with the same name",
  () =>
    Effect.gen(function* () {
      const source = `
import { ArchitectureBoundary } from "./application";
import { ArchitectureBoundary as Demo } from "@repo/demo-architecture/boundary";
const view = <Demo cacheTags={() => readDisplayTags()}><ArchitectureBoundary /></Demo>;
`;
      const output = yield* eraseDemoInstrumentation("lazy.tsx", source);
      expect(output).toContain(
        'import { ArchitectureBoundary } from "./application";'
      );
      expect(output).toContain("<ArchitectureBoundary />");
      expect(output).not.toContain("readDisplayTags");
      expect(output).not.toContain("demo-architecture");
    })
);

it.effect(
  "erases an aliased demo boundary while preserving cache operations and its children",
  () =>
    Effect.gen(function* () {
      const output = yield* eraseDemoInstrumentation(
        "article.tsx",
        `
import { ArchitectureBoundary as Demo } from "@repo/demo-architecture/boundary";
import { cacheTag } from "next/cache";
export async function Article({ tags }) {
  "use cache";
  cacheTag(...tags);
  return <Demo name="Article" cacheTags={tags}><ArticleContent /></Demo>;
}
`
      );
      expect(output).not.toContain("demo-architecture");
      expect(output).not.toContain("cacheTags=");
      expect(output).toContain('"use cache";');
      expect(output).toContain("cacheTag(...tags);");
      expect(output).toContain("<ArticleContent />");
    })
);

it.effect(
  "preserves client directives, nested Suspense and siblings while removing toolbar and styles",
  () =>
    Effect.gen(function* () {
      const output = yield* eraseDemoInstrumentation(
        "client.tsx",
        `
"use client";
import { ArchitectureBoundary } from "@repo/demo-architecture/boundary";
import { ArchitectureToolbar } from "@repo/demo-architecture/toolbar";
import "@repo/demo-architecture/styles.css";
export function View() {
  return <main><ArchitectureBoundary name="View">
    <Suspense fallback={<ArchitectureBoundary name="Pending"><Skeleton /></ArchitectureBoundary>}>
      <Content /><Actions />
    </Suspense>
  </ArchitectureBoundary><ArchitectureToolbar /></main>;
}
`
      );
      expect(output).toContain('"use client";');
      expect(output).toContain("<Suspense fallback={(<Skeleton />)}>");
      expect(output).toContain("<Content /><Actions />");
      expect(output).not.toContain("Architecture");
      expect(output).not.toContain("demo-architecture");
    })
);

it.effect(
  "refuses boundary props whose removal could change application behavior",
  () =>
    Effect.gen(function* () {
      for (const props of [
        'className="grid"',
        'key="one"',
        "ref={ref}",
        "{...metadata}",
        "cacheTags={loadData()}",
        "cacheTags={count++}",
      ]) {
        const error = yield* eraseDemoInstrumentation(
          "unsafe.tsx",
          `
import { ArchitectureBoundary } from "@repo/demo-architecture/boundary";
const view = <ArchitectureBoundary ${props}><Content /></ArchitectureBoundary>;
`
        ).pipe(Effect.flip);
        expect(error._tag).toBe("InvalidComposition");
        expect(error.message).toContain("unsafe.tsx");
      }
    })
);

it.effect(
  "unwraps single JSX children and direct HTML children without introducing useless fragments",
  () =>
    Effect.gen(function* () {
      const output = yield* eraseDemoInstrumentation(
        "simple.tsx",
        `
import { ArchitectureBoundary as Demo } from "@repo/demo-architecture/boundary";
const element = <Demo><article /></Demo>;
const siblings = <main><Demo><h1 /><article /></Demo></main>;
const grouped = <Demo><h1 /><article /></Demo>;
function View() { return <Demo>
  <article />
</Demo>; }
`
      );
      expect(output).toContain("const element = (<article />);");
      expect(output).toContain(
        "const siblings = <main><h1 /><article /></main>;"
      );
      expect(output).toContain("const grouped = <><h1 /><article /></>;");
      expect(output).toContain("return (\n  <article />\n);");
    })
);

it.effect(
  "preserves text token boundaries and custom component child grouping",
  () =>
    Effect.gen(function* () {
      const output = yield* eraseDemoInstrumentation(
        "children.tsx",
        `
import { ArchitectureToolbar } from "@repo/demo-architecture/toolbar";
import { ArchitectureBoundary as Demo } from "@repo/demo-architecture/boundary";
const toolbar = <p>first<ArchitectureToolbar />\n next</p>;
const text = <p>first<Demo>\n second\n</Demo>third</p>;
const padded = <p>before <Demo>\n <em />\n</Demo> after</p>;
const component = <RequireOneChild><Demo><h1 /><article /></Demo></RequireOneChild>;
`
      );
      expect(output).toContain("<p>first{null}\n next</p>");
      expect(output).toContain("<p>first<>\n second\n</>third</p>");
      expect(output).toContain("<p>before <em /> after</p>");
      expect(output).toContain(
        "<RequireOneChild><><h1 /><article /></></RequireOneChild>"
      );
    })
);
