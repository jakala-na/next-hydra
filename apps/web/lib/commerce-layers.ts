import "server-only";

import { withAuth } from "@repo/auth-workos/server";
import { CommerceIdentity } from "@repo/commerce/services/commerce-identity";

export {
  addressBookLayer,
  cartsLayer,
  commerceAccountsLayer,
  productDiscoveryLayer,
} from "@repo/commerce-commercetools/provider";

export const commerceIdentityLayer = async () => {
  const session = await withAuth();
  return CommerceIdentity.layer(session.user?.id);
};
