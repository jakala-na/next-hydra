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

type RegistrationAwaitingApproverTemplateProps = {
  readonly companyName: string;
  readonly contactName: string;
  readonly approvalUrl: string;
};

export const RegistrationAwaitingApproverTemplate = ({
  companyName,
  contactName,
  approvalUrl,
}: RegistrationAwaitingApproverTemplateProps) => (
  <Tailwind>
    <Html>
      <Head />
      <Preview>{companyName} is waiting for registration review</Preview>
      <Body className="bg-stone-100 font-sans text-stone-900">
        <Container className="mx-auto my-10 max-w-xl rounded-2xl bg-white px-8 py-10">
          <Heading className="m-0 font-semibold text-3xl">
            Registration needs review
          </Heading>
          <Section className="mt-6">
            <Text className="m-0 text-base leading-7">
              {contactName} submitted {companyName} for registration.
            </Text>
            <Text className="mt-6 text-base leading-7">
              <Link className="text-stone-900 underline" href={approvalUrl}>
                Review registration
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  </Tailwind>
);

export default RegistrationAwaitingApproverTemplate;
