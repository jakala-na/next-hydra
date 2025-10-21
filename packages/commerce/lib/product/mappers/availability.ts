import { type FragmentOf, graphql, readFragment } from "@repo/commerce/graphql";
import { channelFragment } from "@repo/commerce/lib/shared/fragments";
import type {
  AvailabilityWithChannels,
  ProductVariantAvailability,
} from "@repo/commerce/lib/types";

export const productSearchVariantAvailabilityFragment = graphql(`
  fragment ProductSearchVariantAvailability on ProductSearchVariantAvailability {
    id
    version
    isOnStock
    restockableInDays
    availableQuantity
  }
`);

export const productSearchVariantAvailabilityWithChannelsFragment = graphql(
  `
  fragment ProductSearchVariantAvailabilityWithChannels on ProductSearchVariantAvailabilityWithChannels {
    noChannel {
      ...ProductSearchVariantAvailability
    }
    channels(includeChannelIds: $supplyChannelIds) {
      results {
        channel {
          ...Channel
        }
        availability {
          ...ProductSearchVariantAvailability
        }
      }
    }
  }
`,
  [productSearchVariantAvailabilityFragment, channelFragment]
);
export const reshapeProductSearchVariantAvailabilityWithChannels = (
  data: FragmentOf<typeof productSearchVariantAvailabilityWithChannelsFragment>
): AvailabilityWithChannels => {
  const result = readFragment(
    productSearchVariantAvailabilityWithChannelsFragment,
    data
  );
  return {
    noChannel:
      result.noChannel &&
      readFragment(productSearchVariantAvailabilityFragment, result.noChannel),
    channels: {
      results: result.channels.results.map((channelAvailability) => ({
        channel:
          channelAvailability.channel &&
          readFragment(channelFragment, channelAvailability.channel),
        availability: readFragment(
          productSearchVariantAvailabilityFragment,
          channelAvailability.availability
        ),
      })),
    },
  };
};

export const reshapeProductSearchVariantAvailability = (
  data: FragmentOf<typeof productSearchVariantAvailabilityWithChannelsFragment>
): ProductVariantAvailability => {
  const availabilityWithChannels =
    reshapeProductSearchVariantAvailabilityWithChannels(data);
  const availableQuantity = calculateTotalAvailableQuantity(
    availabilityWithChannels
  );
  return {
    availableQuantity,
    availableForSale: availableQuantity > 0,
  };
};
export const calculateTotalAvailableQuantity = (
  availability: AvailabilityWithChannels
) => {
  let total = 0;
  if (!availability) {
    return total;
  }

  // Add quantities from all channels
  if (availability.channels?.results) {
    for (const channelResult of availability.channels.results) {
      if (channelResult.availability?.availableQuantity) {
        total += channelResult.availability.availableQuantity;
      }
    }
  }

  return total;
};
