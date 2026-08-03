import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const migrationTimestamp = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
};

const normalizeMigrationName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

const migrationTitle = (name: string): string =>
  name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const migrationTemplate = (
  name: string,
  description: string
): string => `import { migrationClient } from "../migration-client";
import type { MigrationDefinition } from "../types";

export const migration: MigrationDefinition = {
  name: ${JSON.stringify(migrationTitle(name))},
  description: ${JSON.stringify(description)},
  async up(apiRoot) {
    const builder = await migrationClient(apiRoot)
      .ensureType("my-custom-type", {
        name: { en: "My Custom Type" },
        resourceTypeIds: ["order"],
      })
      .init();

    if (!builder.fieldExists("myField")) {
      builder.addStringField("myField", { en: "My Field" });
    }

    await builder.execute();
  },
};
`;

export const createMigration = async (
  migrationsDirectory: string,
  name: string,
  description: string,
  now = new Date()
): Promise<string> => {
  const normalizedName = normalizeMigrationName(name);
  if (normalizedName.length === 0) {
    throw new Error("Migration name must contain letters or numbers");
  }

  await mkdir(migrationsDirectory, { recursive: true });

  const fileName = `${migrationTimestamp(now)}-${normalizedName}.ts`;
  await writeFile(
    join(migrationsDirectory, fileName),
    migrationTemplate(normalizedName, description),
    "utf8"
  );

  return fileName;
};
