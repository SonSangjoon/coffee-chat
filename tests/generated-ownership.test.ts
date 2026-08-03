import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  adoptLegacyGeneratedOwnership,
  generatedOwnershipMarkerBytes,
  parseGeneratedOwnershipMarker,
  type GeneratedOwnershipMarker,
} from "../tools/generated-ownership.ts";
import { mkdir } from "node:fs/promises";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("generated ownership v1.1", () => {
  it("serializes a sorted, self-excluding repository marker", () => {
    const marker: GeneratedOwnershipMarker = {
      schema_version: "1.1.0",
      owner: "coffee-chat",
      scope: "repository",
      owned_files: [
        {
          path: "./README.md",
          digest: ("sha256:" + "a".repeat(64)) as `sha256:${string}`,
        },
      ],
    };
    const bytes = generatedOwnershipMarkerBytes(marker);
    expect(
      parseGeneratedOwnershipMarker(bytes, ".coffee-chat/generated-files.json"),
    ).toEqual(marker);
    expect(bytes.toString("utf8")).toContain('"scope": "repository"');
  });

  it("adopts an exact legacy package bundle by writing only the new marker", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "coffee-chat-ownership-"));
    temporaryRoots.push(root);
    const packageRoot = resolve(root, "plugins/example");
    const generated = new Map([
      ["./.codex-plugin/plugin.json", Buffer.from("{}\n")],
    ]);
    await mkdir(resolve(packageRoot, ".codex-plugin"), { recursive: true });
    await writeFile(resolve(packageRoot, ".codex-plugin/plugin.json"), "{}\n");
    const marker = await adoptLegacyGeneratedOwnership({
      root: packageRoot,
      scope: "plugin-package",
      expected_files: generated,
      legacy_marker: {
        owned_paths: ["plugins/example/.codex-plugin/plugin.json"],
      },
    });
    expect(marker.scope).toBe("plugin-package");
    expect(marker.owned_files).toEqual([
      {
        path: "./.codex-plugin/plugin.json",
        digest:
          "sha256:ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356",
      },
    ]);
    expect(
      await readFile(resolve(packageRoot, ".codex-plugin/plugin.json"), "utf8"),
    ).toBe("{}\n");
    await expect(
      lstat(resolve(packageRoot, ".coffee-chat-generated.json")),
    ).resolves.toBeDefined();
  });

  it("rejects a tampered legacy byte without writing a marker", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "coffee-chat-ownership-"));
    temporaryRoots.push(root);
    await writeFile(resolve(root, "README.md"), "edited\n");
    await expect(
      adoptLegacyGeneratedOwnership({
        root,
        scope: "repository",
        expected_files: new Map([["./README.md", Buffer.from("generated\n")]]),
      }),
    ).rejects.toMatchObject({
      diagnostic: { code: "generated-ownership-upgrade-required" },
    });
    await expect(
      lstat(resolve(root, ".coffee-chat/generated-files.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
