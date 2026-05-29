import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

type RegistrationAwaitingApprovalTemplateProps = {
  readonly companyName: string;
  readonly contactName: string;
};

export const RegistrationAwaitingApprovalTemplate = ({
  companyName,
  contactName,
}: RegistrationAwaitingApprovalTemplateProps) => (
  <Tailwind>
    <Html>
      <Head />
      <Preview>Your {companyName} registration is pending approval</Preview>
      <Body className="bg-stone-100 font-sans text-stone-900">
        <Container className="mx-auto my-10 max-w-xl rounded-2xl bg-white px-8 py-10">
          <Heading className="m-0 font-semibold text-3xl">
            Registration received
          </Heading>
          <Section className="mt-6">
            <Text className="m-0 text-base leading-7">Hi {contactName},</Text>
            <Text className="mt-4 text-base text-stone-700 leading-7">
              We created your account for {companyName}. Your company is now in
              review and you will receive another email as soon as access is
              approved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  </Tailwind>
);

export default RegistrationAwaitingApprovalTemplate;
