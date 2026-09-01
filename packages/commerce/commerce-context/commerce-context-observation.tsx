import type { Store } from "../store";

export function CommerceContextObservation({
  store,
}: {
  readonly store: Store;
}) {
  return (
    <span
      aria-hidden="true"
      data-commerce-context=""
      data-currency={store.currency}
      data-locale={store.locale}
      data-store-key={store.storeKey}
      hidden
    />
  );
}
