import "server-only";

import { withAuth } from "@repo/auth-workos/server";

export {
  addressBookLayer,
  cartsLayer,
  commerceAccountsLayer,
  productDiscoveryLayer,
} from "@repo/commerce-commercetools/provider";

export const readAuthUserId = async () => {
  const session = await withAuth();
  return session.user?.id;
};
