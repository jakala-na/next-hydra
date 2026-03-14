export const REGISTRATION_MESSAGE_PREFIX = "registration:";

export const registrationMessageKey = (key: string) =>
  `${REGISTRATION_MESSAGE_PREFIX}${key}`;

export const isRegistrationMessageKey = (message: string) =>
  message.startsWith(REGISTRATION_MESSAGE_PREFIX);

export const getRegistrationMessageKey = (message: string) =>
  message.slice(REGISTRATION_MESSAGE_PREFIX.length);
