import { Redacted } from "effect";

const bearerAuthorizationPattern = /^Bearer[\t ]+(?<token>[^\t ]+)[\t ]*$/iu;

export const parseBearerAuthorization = (
  authorization: string | undefined,
  credential: Redacted.Redacted
) => {
  if (authorization === undefined) {
    return { _tag: "Missing" } as const;
  }

  const match = bearerAuthorizationPattern.exec(authorization);
  const token = Redacted.value(credential).trim();

  return match?.groups?.token === token && token !== ""
    ? ({ _tag: "Token", token } as const)
    : ({ _tag: "Invalid" } as const);
};
