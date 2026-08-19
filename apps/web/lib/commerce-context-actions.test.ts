import { NextServer } from "@repo/actions/next-server";
import {
  BUSINESS_UNIT_COOKIE_NAME,
  BUSINESS_UNIT_COOKIE_OPTIONS,
} from "@repo/commerce/commerce-context/business-unit-cookie";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";

import { selectBusinessUnitProgram } from "./commerce-context-procedures";
import type { NextCookieStore } from "./next-request-api";
import { NextRequestApi } from "./next-request-api";

const makeTestLayer = (options: {
  readonly onRefresh: () => void;
  readonly onSetCookie: NextCookieStore["set"];
}) =>
  Layer.mergeAll(
    Layer.succeed(NextRequestApi, {
      connect: () => Effect.void,
      getCookies: () =>
        Effect.succeed({
          delete: () => {
            /* unused in these cases */
          },
          get: (): { readonly value: string } | undefined => undefined,
          set: options.onSetCookie,
        } satisfies NextCookieStore),
      getLocale: () => Effect.succeed("en-US" as const),
    }),
    Layer.succeed(NextServer, {
      refresh: () => Effect.sync(options.onRefresh),
      revalidatePath: () => Effect.void,
    })
  );

describe("BuyingContext.selectBusinessUnit program", () => {
  it("persists a valid Business Unit ID and refreshes the route", async () => {
    const cookies: {
      name: string;
      options: object | undefined;
      value: string;
    }[] = [];
    let refreshed = false;

    await Effect.runPromise(
      selectBusinessUnitProgram("business-unit-1").pipe(
        Effect.provide(
          makeTestLayer({
            onRefresh: () => {
              refreshed = true;
            },
            onSetCookie: (name, value, cookieOptions) => {
              cookies.push({ name, options: cookieOptions, value });
            },
          })
        )
      )
    );

    expect(cookies).toStrictEqual([
      {
        name: BUSINESS_UNIT_COOKIE_NAME,
        options: BUSINESS_UNIT_COOKIE_OPTIONS,
        value: "business-unit-1",
      },
    ]);
    expect(refreshed).toBeTruthy();
  });

  it("ignores structurally invalid Business Unit IDs", async () => {
    let setCalled = false;
    let refreshed = false;

    await Effect.runPromise(
      selectBusinessUnitProgram("").pipe(
        Effect.provide(
          makeTestLayer({
            onRefresh: () => {
              refreshed = true;
            },
            onSetCookie: () => {
              setCalled = true;
            },
          })
        )
      )
    );

    expect(setCalled).toBeFalsy();
    expect(refreshed).toBeFalsy();
  });
});
