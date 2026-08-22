import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, Redacted, Schema } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { RuntimeCredentialHandoff } from "./credential-handoff";
import { runtimeCredentialHandoffLayer } from "./credential-handoff-live";
import {
  ApiClientId,
  CommercetoolsRegion,
  CredentialFileError,
  ProjectKey,
  RuntimeCredentials,
} from "./model";
import { runtimeScopeFor } from "./scopes";

const temporaryDirectories: string[] = [];
const projectKey = ProjectKey.make("test-project");
const credentials = new RuntimeCredentials({
  clientId: ApiClientId.make("runtime-client"),
  clientSecret: Redacted.make("runtime-secret", { label: "clientSecret" }),
  projectKey,
  region: CommercetoolsRegion.make("us-central1.gcp"),
  scope: runtimeScopeFor(projectKey),
});

const makeDestination = async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "next-hydra-credentials-")
  );
  temporaryDirectories.push(directory);
  return path.join(directory, "runtime.env");
};

const saveCredentials = (destination: string) =>
  Effect.gen(function* () {
    const handoff = yield* RuntimeCredentialHandoff;
    return yield* handoff.save(credentials, destination);
  }).pipe(
    Effect.provide(
      runtimeCredentialHandoffLayer.pipe(Layer.provide(NodeServices.layer))
    )
  );

describe("runtime credential file handoff", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directory) => {
        await rm(directory, { force: true, recursive: true });
      })
    );
  });

  it("writes only runtime credentials with private permissions", async () => {
    const destination = await makeDestination();
    const receipt = await saveCredentials(destination).pipe(Effect.runPromise);
    const [contents, info] = await Promise.all([
      readFile(destination, "utf-8"),
      stat(destination),
    ]);

    expect(info.mode % 0o1000).toBe(0o600);
    expect(contents).toContain('COMMERCETOOLS_CLIENT_ID="runtime-client"');
    expect(contents).toContain('COMMERCETOOLS_CLIENT_SECRET="runtime-secret"');
    expect(contents).not.toContain("BOOTSTRAP");
    expect(receipt).toMatchObject({ mode: 0o600, path: destination });
  });

  it("refuses to overwrite an existing file", async () => {
    const destination = await makeDestination();
    await writeFile(destination, "keep-me", "utf-8");

    const error = await saveCredentials(destination).pipe(
      Effect.flip,
      Effect.runPromise
    );

    expect(Schema.is(CredentialFileError)(error)).toBeTruthy();
    expect(error.cause).toBeDefined();
    await expect(readFile(destination, "utf-8")).resolves.toBe("keep-me");
  });
});
