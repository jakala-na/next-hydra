/**
 * Cart Policy Auto-Initialization
 *
 * This module automatically registers all built-in policies when first imported.
 * No explicit initialization needed - policies are ready when you first use cartPolicyService.
 *
 * The registration happens at module load time, so policies are available
 * as soon as any code imports from '@repo/commerce/lib/cart/policy'.
 */

import { cartPolicyService } from "./cart-policy.service";
import { guestMaxLimits } from "./policies";

// Auto-register built-in policies at module load time
cartPolicyService.registerPolicy(guestMaxLimits);

// Add more built-in policies here as they're created
