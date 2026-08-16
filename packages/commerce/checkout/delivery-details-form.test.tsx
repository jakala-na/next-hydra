import { createCheckoutTranslator } from "@repo/i18n/checkout-messages";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CountryCode } from "../domain/address";
import { AddressBookReference } from "../domain/address-book";
import {
  CheckoutDeliveryDetailsFormContent,
  type CheckoutDeliveryDetailsMessages,
  type CheckoutShippingAddressOption,
  deliveryAddressSelectionAfterAction,
  preferredDeliveryAddressSelection,
} from "./delivery-details-form";
import { MANUAL_DELIVERY_ADDRESS_CHOICE } from "./save-delivery-details-action-contract";

const officeReference = AddressBookReference.make("office");
const warehouseReference = AddressBookReference.make("warehouse");
const t = createCheckoutTranslator("de-DE");

const options = [
  {
    reference: officeReference,
    address: {
      addressLine1: "1 Office Road",
      postalCode: "10115",
      city: "Berlin",
      country: CountryCode.make("DE"),
    },
    defaultShipping: false,
  },
  {
    reference: warehouseReference,
    address: {
      addressLine1: "2 Warehouse Lane",
      addressLine2: "Loading bay 3",
      postalCode: "20095",
      city: "Hamburg",
      country: CountryCode.make("DE"),
    },
    defaultShipping: true,
  },
] as const satisfies readonly CheckoutShippingAddressOption[];

const messages = {
  addressBook: {
    chooseShippingAddress: t(
      "deliveryDetails.addressBook.chooseShippingAddress"
    ),
    defaultShipping: t("deliveryDetails.addressBook.defaultShipping"),
    makeDefaultShipping: t("deliveryDetails.addressBook.makeDefaultShipping"),
    saveShippingAddress: t("deliveryDetails.addressBook.saveShippingAddress"),
    useNewAddress: t("deliveryDetails.addressBook.useNewAddress"),
  },
  fields: {
    addressLine1: t("deliveryDetails.fields.addressLine1"),
    addressLine2: t("deliveryDetails.fields.addressLine2"),
    city: t("deliveryDetails.fields.city"),
    country: t("deliveryDetails.fields.country"),
    postalCode: t("deliveryDetails.fields.postalCode"),
    region: t("deliveryDetails.fields.region"),
  },
  save: t("deliveryDetails.actions.save"),
  saving: t("deliveryDetails.actions.saving"),
} as const satisfies CheckoutDeliveryDetailsMessages;

const renderContent = (
  overrides: Partial<
    Parameters<typeof CheckoutDeliveryDetailsFormContent>[0]
  > = {}
) =>
  renderToStaticMarkup(
    <CheckoutDeliveryDetailsFormContent
      isPending={false}
      messages={messages}
      onSaveToAddressBookChange={() => undefined}
      onSelectionChange={() => undefined}
      saveToAddressBook={false}
      selection={undefined}
      shippingAddressOptions={options}
      {...overrides}
    />
  );

describe("Checkout delivery address selection", () => {
  it("prefers the current reference, then Default Shipping, and otherwise requires a choice", () => {
    expect(preferredDeliveryAddressSelection(options, officeReference)).toEqual(
      { type: "addressBook", reference: officeReference }
    );
    expect(preferredDeliveryAddressSelection(options, undefined)).toEqual({
      type: "addressBook",
      reference: warehouseReference,
    });
    expect(
      preferredDeliveryAddressSelection(
        options.map((option) => ({ ...option, defaultShipping: false })),
        undefined
      )
    ).toBeUndefined();
    expect(preferredDeliveryAddressSelection([], undefined)).toEqual({
      type: "manual",
    });
    expect(preferredDeliveryAddressSelection(undefined, undefined)).toEqual({
      type: "manual",
    });
  });

  it("renders saved Shipping cards, the default marker, and new address last", () => {
    const html = renderContent({
      selection: { reference: warehouseReference, type: "addressBook" },
    });

    expect(html).toContain("Lieferadresse auswählen");
    expect(html.indexOf("1 Office Road")).toBeLessThan(
      html.indexOf("2 Warehouse Lane")
    );
    expect(html.indexOf("2 Warehouse Lane")).toBeLessThan(
      html.indexOf("Neue Adresse verwenden")
    );
    expect(html).toContain("Standard-Lieferadresse");
  });

  it("renders the native address choice as the only submitted selection", () => {
    const html = renderContent({
      selection: { reference: warehouseReference, type: "addressBook" },
    });

    expect(html).toContain('name="deliveryAddressChoice"');
    expect(html).not.toContain('name="addressBookReference"');
    expect(html).toContain(`value="${MANUAL_DELIVERY_ADDRESS_CHOICE}"`);
    expect(html).toContain('name="addressLine1"');
    expect(html).toContain("peer-checked:grid");
  });

  it("keeps native address selection usable before hydration", () => {
    const html = renderContent({
      selection: undefined,
      shippingAddressOptions: options.map((option) => ({
        ...option,
        defaultShipping: false,
      })),
    });

    expect(html).toContain('name="deliveryAddressChoice"');
    expect(html).toContain("required");
    expect(html).not.toContain('type="hidden" name="addressBookReference"');
    expect(html).not.toContain('disabled=""');
  });

  it("opens a successful empty Address Book and nests the default control under save", () => {
    const withoutDefault = renderContent({
      selection: { type: "manual" },
      shippingAddressOptions: [],
    });

    expect(withoutDefault).toContain('name="addressLine1"');
    expect(withoutDefault).toContain('name="saveToAddressBook"');
    expect(withoutDefault).toContain('name="makeDefaultShipping"');
    expect(withoutDefault).toContain(
      `value="${MANUAL_DELIVERY_ADDRESS_CHOICE}"`
    );
    expect(withoutDefault).toContain("Als Standard-Lieferadresse festlegen");
  });

  it("renders localized partial-save retry and pending states", () => {
    const retrySelection = deliveryAddressSelectionAfterAction(
      {
        _tag: "Failure",
        failure: {
          displayMessage: t(
            "errors.saveDeliveryDetails.CheckoutMutationProviderFailure"
          ),
          error: {
            _tag: "CheckoutMutationProviderFailure",
            addressBookReference: officeReference,
            message: "Commercetools update failed",
            operation: "checkout.deliveryDetails.save",
          },
        },
      },
      { type: "manual" }
    );
    const retryHtml = renderContent({
      errorMessage: t(
        "errors.saveDeliveryDetails.CheckoutMutationProviderFailure"
      ),
      selection: retrySelection,
    });
    const pendingHtml = renderContent({
      isPending: true,
      selection: { type: "manual" },
      shippingAddressOptions: [],
    });

    expect(retryHtml).toContain(
      "Lieferdetails konnten nicht gespeichert werden."
    );
    expect(retryHtml).toContain('role="alert"');
    expect(retryHtml).toContain('value="office"');
    expect(pendingHtml).toContain("Wird gespeichert...");
    expect(pendingHtml).toContain("disabled");
  });
});
