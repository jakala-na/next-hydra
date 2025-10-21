/**
 * Export all built-in policies
 */

// biome-ignore lint/performance/noBarrelFile: this is fine
export {
  createGuestMaxLimitsPolicy,
  guestMaxLimits,
} from "./guest-max-limits.policy";

// Add more policies here as they're created
// export { myOtherPolicy } from './my-other.policy';
