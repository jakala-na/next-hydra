import { writeFileSync } from "node:fs";

const [resultPath] = process.argv.slice(3);
if (!resultPath) {
  throw new Error("Missing fixture result path");
}
writeFileSync(
  resultPath,
  JSON.stringify({
    _tag: "RegistryFailure",
    diagnostic: "fixture token=private-value",
  })
);
