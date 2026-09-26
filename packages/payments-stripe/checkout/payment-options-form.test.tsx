import { act, useId } from "react";
import { createRoot } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { PaymentElementsBoundary } from "./payment-elements-boundary";
import type { PaymentElementsBoundaryProps } from "./payment-elements-boundary";

const roots: ReturnType<typeof createRoot>[] = [];
const observedOptions: unknown[] = [];

const TestElementsProvider: NonNullable<
  PaymentElementsBoundaryProps["elementsProvider"]
> = ({ children, options }) => {
  observedOptions.push(options);
  const instance = useId();
  const clientSecret = options?.clientSecret;
  if (clientSecret === undefined) {
    throw new Error("Expected a Stripe client secret");
  }
  return (
    <div data-client-secret={clientSecret} data-elements-instance={instance}>
      {children}
    </div>
  );
};

const renderBoundary = (clientToken: string) => (
  <PaymentElementsBoundary
    clientToken={clientToken}
    elementsProvider={TestElementsProvider}
    stripe={null}
  >
    <span>Card fields</span>
  </PaymentElementsBoundary>
);

describe(PaymentElementsBoundary, () => {
  beforeAll(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(() => {
    act(() => {
      for (const root of roots.splice(0)) {
        root.unmount();
      }
    });
    document.body.replaceChildren();
    observedOptions.length = 0;
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("remounts Stripe Elements when Checkout receives a new Card intent", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(renderBoundary("client-secret-1"));
    });
    const firstInstance = container.querySelector<HTMLElement>(
      "[data-elements-instance]"
    )?.dataset.elementsInstance;

    act(() => {
      root.render(renderBoundary("client-secret-2"));
    });
    const currentElements = container.querySelector<HTMLElement>(
      "[data-elements-instance]"
    );

    expect(currentElements?.dataset.clientSecret).toBe("client-secret-2");
    expect(currentElements?.dataset.elementsInstance).not.toBe(firstInstance);
  });

  it("keeps Stripe Elements options stable while the Card intent is unchanged", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(renderBoundary("client-secret-1"));
    });
    const initialOptions = observedOptions.at(-1);

    act(() => {
      root.render(renderBoundary("client-secret-1"));
    });

    expect(observedOptions.at(-1)).toBe(initialOptions);
  });
});
