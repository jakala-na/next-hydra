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

type RegistrationRejectedTemplateProps = {
  readonly companyName: string;
  readonly contactName: string;
  readonly reason?: string;
};

export const RegistrationRejectedTemplate = ({
  companyName,
  contactName,
  reason,
}: RegistrationRejectedTemplateProps) => (
  <Tailwind>
    <Html>
      <Head />
      <Preview>Your {companyName} registration was not approved</Preview>
      <Body className="bg-stone-100 font-sans text-stone-900">
        <Container className="mx-auto my-10 max-w-xl rounded-2xl bg-white px-8 py-10">
          <Heading className="m-0 font-semibold text-3xl">
            Registration not approved
          </Heading>
          <Section className="mt-6">
            <Text className="m-0 text-base leading-7">Hi {contactName},</Text>
            <Text className="mt-4 text-base text-stone-700 leading-7">
              We reviewed your registration for {companyName} and cannot approve
              it right now.
            </Text>
            {reason ? (
              <Text className="mt-4 text-base text-stone-700 leading-7">
                Reason: {reason}
              </Text>
            ) : null}
          </Section>
        </Container>
      </Body>
    </Html>
  </Tailwind>
);

export default RegistrationRejectedTemplate;
