import { beforeEach, describe, expect, it, vi } from "vitest";

const { connection, withAuth } = vi.hoisted(() => ({
  connection: vi.fn(async () => undefined),
  withAuth: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection }));
vi.mock("@repo/auth/server", () => ({ withAuth }));
vi.mock("./account-menu-client", () => ({
  AccountMenuClient: () => null,
}));

import { AccountMenu, AccountMenuSkeleton } from "./account-menu";

beforeEach(() => {
  connection.mockClear();
  withAuth.mockReset();
});

describe("AccountMenu", () => {
  it("streams a request-bound account projection into the header", async () => {
    withAuth.mockResolvedValue({
      user: {
        email: "buyer@example.com",
        firstName: "Hydra",
        lastName: "Buyer",
        profilePictureUrl: "https://example.com/avatar.png",
      },
    });

    const element = await AccountMenu();

    expect(connection).toHaveBeenCalledOnce();
    expect(withAuth).toHaveBeenCalledOnce();
    expect(element).toMatchObject({
      props: {
        component: "server",
        name: "AccountSession",
        rendering: "streamed",
      },
    });
    expect(element.props.children.props.user).toEqual({
      email: "buyer@example.com",
      firstName: "Hydra",
      lastName: "Buyer",
      profilePictureUrl: "https://example.com/avatar.png",
    });
  });

  it("provides a visible Suspense fallback", () => {
    const element = AccountMenuSkeleton();

    expect(element).toMatchObject({
      props: {
        name: "AccountSession (pending)",
        rendering: "streamed",
      },
    });
    expect(element.props.children.props["aria-label"]).toBe(
      "Loading account controls"
    );
  });
});
