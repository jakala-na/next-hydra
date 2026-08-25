import { describe, expect, it } from "vitest";

import { isDrupalLangcode, toDrupalLangcode, toDrupalPath } from "./locale";

describe("Drupal locale mapping", () => {
  it("uses Drupal's installed English language for the default frontend locale", () => {
    expect(toDrupalLangcode("en-US")).toBe("en");
    expect(toDrupalPath("/resources", "en-US")).toBe("/resources");
  });

  it("maps regional frontend locales to Drupal catalogue IDs", () => {
    expect(toDrupalLangcode("en-GB")).toBe("en-gb");
    expect(toDrupalLangcode("fr-FR")).toBe("fr");
    expect(toDrupalPath("resources", "fr-FR")).toBe("/fr-FR/resources");
  });

  it("localizes the Drupal front page without adding a trailing slash", () => {
    expect(toDrupalPath("/", "de-DE")).toBe("/de-DE");
  });

  it("recognizes only configured Drupal language IDs", () => {
    expect(isDrupalLangcode("en")).toBeTruthy();
    expect(isDrupalLangcode("nl")).toBeTruthy();
    expect(isDrupalLangcode("fr")).toBeTruthy();
    expect(isDrupalLangcode("fr-FR")).toBeFalsy();
    expect(isDrupalLangcode(undefined)).toBeFalsy();
  });
});
