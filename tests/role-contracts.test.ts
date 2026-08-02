import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isEngineManifest,
  isInstanceGraph,
  isInstanceManifest,
  type EngineManifest,
  type InstanceManifest,
  type Manifest,
  validateKnowledge,
} from "../tools/knowledge.ts";
import { createSnapshot } from "../tools/snapshot.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const engineFixture = resolve(
  import.meta.dirname,
  "fixtures/engine-valid/coffee-chat.json",
);
const instanceFixture = resolve(
  import.meta.dirname,
  "fixtures/initialized-valid",
);
const temporaryRoots: string[] = [];

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function repositoryFrom(
  manifestPath: string,
  withKnowledge = false,
): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "coffee-chat-role-"));
  temporaryRoots.push(root);
  await cp(resolve(projectRoot, "schemas"), resolve(root, "schemas"), {
    recursive: true,
  });
  await cp(manifestPath, resolve(root, "coffee-chat.json"));
  if (withKnowledge) {
    await cp(
      resolve(instanceFixture, "knowledge"),
      resolve(root, "knowledge"),
      {
        recursive: true,
      },
    );
  }
  return root;
}

async function validateRoot(root: string) {
  return validateKnowledge(await createSnapshot(root, "worktree"));
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("repository roles", () => {
  it("validates a generic engine without loading an instance graph", async () => {
    const root = await repositoryFrom(engineFixture);
    const result = await validateRoot(root);

    expect(result.diagnostics).toEqual([]);
    expect(result.graph).toEqual(
      expect.objectContaining({ entities: [], notes: [] }),
    );
    expect(isInstanceGraph(result.graph!)).toBe(false);

    const manifest = (await readJson<EngineManifest>(
      engineFixture,
    )) as Manifest;
    expect(isEngineManifest(manifest)).toBe(true);
    expect(isInstanceManifest(manifest)).toBe(false);
  });

  it.each([
    [
      "profile",
      (value: Record<string, unknown>) => ({
        ...value,
        profile: {
          id: "69d249c9-3c4f-4e0d-b622-74b292f87e9d",
          display_name: "Person",
          short_name: "Person",
        },
      }),
    ],
    [
      "time zone",
      (value: Record<string, unknown>) => ({
        ...value,
        time_zone: "Asia/Seoul",
      }),
    ],
    [
      "knowledge index path",
      (value: Record<string, unknown>) => ({
        ...value,
        paths: {
          ...(value.paths as object),
          knowledge_index: "./knowledge/index.json",
        },
      }),
    ],
    [
      "personal plugin namespace",
      (value: Record<string, unknown>) => ({
        ...value,
        plugin: { ...(value.plugin as object), name: "coffee-chat-person" },
      }),
    ],
    [
      "unknown property",
      (value: Record<string, unknown>) => ({ ...value, undeclared: true }),
    ],
  ])("rejects engine %s", async (_name, change) => {
    const root = await repositoryFrom(engineFixture);
    const manifest = await readJson<Record<string, unknown>>(
      resolve(root, "coffee-chat.json"),
    );
    await writeFile(
      resolve(root, "coffee-chat.json"),
      `${JSON.stringify(change(manifest), null, 2)}\n`,
    );

    const result = await validateRoot(root);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "schema-validation" }),
      ]),
    );
  });

  it("rejects tracked root knowledge in an engine repository", async () => {
    const root = await repositoryFrom(engineFixture, true);
    const result = await validateRoot(root);

    expect(result.graph).toBeUndefined();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "engine-has-knowledge",
          path: "./knowledge",
        }),
      ]),
    );
  });

  it.each([
    [
      "time zone",
      (value: Record<string, unknown>) => {
        delete value.time_zone;
      },
    ],
    [
      "profile",
      (value: Record<string, unknown>) => {
        delete value.profile;
      },
    ],
    [
      "knowledge index path",
      (value: Record<string, unknown>) => {
        delete (value.paths as Record<string, unknown>).knowledge_index;
      },
    ],
  ])("requires instance %s", async (_name, change) => {
    const root = await repositoryFrom(
      resolve(instanceFixture, "coffee-chat.json"),
      true,
    );
    const manifest = await readJson<Record<string, unknown>>(
      resolve(root, "coffee-chat.json"),
    );
    change(manifest);
    await writeFile(
      resolve(root, "coffee-chat.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    const result = await validateRoot(root);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "schema-validation" }),
      ]),
    );
  });

  it("requires a non-engine plugin namespace for instances", async () => {
    const root = await repositoryFrom(
      resolve(instanceFixture, "coffee-chat.json"),
      true,
    );
    const manifest = await readJson<Record<string, unknown>>(
      resolve(root, "coffee-chat.json"),
    );
    (manifest.plugin as Record<string, unknown>).name = "coffee-chat";
    await writeFile(
      resolve(root, "coffee-chat.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    const result = await validateRoot(root);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "schema-validation" }),
      ]),
    );
  });

  it("keeps strict instance validation and rejects unsupported schema versions", async () => {
    const root = await repositoryFrom(
      resolve(instanceFixture, "coffee-chat.json"),
      true,
    );
    const manifest = await readJson<InstanceManifest>(
      resolve(root, "coffee-chat.json"),
    );
    expect(isInstanceManifest(manifest as Manifest)).toBe(true);
    (manifest as { schema_version: string }).schema_version = "2.0.0";
    await writeFile(
      resolve(root, "coffee-chat.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    const result = await validateRoot(root);
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsupported-schema-version" }),
      ]),
    );
  });
});
