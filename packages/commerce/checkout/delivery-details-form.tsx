"use client";

import { useTranslations } from "@repo/i18n";
import { useActionState, useEffect, useState } from "react";

import type { AddressBookReference } from "../domain/address-book";
import type { ShippingAddress } from "../domain/checkout";
import type {
  SaveCheckoutDeliveryDetailsAction,
  SaveCheckoutDeliveryDetailsActionResult,
} from "./action-contract";
import { MANUAL_DELIVERY_ADDRESS_CHOICE } from "./save-delivery-details-action-contract";

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
  actionResult: SaveCheckoutDeliveryDetailsActionResult | null
) =>
  actionResult?._tag === "Failure" &&
  (actionResult.failure.error._tag === "CheckoutMutationProviderFailure" ||
    actionResult.failure.error._tag === "CheckoutVersionConflict")
    ? actionResult.failure.error.addressBookReference
    : undefined;

export const deliveryAddressSelectionAfterAction = (
  actionResult: SaveCheckoutDeliveryDetailsActionResult | null,
  currentSelection: CheckoutDeliveryAddressSelection
): CheckoutDeliveryAddressSelection => {
  const retryReference = partialSaveReference(actionResult);

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
            type="text"
          />
        </div>
      </div>
    </>
  );
}

const ManualDeliveryDetailsFields = ({
  canUseAddressBook,
  messages,
  onSaveToAddressBookChange,
  saveToAddressBook,
  shippingAddress,
}: {
  readonly canUseAddressBook: boolean;
  readonly messages: CheckoutDeliveryDetailsMessages;
  readonly onSaveToAddressBookChange: (checked: boolean) => void;
  readonly saveToAddressBook: boolean;
  readonly shippingAddress?: ShippingAddress;
}) => (
  <>
    <ManualShippingAddressFields
      address={shippingAddress}
      messages={messages}
    />
    {canUseAddressBook ? (
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-3 rounded-md border border-border p-4">
        <input
          checked={saveToAddressBook}
          className="peer size-4"
          id="checkout-save-to-address-book"
          name="saveToAddressBook"
          onChange={(event) => {
            onSaveToAddressBookChange(event.currentTarget.checked);
          }}
          type="checkbox"
        />
        <label className="text-sm" htmlFor="checkout-save-to-address-book">
          {messages.addressBook.saveShippingAddress}
        </label>
        <label className="col-start-2 hidden items-center gap-3 text-sm peer-checked:flex">
          <input
            className="size-4"
            name="makeDefaultShipping"
            type="checkbox"
          />
          <span>{messages.addressBook.makeDefaultShipping}</span>
        </label>
      </div>
    ) : null}
  </>
);

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
                  onChange={() => {
                    onSelectionChange({
                      type: "addressBook",
                      reference: option.reference,
                    });
                  }}
                  required
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
          <div className="relative grid gap-4">
            <input
              checked={isManual}
              className="peer absolute top-5 left-4 size-4"
              id="checkout-delivery-address-manual"
              name="deliveryAddressChoice"
              onChange={() => {
                onSelectionChange({ type: "manual" });
              }}
              required
              type="radio"
              value={MANUAL_DELIVERY_ADDRESS_CHOICE}
            />
            <label
              className="cursor-pointer rounded-md border border-border py-4 pr-4 pl-11 peer-checked:border-primary peer-checked:bg-primary/5"
              htmlFor="checkout-delivery-address-manual"
            >
              <span className="font-medium text-sm">
                {messages.addressBook.useNewAddress}
              </span>
            </label>
            <div className="hidden gap-4 peer-checked:grid">
              <ManualDeliveryDetailsFields
                canUseAddressBook={canUseAddressBook}
                messages={messages}
                onSaveToAddressBookChange={onSaveToAddressBookChange}
                saveToAddressBook={saveToAddressBook}
                shippingAddress={shippingAddress}
              />
            </div>
          </div>
        </fieldset>
      ) : (
        <>
          <input
            name="deliveryAddressChoice"
            type="hidden"
            value={MANUAL_DELIVERY_ADDRESS_CHOICE}
          />
          <ManualDeliveryDetailsFields
            canUseAddressBook={canUseAddressBook}
            messages={messages}
            onSaveToAddressBookChange={onSaveToAddressBookChange}
            saveToAddressBook={saveToAddressBook}
            shippingAddress={shippingAddress}
          />
        </>
      )}
      <div>
        <button
          className="h-10 rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
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
  const [actionResult, formAction, isPending] = useActionState(
    saveAction,
    null
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
      deliveryAddressSelectionAfterAction(actionResult, currentSelection)
    );
  }, [actionResult]);

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
    actionResult?._tag === "Failure"
      ? actionResult.failure.displayMessage
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
