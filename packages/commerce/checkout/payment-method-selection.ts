import type { PaymentMethod, PaymentMethodOption } from "@repo/payments";

export const availablePaymentMethod = (
  methods: readonly PaymentMethodOption[],
  preferred: PaymentMethod
): PaymentMethod => {
  const preferredOption = methods.find((option) => option.method === preferred);
  if (preferredOption?.availability === "available") {
    return preferred;
  }

  return (
    methods.find((option) => option.availability === "available")?.method ??
    "card"
  );
};
