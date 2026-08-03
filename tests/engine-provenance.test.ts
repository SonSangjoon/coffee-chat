import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertLockMatchesManifest,
  classifyInstanceProvenance,
  parseEngineLock,
} from "../tools/engine-provenance.ts";
import { ValidationFailure } from "../tools/contracts.ts";
import {
  type InstanceManifest,
  validateKnowledge,
} from "../tools/knowledge.ts";
import { createSnapshot } from "../tools/snapshot.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const boundFixture = resolve(
  import.meta.dirname,
  "fixtures/synthetic-instance",
);
const legacyFixture = resolve(
  import.meta.dirname,
  "fixtures/initialized-valid",
);
const engineFixture = resolve(import.meta.dirname, "fixtures/engine-valid");
const temporaryRoots: string[] = [];

async function repositoryFrom(fixture: string): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "coffee-chat-provenance-"));
  temporaryRoots.push(root);
  await cp(fixture, root, { recursive: true });
  await cp(resolve(projectRoot, "schemas"), resolve(root, "schemas"), {
    recursive: true,
  });
  return root;
}

async function validateInstance(root: string) {
  return (await validateKnowledge(await createSnapshot(root, "worktree")))
    .diagnostics;
}

function lockBytes(value: Record<string, unknown>): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function expectLockDiagnostic(
  value: Record<string, unknown>,
  expected: { code: string; pointer: string },
): void {
  try {
    parseEngineLock(lockBytes(value), ".coffee-chat/engine-lock.json");
    throw new Error("Expected engine lock parsing to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationFailure);
    expect((error as ValidationFailure).diagnostic).toMatchObject(expected);
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("instance engine provenance", () => {
  it("accepts bound schema-1.1 and explicitly legacy schema-1.0 instances", async () => {
    const [bound, legacy] = await Promise.all([
      repositoryFrom(boundFixture),
      repositoryFrom(legacyFixture),
    ]);

    expect(await validateInstance(bound)).toEqual([]);
    expect(await validateInstance(legacy)).toEqual([]);
    const parsedLegacyManifest = JSON.parse(
      await readFile(resolve(legacy, "coffee-chat.json"), "utf8"),
    ) as InstanceManifest;
    expect(classifyInstanceProvenance(parsedLegacyManifest)).toEqual({
      status: "legacy",
    });
  });

  it("requires provenance for schema-1.1 instances", async () => {
    const root = await repositoryFrom(boundFixture);
    const manifest = JSON.parse(
      await readFile(resolve(root, "coffee-chat.json"), "utf8"),
    ) as Record<string, unknown>;
    delete manifest.provenance;
    await writeFile(
      resolve(root, "coffee-chat.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    expect(await validateInstance(root)).toContainEqual(
      expect.objectContaining({
        code: "schema-required",
        pointer: "/provenance",
      }),
    );
  });

  it("rejects a mixed-case source commit", async () => {
    const root = await repositoryFrom(boundFixture);
    const manifest = JSON.parse(
      await readFile(resolve(root, "coffee-chat.json"), "utf8"),
    ) as { provenance: { engine: { source_commit: string } } };
    manifest.provenance.engine.source_commit = "A".repeat(40);
    await writeFile(
      resolve(root, "coffee-chat.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    expect(await validateInstance(root)).toContainEqual(
      expect.objectContaining({
        code: "schema-pattern",
        pointer: "/provenance/engine/source_commit",
      }),
    );
  });

  it("rejects credentials in a provenance repository URL", async () => {
    const root = await repositoryFrom(boundFixture);
    const manifest = JSON.parse(
      await readFile(resolve(root, "coffee-chat.json"), "utf8"),
    ) as { provenance: { engine: { repository: string } } };
    manifest.provenance.engine.repository =
      "https://user:secret@github.com/example/coffee-chat";
    await writeFile(
      resolve(root, "coffee-chat.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    expect(await validateInstance(root)).toContainEqual(
      expect.objectContaining({
        code: "repository-url-invalid",
        pointer: "/provenance/engine/repository",
      }),
    );
  });

  it("forbids provenance on an engine manifest", async () => {
    const root = await repositoryFrom(engineFixture);
    const manifest = JSON.parse(
      await readFile(resolve(root, "coffee-chat.json"), "utf8"),
    ) as Record<string, unknown>;
    manifest.provenance = {};
    await writeFile(
      resolve(root, "coffee-chat.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    expect(await validateInstance(root)).toContainEqual(
      expect.objectContaining({
        code: "schema-additional-property",
        pointer: "/provenance",
      }),
    );
  });

  it("requires the lock to exactly bind its manifest engine", async () => {
    const root = await repositoryFrom(boundFixture);
    const manifest = JSON.parse(
      await readFile(resolve(root, "coffee-chat.json"), "utf8"),
    ) as InstanceManifest;
    const lock = parseEngineLock(
      await readFile(resolve(root, ".coffee-chat/engine-lock.json")),
      ".coffee-chat/engine-lock.json",
    );

    expect(assertLockMatchesManifest(manifest, lock)).toEqual([]);
  });

  it("classifies an incomplete schema-1.1 provenance binding as invalid", async () => {
    const root = await repositoryFrom(boundFixture);
    const manifest = JSON.parse(
      await readFile(resolve(root, "coffee-chat.json"), "utf8"),
    ) as InstanceManifest;
    delete manifest.provenance;

    expect(classifyInstanceProvenance(manifest)).toEqual({
      status: "invalid",
    });
  });

  it("parses lock engine diagnostics from the lock engine pointer", async () => {
    const root = await repositoryFrom(boundFixture);
    const lock = JSON.parse(
      await readFile(resolve(root, ".coffee-chat/engine-lock.json"), "utf8"),
    ) as Record<string, unknown>;
    ((lock.engine as Record<string, unknown>).source_commit as string) =
      "A".repeat(40);

    expectLockDiagnostic(lock, {
      code: "schema-pattern",
      pointer: "/engine/source_commit",
    });
  });

  it("requires exact managed-file keys in an engine lock", async () => {
    const root = await repositoryFrom(boundFixture);
    const lock = JSON.parse(
      await readFile(resolve(root, ".coffee-chat/engine-lock.json"), "utf8"),
    ) as Record<string, unknown>;
    lock.managed_files = [
      {
        path: "./tools/runtime.ts",
        class: "engine-source",
        digest: `sha256:${"a".repeat(64)}`,
      },
    ];
    expectLockDiagnostic(lock, {
      code: "schema-required",
      pointer: "/managed_files/0/mode",
    });

    lock.managed_files = [
      {
        path: "./tools/runtime.ts",
        class: "engine-source",
        digest: `sha256:${"a".repeat(64)}`,
        mode: "100644",
        unexpected: true,
      },
    ];
    expectLockDiagnostic(lock, {
      code: "schema-additional-property",
      pointer: "/managed_files/0/unexpected",
    });
  });

  it.each([
    "./coffee-chat.json",
    "./.coffee-chat/generated-files.json",
    "./knowledge/index.json",
    "./CONTENT_LICENSE.md",
    "./README.md",
    "./README.ko.md",
    "./AGENTS.md",
    "./CLAUDE.md",
    "./plugins/coffee-chat/skills/coffee-chat/SKILL.md",
    "./.claude-plugin/plugin.json",
    "./.agents/plugins/marketplace.json",
  ])("rejects instance-owned or generated managed path %s", async (path) => {
    const root = await repositoryFrom(boundFixture);
    const lock = JSON.parse(
      await readFile(resolve(root, ".coffee-chat/engine-lock.json"), "utf8"),
    ) as Record<string, unknown>;
    lock.managed_files = [
      {
        path,
        class: "engine-source",
        digest: `sha256:${"a".repeat(64)}`,
        mode: "100644",
      },
    ];

    expectLockDiagnostic(lock, {
      code: "engine-lock-path-invalid",
      pointer: "/managed_files/0/path",
    });
  });
});
