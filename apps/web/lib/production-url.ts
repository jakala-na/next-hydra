const HTTP_PROTOCOL_PATTERN = /^https?:\/\//u;

export const productionUrl = (value: string): URL =>
  new URL(HTTP_PROTOCOL_PATTERN.test(value) ? value : `https://${value}`);
