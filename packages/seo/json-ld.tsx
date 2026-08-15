import type { Thing, WithContext } from "schema-dts";

type JsonLdProps = {
  code: WithContext<Thing>;
};

export const JsonLd = ({ code }: JsonLdProps) => (
  <script
    type="application/ld+json"
    // oxlint-disable-next-line react/no-danger -- This is a JSON-LD script, not user-generated content.
    dangerouslySetInnerHTML={{ __html: JSON.stringify(code) }}
  />
);

export * from "schema-dts";
