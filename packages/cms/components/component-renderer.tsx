/**
 * ComponentRenderer is a component that renders components based on the data supplied.
 *
 * A few ground principles for ComponentRenderer
 *
 * 1. It should accept data and decide which component(s) to render
 * 2. It should allow arrays of data to be passed and handle null/undefined
 * 3. As a proxy, it should let you know if it can't render the component you're asking because you didn't provide enough data.
 * 4. It should be able to render the component(s) with the data you provided.
 * 5. It should skip rendering if component is not found in the componentMap.
 */

import type { Locale } from "@repo/i18n";
import type { ComponentInstance } from "@uniformdev/canvas";
import { HeroSection } from "./blocks/hero-section";

export const componentMap = {
  heroSection: HeroSection,
} as const;

export default async function ComponentRenderer({
  components,
  locale,
}: {
  components: ComponentInstance[];
  locale: Locale;
}) {
  "use server";

  const renderedItems = components.map((item) => {
    const Component = componentMap[item.type as keyof typeof componentMap];
    if (!Component) {
      return null;
    }
    return <Component key={item._id} data={item.parameters} locale={locale} />;
  });
  return <div>{renderedItems}</div>;
}
