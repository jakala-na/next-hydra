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

type RegistrationInvitationExpiredTemplateProps = {
  readonly companyName: string;
  readonly contactName: string;
  readonly registrationUrl: string;
};

export const RegistrationInvitationExpiredTemplate = ({
  companyName,
  contactName,
  registrationUrl,
}: RegistrationInvitationExpiredTemplateProps) => (
  <Tailwind>
    <Html>
      <Head />
      <Preview>Your {companyName} account invitation has expired</Preview>
      <Body className="bg-stone-100 font-sans text-stone-900">
        <Container className="mx-auto my-10 max-w-xl rounded-2xl bg-white px-8 py-10">
          <Heading className="m-0 font-semibold text-3xl">
            Account invitation expired
          </Heading>
          <Section className="mt-6">
            <Text className="m-0 text-base leading-7">Hi {contactName},</Text>
            <Text className="mt-4 text-base text-stone-700 leading-7">
              The account setup invitation for {companyName} has expired and can
              no longer be used. To continue, submit a new registration for
              review.
            </Text>
            <Text className="mt-6 text-base leading-7">
              <Link className="text-stone-900 underline" href={registrationUrl}>
                Start a new registration
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  </Tailwind>
);

export default RegistrationInvitationExpiredTemplate;
