import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

type RegistrationApprovedTemplateProps = {
  readonly companyName: string;
  readonly contactName: string;
  readonly onboardingUrl: string;
};

export const RegistrationApprovedTemplate = ({
  companyName,
  contactName,
  onboardingUrl,
}: RegistrationApprovedTemplateProps) => (
  <Tailwind>
    <Html>
      <Head />
      <Preview>Your {companyName} registration is approved</Preview>
      <Body className="bg-stone-100 font-sans text-stone-900">
        <Container className="mx-auto my-10 max-w-xl rounded-2xl bg-white px-8 py-10">
          <Heading className="m-0 text-3xl font-semibold">
            Account approved
          </Heading>
          <Section className="mt-6">
            <Text className="m-0 text-base leading-7">
              Hi {contactName},
            </Text>
            <Text className="mt-4 text-base leading-7 text-stone-700">
              Your {companyName} registration has been approved. Finish setting
              up your access using the secure onboarding link below.
            </Text>
            <Text className="mt-6 text-base leading-7">
              <Link className="text-stone-900 underline" href={onboardingUrl}>
                Complete account setup
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  </Tailwind>
);

export default RegistrationApprovedTemplate;
