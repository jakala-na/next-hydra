import {
  getRegistrationMessageKey,
  isRegistrationMessageKey,
} from "@repo/commerce/lib/b2b-registration/message-keys";

export const translateRegistrationMessage = (
  t: (...args: any[]) => string,
  message: string
) => {
  if (isRegistrationMessageKey(message)) {
    return t(getRegistrationMessageKey(message));
  }

  return message;
};
