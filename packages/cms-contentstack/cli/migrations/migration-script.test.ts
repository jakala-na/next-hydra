/* oxlint-disable typescript/no-unsafe-type-assertion -- CSDX migration scripts are CommonJS modules without a typed module boundary; this local fixture is exercised against the declared contract below. */

import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
interface FieldDefinition {
  readonly data_type: string;
  readonly display_name: string;
}

interface MigrationTask {
  readonly title: string;
}

interface LandingPageMigration {
  readonly afterField: (field: string) => LandingPageMigration;
  readonly createField: (
    uid: string,
    definition: FieldDefinition
  ) => LandingPageMigration;
  readonly getTaskDefinition: () => MigrationTask;
  readonly moveField: (uid: string) => LandingPageMigration;
}

interface MigrationDsl {
  readonly addTask: (value: MigrationTask) => void;
  readonly editContentType: (uid: string) => LandingPageMigration;
}

type MigrationScript = (input: { readonly migration: MigrationDsl }) => void;

// SAFETY: This local CommonJS fixture exports the migration function exercised below.
const migrationScript =
  require("../../migrations/2026-08-23-120000-add-landing-page-seo-fields.js") as MigrationScript;

describe("landing page SEO migration", () => {
  it("adds the application fields through the Contentstack migration DSL", () => {
    const fields = new Map<string, FieldDefinition>();
    const moves: string[] = [];
    const task = { title: "edit landing_page" };
    const landingPage = {
      afterField: (field: string) => {
        moves.push(field);
        return landingPage;
      },
      createField: (uid: string, definition: FieldDefinition) => {
        fields.set(uid, definition);
        return landingPage;
      },
      getTaskDefinition: () => task,
      moveField: (uid: string) => {
        moves.push(uid);
        return landingPage;
      },
    };
    const migration = {
      addTask: (value: MigrationTask) => {
        expect(value).toBe(task);
      },
      editContentType: (uid: string) => {
        expect(uid).toBe("landing_page");
        return landingPage;
      },
    };

    migrationScript({ migration });

    expect(fields.get("seo_title")).toMatchObject({
      data_type: "text",
      display_name: "SEO title",
    });
    expect(fields.get("seo_description")).toMatchObject({
      data_type: "text",
      display_name: "SEO description",
    });
    expect(moves).toStrictEqual([
      "seo_title",
      "hide_display_title",
      "seo_description",
      "seo_title",
    ]);
  });
});
