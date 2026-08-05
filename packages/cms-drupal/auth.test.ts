import { describe, expect, it } from "vitest";
import {
  createDrupalTokenProvider,
  DrupalAuthenticationError,
} from "./auth.ts";

const credentials = {
  previewer: { clientId: "preview-id", clientSecret: "preview-secret" },
  viewer: { clientId: "viewer-id", clientSecret: "viewer-secret" },
} as const;
const TOKEN_REFRESH_TIME_MS = 31_000;
const UNAUTHORIZED_STATUS = 401;

describe("Drupal OAuth token provider", () => {
  it("selects credentials by access mode and caches valid tokens", async () => {
    const requestBodies: string[] = [];
    const fetchImplementation: typeof fetch = (_input, init) => {
      requestBodies.push(String(init?.body));
      return Promise.resolve(
        Response.json({
          access_token: `token-${requestBodies.length}`,
          expires_in: 300,
          token_type: "Bearer",
        })
      );
    };
    const token = createDrupalTokenProvider({
      authUri: "https://drupal.example/oauth/token",
      credentials,
      fetchImplementation,
    });

    await expect(token("viewer")).resolves.toBe("Bearer token-1");
    await expect(token("viewer")).resolves.toBe("Bearer token-1");
    await expect(token("previewer")).resolves.toBe("Bearer token-2");

    expect(requestBodies).toHaveLength(2);
    expect(new URLSearchParams(requestBodies[0]).get("client_id")).toBe(
      "viewer-id"
    );
    expect(new URLSearchParams(requestBodies[1]).get("client_id")).toBe(
      "preview-id"
    );
  });

  it("refreshes tokens before they expire", async () => {
    let currentTime = 0;
    let requestCount = 0;
    const fetchImplementation: typeof fetch = () => {
      requestCount += 1;
      return Promise.resolve(
        Response.json({
          access_token: `token-${requestCount}`,
          expires_in: 60,
          token_type: "Bearer",
        })
      );
    };
    const token = createDrupalTokenProvider({
      authUri: "https://drupal.example/oauth/token",
      credentials,
      fetchImplementation,
      now: () => currentTime,
    });

    await expect(token("viewer")).resolves.toBe("Bearer token-1");
    currentTime = TOKEN_REFRESH_TIME_MS;
    await expect(token("viewer")).resolves.toBe("Bearer token-2");
  });

  it("reports OAuth failures without exposing credentials", async () => {
    const fetchImplementation: typeof fetch = () =>
      Promise.resolve(
        Response.json(
          {
            error: "invalid_client",
            error_description: "Client authentication failed",
          },
          { status: UNAUTHORIZED_STATUS }
        )
      );
    const token = createDrupalTokenProvider({
      authUri: "https://drupal.example/oauth/token",
      credentials,
      fetchImplementation,
    });

    await expect(token("viewer")).rejects.toEqual(
      new DrupalAuthenticationError(
        "Client authentication failed",
        UNAUTHORIZED_STATUS
      )
    );
  });
});
