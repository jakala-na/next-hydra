"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  Alert,
  AlertDescription,
} from "@repo/design-system/components/ui/alert";
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
import { useLocale, useTranslations } from "@repo/i18n";
import { Schema } from "effect";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FieldPath, UseFormReturn } from "react-hook-form";
import { useForm } from "react-hook-form";
import {
  getCountryOptions,
  makeRegistrationFormInputSchema,
  type RegistrationFormFieldErrorCode,
  type RegistrationFormFieldErrors,
  type RegistrationFormInput,
  type RegistrationFormMessageKey,
  type RegistrationFormResult,
  type RegistrationFormValidationErrorCode,
  type RegistrationFormValues,
  requiresRegion,
} from "./registration-form-schema";

type RegistrationFormProps = {
  readonly submit: (
    input: RegistrationFormInput
  ) => Promise<RegistrationFormResult>;
  readonly awaitingApprovalUrl: string;
};

const defaultValues: RegistrationFormValues = {
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

const setServerFieldErrors = (
  form: UseFormReturn<RegistrationFormValues>,
  errors: RegistrationFormFieldErrors,
  t: (key: RegistrationFormMessageKey) => string
) => {
  const messages = {
    duplicateEmail: "validation.duplicateEmail",
    invalidVatId: "validation.invalidVatId",
  } as const satisfies Record<
    RegistrationFormFieldErrorCode,
    RegistrationFormMessageKey
  >;

  for (const [name, code] of Object.entries(errors)) {
    if (code) {
      form.setError(name as FieldPath<RegistrationFormValues>, {
        message: t(messages[code]),
        type: "server",
      });
    }
  }
};

const getServerFormErrorMessageKey = (
  code: RegistrationFormValidationErrorCode
) => {
  const messages = {
    unsupportedRegistrationCountry: "errors.unsupportedRegistrationCountry",
  } as const satisfies Record<
    RegistrationFormValidationErrorCode,
    RegistrationFormMessageKey
  >;

  return messages[code];
};

function TranslatedFormMessage({ className }: { readonly className?: string }) {
  const { error, formMessageId } = useFormField();
  const body = error?.message ? String(error.message) : null;

  if (!body) {
    return null;
  }

  return (
    <p className={className} id={formMessageId}>
      {body}
    </p>
  );
}

export function RegistrationForm({
  submit,
  awaitingApprovalUrl,
}: RegistrationFormProps) {
  const t = useTranslations("web.registration.form");
  const locale = useLocale();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const registrationFormSchema = makeRegistrationFormInputSchema(t);
  const form = useForm<RegistrationFormValues>({
    resolver: standardSchemaResolver(
      Schema.toStandardSchemaV1(registrationFormSchema)
    ),
    defaultValues,
    mode: "onBlur",
  });
  const selectedCountry = form.watch("address.country");
  const isRegionRequired = requiresRegion(selectedCountry);
  const countryOptions = getCountryOptions(locale);
  const renderRowFieldMessage = (name: FieldPath<RegistrationFormValues>) => {
    const message = form.getFieldState(name, form.formState).error?.message;

    return <p className="min-h-5 text-destructive text-sm">{message ?? ""}</p>;
  };

  return (
    <Form {...form}>
      <form
        className="grid gap-6"
        onSubmit={form.handleSubmit(async (values) => {
          setFormError(null);

          if (
            requiresRegion(values.address.country) &&
            !values.address.region
          ) {
            form.setError("address.region", {
              message: t("validation.region"),
              type: "manual",
            });
            return;
          }

          setIsSubmitting(true);

          try {
            const result = await submit(values);

            switch (result._tag) {
              case "Success":
                router.push(
                  (result.redirectTo ??
                    `${awaitingApprovalUrl}?email=${encodeURIComponent(values.email)}`) as Route
                );
                return;
              case "ValidationErrors":
                setServerFieldErrors(form, result.fieldErrors, t);
                {
                  const [firstFormError] = result.formErrors;
                  setFormError(
                    firstFormError
                      ? t(getServerFormErrorMessageKey(firstFormError))
                      : null
                  );
                }
                return;
              case "FormError":
                setFormError(t(`errors.${result.code}`));
                return;
              default:
                result satisfies never;
            }
          } catch {
            setFormError(t("errors.submitFailed"));
          } finally {
            setIsSubmitting(false);
          }
        })}
      >
        {formError ? (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <Card className="border-stone-300 shadow-none">
          <CardHeader>
            <CardTitle>{t("sections.company")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <div className="grid gap-4 md:grid-cols-2 md:gap-8">
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
                      <TranslatedFormMessage className="sr-only" />
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
                        />
                      </FormControl>
                      <TranslatedFormMessage className="sr-only" />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2 md:gap-8">
                {renderRowFieldMessage("companyName")}
                {renderRowFieldMessage("companyPhone")}
              </div>
            </div>

            <div className="grid gap-2">
              <div className="grid gap-4 md:grid-cols-2 md:gap-8">
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
                        />
                      </FormControl>
                      <TranslatedFormMessage className="sr-only" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address.country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fields.country.label")}</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);

                          if (!requiresRegion(value)) {
                            form.setValue("address.region", "", {
                              shouldDirty: true,
                              shouldTouch: true,
                              shouldValidate: false,
                            });
                            form.clearErrors("address.region");
                          }
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue
                              placeholder={t("fields.country.placeholder")}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {countryOptions.map((country) => (
                            <SelectItem
                              key={country.value}
                              value={country.value}
                            >
                              {country.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <TranslatedFormMessage className="sr-only" />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2 md:gap-8">
                {renderRowFieldMessage("vatId")}
                {renderRowFieldMessage("address.country")}
              </div>
            </div>

            <div className="grid gap-2">
              <div className="grid gap-4 md:grid-cols-2 md:gap-8">
                <FormField
                  control={form.control}
                  name="address.streetName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fields.streetAddress.label")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("fields.streetAddress.placeholder")}
                          {...field}
                        />
                      </FormControl>
                      <TranslatedFormMessage className="sr-only" />
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
                        />
                      </FormControl>
                      <TranslatedFormMessage className="sr-only" />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2 md:gap-8">
                {renderRowFieldMessage("address.streetName")}
                {renderRowFieldMessage("address.region")}
              </div>
            </div>

            <div className="grid gap-2">
              <div className="grid gap-4 md:grid-cols-2 md:gap-8">
                <FormField
                  control={form.control}
                  name="address.additionalStreetInfo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fields.addressLine2.label")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("fields.addressLine2.placeholder")}
                          {...field}
                        />
                      </FormControl>
                      <TranslatedFormMessage className="sr-only" />
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
                      <TranslatedFormMessage className="sr-only" />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2 md:gap-8">
                {renderRowFieldMessage("address.additionalStreetInfo")}
                {renderRowFieldMessage("address.postalCode")}
              </div>
            </div>

            <div className="grid gap-2">
              <div className="grid gap-4 md:grid-cols-2 md:gap-8">
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
                      <TranslatedFormMessage className="sr-only" />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2 md:gap-8">
                {renderRowFieldMessage("address.city")}
              </div>
            </div>
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

        <div className="flex items-center justify-between gap-4">
          <p className="max-w-xl text-sm text-stone-600">{t("disclaimer")}</p>
          <Button className="min-w-40" disabled={isSubmitting} type="submit">
            {isSubmitting ? t("actions.submitting") : t("actions.submit")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
