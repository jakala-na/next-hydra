import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BusinessUnitSwitcher } from "./business-unit-switcher";

describe(BusinessUnitSwitcher, () => {
  it("shows the current Company when it is the only available membership", () => {
    const switcher = BusinessUnitSwitcher({
      currentBusinessUnitId: "business-unit-1",
      items: [{ id: "business-unit-1", label: "Hydra Supply" }],
    });

    const markup = renderToStaticMarkup(switcher);

    expect(markup).toContain('<fieldset aria-label="Company switcher"');
    expect(markup).toContain('title="Operating as Hydra Supply"');
    expect(markup).toContain("Operating as ");
    expect(markup).toContain("Hydra Supply");
  });
});
