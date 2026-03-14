"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useHookFormAction } from "@next-safe-action/adapter-react-hook-form/hooks";
import { requiresRegion } from "@repo/commerce/lib/b2b-registration/schema";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  useFormField,
} from "@repo/design-system/components/ui/form";
import { Input } from "@repo/design-system/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { useLocale, useTranslations } from "@repo/i18n";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { FieldPath } from "react-hook-form";
import {
  getCountryOptions,
  type RegistrationFormInput,
  registrationFormSchema,
} from "../lib/registration-form-schema";
import { translateRegistrationMessage } from "../lib/registration-i18n";
import { submitRegistrationAction } from "../lib/submit-registration-action";

type RegistrationFormProps = {
  readonly apiBaseUrl: string;
  readonly awaitingApprovalUrl: string;
};

const defaultValues: RegistrationFormInput = {
  apiBaseUrl: "",
  companyName: "",
  companyPhone: "",
  vatId: "",
  contactFirstName: "",
  contactLastName: "",
  email: "",
  address: {
    streetName: "",
    additionalStreetInfo: "",
    postalCode: "",
    city: "",
    region: "",
    country: "US",
  },
};

function TranslatedFormMessage({ className }: { readonly className?: string }) {
  const t = useTranslations("web.registration.form");
  const { error, formMessageId } = useFormField();
  const body = error?.message
    ? translateRegistrationMessage(t, String(error.message))
    : null;

  if (!body) {
    return null;
  }

  return (
    <p className={className} id={formMessageId}>
      {body}
    </p>
  );
}

function ReservedFormMessage() {
  return (
    <div className="min-h-5">
      <TranslatedFormMessage className="text-destructive text-sm" />
    </div>
  );
}

export function RegistrationForm({
  apiBaseUrl,
  awaitingApprovalUrl,
}: RegistrationFormProps) {
  const t = useTranslations("web.registration.form");
  const locale = useLocale();
  const router = useRouter();
  const { action, form, handleSubmitWithAction } = useHookFormAction(
    submitRegistrationAction,
    zodResolver(registrationFormSchema),
    {
      actionProps: {
        onSuccess: ({ data }) => {
          router.push(
            `${awaitingApprovalUrl}?email=${encodeURIComponent(data.email)}` as Route
          );
        },
      },
      formProps: {
        defaultValues: {
          ...defaultValues,
          apiBaseUrl,
        },
      },
    }
  );
  const selectedCountry = form.watch("address.country");
  const isRegionRequired = requiresRegion(selectedCountry);
  const countryOptions = getCountryOptions(locale);
  const formError =
    action.result.validationErrors?._errors?.[0] ??
    action.result.serverError ??
    null;
  const renderRowFieldMessage = (name: FieldPath<RegistrationFormInput>) => {
    const message = form.getFieldState(name, form.formState).error?.message;

    return (
      <p className="min-h-5 text-destructive text-sm">
        {message ? translateRegistrationMessage(t, message) : ""}
      </p>
    );
  };

  useEffect(() => {
    form.setValue("apiBaseUrl", apiBaseUrl, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  }, [apiBaseUrl, form]);

  useEffect(() => {
    if (!isRegionRequired) {
      form.clearErrors("address.region");
    }
  }, [form, isRegionRequired]);

  return (
    <Form {...form}>
      <form className="grid gap-6" onSubmit={handleSubmitWithAction}>
        <Card className="border-stone-300 shadow-none">
          <CardHeader>
            <CardTitle>{t("sections.company")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="companyName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.companyName.label")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("fields.companyName.placeholder")}
                      {...field}
                    />
                  </FormControl>
                  <ReservedFormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="companyPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.companyPhone.label")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("fields.companyPhone.placeholder")}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <ReservedFormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="vatId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.vatId.label")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("fields.vatId.placeholder")}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <ReservedFormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address.country"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.country.label")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={t("fields.country.placeholder")}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {countryOptions.map((country) => (
                        <SelectItem key={country.value} value={country.value}>
                          {country.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <ReservedFormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address.streetName"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>{t("fields.streetAddress.label")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("fields.streetAddress.placeholder")}
                      {...field}
                    />
                  </FormControl>
                  <ReservedFormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address.region"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {isRegionRequired
                      ? t("fields.region.requiredLabel")
                      : t("fields.region.optionalLabel")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={
                        isRegionRequired
                          ? t("fields.region.requiredLabel")
                          : t("fields.region.optionalLabel")
                      }
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <ReservedFormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address.additionalStreetInfo"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>{t("fields.addressLine2.label")}</FormLabel>
                  <FormControl>
                    <Textarea
                      className="min-h-28"
                      placeholder={t("fields.addressLine2.placeholder")}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <ReservedFormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address.postalCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.postalCode.label")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("fields.postalCode.placeholder")}
                      {...field}
                    />
                  </FormControl>
                  <ReservedFormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address.city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("fields.city.label")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("fields.city.placeholder")}
                      {...field}
                    />
                  </FormControl>
                  <ReservedFormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card className="border-stone-300 shadow-none">
          <CardHeader>
            <CardTitle>{t("sections.contact")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <div className="grid gap-4 md:grid-cols-2 md:gap-8">
                <FormField
                  control={form.control}
                  name="contactFirstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fields.firstName.label")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("fields.firstName.placeholder")}
                          {...field}
                        />
                      </FormControl>
                      <TranslatedFormMessage className="sr-only" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contactLastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fields.lastName.label")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("fields.lastName.placeholder")}
                          {...field}
                        />
                      </FormControl>
                      <TranslatedFormMessage className="sr-only" />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2 md:gap-8">
                {renderRowFieldMessage("contactFirstName")}
                {renderRowFieldMessage("contactLastName")}
              </div>
            </div>

            <div className="grid gap-2">
              <div className="grid gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fields.email.label")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("fields.email.placeholder")}
                          type="email"
                          {...field}
                        />
                      </FormControl>
                      <TranslatedFormMessage className="sr-only" />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4">{renderRowFieldMessage("email")}</div>
            </div>
          </CardContent>
        </Card>

        {formError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">
            {translateRegistrationMessage(t, formError)}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-4">
          <p className="max-w-xl text-sm text-stone-600">{t("disclaimer")}</p>
          <Button
            className="min-w-40"
            disabled={action.isPending}
            type="submit"
          >
            {action.isPending ? t("actions.submitting") : t("actions.submit")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
