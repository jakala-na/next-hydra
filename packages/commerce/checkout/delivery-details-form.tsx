"use client";

import { useTranslations } from "@repo/i18n";
import { useActionState, useEffect, useState } from "react";
import type { AddressBookReference } from "../domain/address-book";
import type { ShippingAddress } from "../domain/checkout";
import { checkoutActionErrorMessageKey } from "./action-error";
import {
  initialSaveCheckoutDeliveryDetailsActionState,
  type SaveCheckoutDeliveryDetailsAction,
  type SaveCheckoutDeliveryDetailsActionState,
} from "./save-delivery-details-state";

export interface CheckoutShippingAddressOption {
  readonly reference: AddressBookReference;
  readonly address: ShippingAddress;
  readonly defaultShipping: boolean;
}

export type CheckoutDeliveryAddressSelection =
  | {
      readonly type: "addressBook";
      readonly reference: AddressBookReference;
    }
  | { readonly type: "manual" }
  | undefined;

export interface CheckoutDeliveryDetailsMessages {
  readonly addressBook: {
    readonly chooseShippingAddress: string;
    readonly defaultShipping: string;
    readonly makeDefaultShipping: string;
    readonly saveShippingAddress: string;
    readonly useNewAddress: string;
  };
  readonly fields: {
    readonly addressLine1: string;
    readonly addressLine2: string;
    readonly city: string;
    readonly country: string;
    readonly postalCode: string;
    readonly region: string;
  };
  readonly save: string;
  readonly saving: string;
}

export const preferredDeliveryAddressSelection = (
  shippingAddressOptions: readonly CheckoutShippingAddressOption[] | undefined,
  currentReference: AddressBookReference | undefined
): CheckoutDeliveryAddressSelection => {
  if (shippingAddressOptions === undefined) {
    return { type: "manual" };
  }

  const current = shippingAddressOptions.find(
    (option) => option.reference === currentReference
  );

  if (current) {
    return { type: "addressBook", reference: current.reference };
  }

  const defaultShipping = shippingAddressOptions.find(
    (option) => option.defaultShipping
  );

  if (defaultShipping) {
    return {
      type: "addressBook",
      reference: defaultShipping.reference,
    };
  }

  return shippingAddressOptions.length === 0 ? { type: "manual" } : undefined;
};

const partialSaveReference = (
  actionState: SaveCheckoutDeliveryDetailsActionState
) => {
  if (
    actionState.status !== "error" ||
    (actionState.code !== "checkout.deliveryDetails.providerFailure" &&
      actionState.code !== "checkout.versionConflict")
  ) {
    return undefined;
  }

  return actionState.parameters?.addressBookReference;
};

export const deliveryAddressSelectionAfterAction = (
  actionState: SaveCheckoutDeliveryDetailsActionState,
  currentSelection: CheckoutDeliveryAddressSelection
): CheckoutDeliveryAddressSelection => {
  const retryReference = partialSaveReference(actionState);

  return retryReference === undefined
    ? currentSelection
    : { type: "addressBook", reference: retryReference };
};

function AddressLines({ address }: { readonly address: ShippingAddress }) {
  return (
    <span className="grid gap-0.5 text-sm">
      <span>{address.addressLine1}</span>
      {address.addressLine2 ? <span>{address.addressLine2}</span> : null}
      <span>
        {address.postalCode} {address.city}
      </span>
      {address.region ? <span>{address.region}</span> : null}
      <span>{address.country}</span>
    </span>
  );
}

function ManualShippingAddressFields({
  address,
  messages,
}: {
  readonly address?: ShippingAddress;
  readonly messages: CheckoutDeliveryDetailsMessages;
}) {
  return (
    <>
      <div className="grid gap-2">
        <label
          className="font-medium text-sm"
          htmlFor="checkout-address-line-1"
        >
          {messages.fields.addressLine1}
        </label>
        <input
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={address?.addressLine1 ?? ""}
          id="checkout-address-line-1"
          name="addressLine1"
          required
          type="text"
        />
      </div>
      <div className="grid gap-2">
        <label
          className="font-medium text-sm"
          htmlFor="checkout-address-line-2"
        >
          {messages.fields.addressLine2}
        </label>
        <input
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={address?.addressLine2 ?? ""}
          id="checkout-address-line-2"
          name="addressLine2"
          type="text"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <label className="font-medium text-sm" htmlFor="checkout-city">
            {messages.fields.city}
          </label>
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={address?.city ?? ""}
            id="checkout-city"
            name="city"
            required
            type="text"
          />
        </div>
        <div className="grid gap-2">
          <label className="font-medium text-sm" htmlFor="checkout-postal-code">
            {messages.fields.postalCode}
          </label>
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={address?.postalCode ?? ""}
            id="checkout-postal-code"
            name="postalCode"
            required
            type="text"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <label className="font-medium text-sm" htmlFor="checkout-region">
            {messages.fields.region}
          </label>
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={address?.region ?? ""}
            id="checkout-region"
            name="region"
            type="text"
          />
        </div>
        <div className="grid gap-2">
          <label className="font-medium text-sm" htmlFor="checkout-country">
            {messages.fields.country}
          </label>
          <input
            className="h-10 rounded-md border border-input bg-background px-3 text-sm uppercase"
            defaultValue={address?.country ?? ""}
            id="checkout-country"
            maxLength={2}
            name="country"
            required
            type="text"
          />
        </div>
      </div>
    </>
  );
}

export function CheckoutDeliveryDetailsFormContent({
  errorMessage,
  isPending,
  messages,
  onSaveToAddressBookChange,
  onSelectionChange,
  saveToAddressBook,
  selection,
  shippingAddress,
  shippingAddressOptions,
}: {
  readonly errorMessage?: string;
  readonly isPending: boolean;
  readonly messages: CheckoutDeliveryDetailsMessages;
  readonly onSaveToAddressBookChange: (checked: boolean) => void;
  readonly onSelectionChange: (
    selection: Exclude<CheckoutDeliveryAddressSelection, undefined>
  ) => void;
  readonly saveToAddressBook: boolean;
  readonly selection: CheckoutDeliveryAddressSelection;
  readonly shippingAddress?: ShippingAddress;
  readonly shippingAddressOptions?: readonly CheckoutShippingAddressOption[];
}) {
  const canUseAddressBook = shippingAddressOptions !== undefined;
  const hasSavedAddresses = (shippingAddressOptions?.length ?? 0) > 0;
  const isManual = selection?.type === "manual";

  return (
    <>
      {selection?.type === "addressBook" ? (
        <input
          name="addressBookReference"
          type="hidden"
          value={selection.reference}
        />
      ) : null}
      {errorMessage ? (
        <p
          aria-live="polite"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}
      {hasSavedAddresses ? (
        <fieldset className="grid gap-3" disabled={isPending}>
          <legend className="mb-2 font-medium text-sm">
            {messages.addressBook.chooseShippingAddress}
          </legend>
          {shippingAddressOptions?.map((option) => {
            const isSelected =
              selection?.type === "addressBook" &&
              selection.reference === option.reference;

            return (
              <label
                className="flex cursor-pointer gap-3 rounded-md border border-border p-4 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                key={option.reference}
              >
                <input
                  checked={isSelected}
                  className="mt-1 size-4"
                  name="deliveryAddressChoice"
                  onChange={() =>
                    onSelectionChange({
                      type: "addressBook",
                      reference: option.reference,
                    })
                  }
                  type="radio"
                  value={option.reference}
                />
                <span className="grid min-w-0 flex-1 gap-2">
                  <AddressLines address={option.address} />
                  {option.defaultShipping ? (
                    <span className="w-fit rounded-full bg-muted px-2 py-1 font-medium text-muted-foreground text-xs">
                      {messages.addressBook.defaultShipping}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
          <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-4 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input
              checked={isManual}
              className="size-4"
              name="deliveryAddressChoice"
              onChange={() => onSelectionChange({ type: "manual" })}
              type="radio"
              value="manual"
            />
            <span className="font-medium text-sm">
              {messages.addressBook.useNewAddress}
            </span>
          </label>
        </fieldset>
      ) : null}
      {isManual ? (
        <>
          <ManualShippingAddressFields
            address={shippingAddress}
            messages={messages}
          />
          {canUseAddressBook ? (
            <div className="grid gap-3 rounded-md border border-border p-4">
              <label className="flex items-center gap-3 text-sm">
                <input
                  checked={saveToAddressBook}
                  className="size-4"
                  name="saveToAddressBook"
                  onChange={(event) =>
                    onSaveToAddressBookChange(event.currentTarget.checked)
                  }
                  type="checkbox"
                />
                <span>{messages.addressBook.saveShippingAddress}</span>
              </label>
              {saveToAddressBook ? (
                <label className="ml-7 flex items-center gap-3 text-sm">
                  <input
                    className="size-4"
                    name="makeDefaultShipping"
                    type="checkbox"
                  />
                  <span>{messages.addressBook.makeDefaultShipping}</span>
                </label>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
      <div>
        <button
          className="h-10 rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending || selection === undefined}
          type="submit"
        >
          {isPending ? messages.saving : messages.save}
        </button>
      </div>
    </>
  );
}

export function CheckoutDeliveryDetailsForm({
  addressBookReference,
  cartId,
  saveAction,
  shippingAddress,
  shippingAddressOptions,
}: {
  readonly addressBookReference?: AddressBookReference;
  readonly cartId: string;
  readonly saveAction: SaveCheckoutDeliveryDetailsAction;
  readonly shippingAddress?: ShippingAddress;
  readonly shippingAddressOptions?: readonly CheckoutShippingAddressOption[];
}) {
  const t = useTranslations("web.checkout");
  const [actionState, formAction, isPending] = useActionState(
    saveAction,
    initialSaveCheckoutDeliveryDetailsActionState
  );
  const [selection, setSelection] = useState<CheckoutDeliveryAddressSelection>(
    () =>
      preferredDeliveryAddressSelection(
        shippingAddressOptions,
        addressBookReference
      )
  );
  const [saveToAddressBook, setSaveToAddressBook] = useState(false);

  useEffect(() => {
    setSelection((currentSelection) =>
      deliveryAddressSelectionAfterAction(actionState, currentSelection)
    );
  }, [actionState]);

  const messages: CheckoutDeliveryDetailsMessages = {
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
  };
  const errorMessage =
    actionState.status === "error"
      ? t(checkoutActionErrorMessageKey[actionState.code])
      : undefined;

  return (
    <form action={formAction} className="grid gap-4">
      <input name="cartId" type="hidden" value={cartId} />
      <CheckoutDeliveryDetailsFormContent
        errorMessage={errorMessage}
        isPending={isPending}
        messages={messages}
        onSaveToAddressBookChange={setSaveToAddressBook}
        onSelectionChange={setSelection}
        saveToAddressBook={saveToAddressBook}
        selection={selection}
        shippingAddress={shippingAddress}
        shippingAddressOptions={shippingAddressOptions}
      />
    </form>
  );
}
