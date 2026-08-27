import { Redacted } from "effect";

const bearerAuthorizationPattern = /^Bearer[\t ]+(?<token>[^\t ]+)[\t ]*$/iu;

export const readBearerAuthorization = (authorization: string | undefined) => {
  if (authorization === undefined) {
    return { _tag: "Missing" } as const;
  }

  const token = bearerAuthorizationPattern.exec(authorization)?.groups?.token;
  return token === undefined || token === ""
    ? ({ _tag: "Invalid" } as const)
    : ({ _tag: "Token", token } as const);
};

export const parseBearerAuthorization = (
  authorization: string | undefined,
  credential: Redacted.Redacted
) => {
  const parsed = readBearerAuthorization(authorization);
  if (parsed._tag === "Missing") {
    return parsed;
  }
  const token = Redacted.value(credential).trim();

  return parsed._tag === "Token" && parsed.token === token && token !== ""
    ? ({ _tag: "Token", token } as const)
    : ({ _tag: "Invalid" } as const);
};
