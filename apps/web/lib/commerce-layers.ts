import "server-only";

import { withAuth } from "@repo/auth/server";
import { CommerceIdentity } from "@repo/commerce/services/commerce-identity";

export {
  addressBookLayer,
  cartsLayer,
  commerceAccountsLayer,
  productDiscoveryLayer,
} from "@repo/commerce-provider/provider";

export const commerceIdentityLayer = async () => {
  const session = await withAuth();
  return CommerceIdentity.layer(session.user?.id);
};
