import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertReleaseProjectionBundle,
  buildProjectionBundle,
  roleOwnedProjectionPaths,
} from "../tools/projections.ts";
import { validateKnowledge } from "../tools/knowledge.ts";
import { createSnapshot } from "../tools/snapshot.ts";

const projectRoot = resolve(import.meta.dirname, "..");

async function engineGraph() {
  const snapshot = await createSnapshot(projectRoot, "worktree");
  const validation = await validateKnowledge(snapshot, {
    validateIndex: false,
  });
  expect(validation.diagnostics).toEqual([]);
  expect(validation.graph).toBeDefined();
  return { snapshot, graph: validation.graph! };
}

describe("artifact provenance boundaries", () => {
  it("creates a knowledge-free engine plugin from a closed role inventory", async () => {
    const { snapshot, graph } = await engineGraph();
    const bundle = await buildProjectionBundle(snapshot, graph, {
      artifact_class: "release",
      output_root: projectRoot,
    });

    expect([...bundle.files.keys()]).toEqual(
      expect.arrayContaining([
        ".codex-plugin/plugin.json",
        ".claude-plugin/plugin.json",
        ".agents/plugins/marketplace.json",
        ".claude-plugin/marketplace.json",
        "plugins/coffee-chat/.coffee-chat-generated.json",
        "plugins/coffee-chat/LICENSE",
        "plugins/coffee-chat/skills/coffee-chat/SKILL.md",
        "plugins/coffee-chat/skills/coffee-chat/references/method.md",
      ]),
    );
    expect(roleOwnedProjectionPaths(graph)).toContain(
      "plugins/coffee-chat/.coffee-chat-generated.json",
    );
    expect(
      [...bundle.files.keys()].filter((path) =>
        /(?:^|\/)(?:knowledge|hooks|mcp|agents|lsp|settings|monitor|bin)(?:\/|$)/.test(
          path,
        ),
      ),
    ).toEqual([]);
    expect(
      bundle.files
        .get("plugins/coffee-chat/.codex-plugin/plugin.json")!
        .toString("utf8"),
    ).toContain('"name": "Coffee Chat"');
    const enginePackageText = [...bundle.files.entries()]
      .filter(([path]) => path.startsWith("plugins/coffee-chat/"))
      .map(([, bytes]) => bytes.toString("utf8"))
      .join("\n");
    expect(enginePackageText).not.toContain('"profile":');
    expect(enginePackageText).not.toContain('"profile_id":');
    expect(enginePackageText).not.toContain('"nodes":');
  });

  it("rejects release generation when tracked reads include a fixture", async () => {
    const { snapshot, graph } = await engineGraph();
    await snapshot.read("tests/fixtures/engine-valid/coffee-chat.json");

    await expect(
      buildProjectionBundle(snapshot, graph, {
        artifact_class: "release",
        output_root: projectRoot,
      }),
    ).rejects.toMatchObject({
      diagnostic: { code: "release-fixture-dependency" },
    });
  });

  it("keeps ephemeral test generation outside the checkout", async () => {
    const { snapshot, graph } = await engineGraph();
    await expect(
      buildProjectionBundle(snapshot, graph, {
        artifact_class: "ephemeral-test",
        output_root: projectRoot,
      }),
    ).rejects.toMatchObject({
      diagnostic: { code: "ephemeral-output-must-be-external" },
    });

    const outputRoot = await mkdtemp(resolve(tmpdir(), "coffee-chat-output-"));
    const bundle = await buildProjectionBundle(snapshot, graph, {
      artifact_class: "ephemeral-test",
      output_root: outputRoot,
    });
    expect(bundle.artifact_class).toBe("ephemeral-test");
    expect(bundle.dependencies).toContain("coffee-chat.json");
    expect(() => assertReleaseProjectionBundle(bundle)).toThrow(
      "ephemeral-artifact-not-release-eligible",
    );
  });
});
