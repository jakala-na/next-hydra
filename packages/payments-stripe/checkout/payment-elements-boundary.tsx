import { Elements } from "@stripe/react-stripe-js";
import { useMemo } from "react";
import type { ComponentProps, ReactNode } from "react";

export interface PaymentElementsBoundaryProps {
  readonly children: ReactNode;
  readonly clientToken: string;
  readonly elementsProvider?: typeof Elements;
  readonly stripe: ComponentProps<typeof Elements>["stripe"];
}

export function PaymentElementsBoundary({
  children,
  clientToken,
  elementsProvider: ElementsProvider = Elements,
  stripe,
}: PaymentElementsBoundaryProps) {
  const options = useMemo(() => ({ clientSecret: clientToken }), [clientToken]);

  return (
    <ElementsProvider key={clientToken} options={options} stripe={stripe}>
      {children}
    </ElementsProvider>
  );
}
