import { describe, expect, it } from "vitest";
import { extractKnowledgeSemantics } from "../tools/engine-update.ts";
import type { InstanceGraph } from "../tools/knowledge.ts";

function graph(): InstanceGraph {
  return {
    manifest: {
      schema_url: "./schemas/coffee-chat.schema.json",
      schema_version: "1.1.0",
      repository_role: "instance",
      time_zone: "Etc/UTC",
      profile: {
        id: "2d3b6b8a-5e0d-4c93-9a51-7f6d2c8e4b10",
        display_name: "Projection Author",
        short_name: "Projection",
      },
      repository: {
        url: "https://github.com/example/coffee-chat-projection",
        default_branch: "main",
      },
      pages_url: "https://example.github.io/coffee-chat-projection/",
      plugin: {
        name: "coffee-chat-projection",
        version: "2026.08.04",
        description: "Fixture",
      },
      marketplace_name: "coffee-chat-projection-marketplace",
      paths: {
        knowledge_index: "./knowledge/index.json",
        skills: "./skills/",
        method: "./method/",
      },
      provenance: {
        engine: {
          repository: "https://github.com/SonSangjoon/coffee-chat",
          version: "2026.08.04",
          source_commit: "a".repeat(40),
          release_digest: `sha256:${"b".repeat(64)}`,
        },
        created_from: {
          method: "github-template",
          template_repository: "https://github.com/SonSangjoon/coffee-chat",
        },
      },
    },
    entities: [
      {
        id: "3d3b6b8a-5e0d-4c93-9a51-7f6d2c8e4b10",
        label: "Iteration",
        kind: "process",
        aliases: ["loop"],
        same_as: [],
      },
    ],
    notes: [
      {
        path: "knowledge/notes/note.md",
        bytes: Buffer.from("note"),
        frontmatter: {
          id: "4d3b6b8a-5e0d-4c93-9a51-7f6d2c8e4b10",
          title: "A note",
          temporal_coverage: "2026-01/2026-02",
          recorded_on: "2026-02-01",
          sources: [
            {
              url: "https://example.com/source",
              title: "Source",
              published_on: "2026-01-01",
              accessed_on: "2026-02-01",
            },
          ],
          entities: ["3d3b6b8a-5e0d-4c93-9a51-7f6d2c8e4b10"],
        },
        body: "The authored body.",
        noteLinks: [],
      },
    ],
  };
}

describe("engine update semantic preservation", () => {
  it("masks only engine-controlled manifest fields", async () => {
    const beforeGraph = graph();
    const before = extractKnowledgeSemantics(beforeGraph);
    const changed = JSON.parse(JSON.stringify(beforeGraph)) as InstanceGraph;
    changed.manifest.schema_version = "9.9.9";
    changed.manifest.plugin.version = "9.9.9";
    if (changed.manifest.provenance) {
      changed.manifest.provenance.engine.version = "9.9.9";
      changed.manifest.provenance.engine.release_digest =
        before.instance_owned_manifest_digest;
    }
    expect(
      extractKnowledgeSemantics(changed).instance_owned_manifest_digest,
    ).toBe(before.instance_owned_manifest_digest);
    expect(extractKnowledgeSemantics(changed).notes).toEqual(before.notes);
    expect(extractKnowledgeSemantics(changed).entities).toEqual(
      before.entities,
    );
  });

  it("does not treat an authored body change as an engine-only update", async () => {
    const beforeGraph = graph();
    const before = extractKnowledgeSemantics(beforeGraph);
    const changed = JSON.parse(JSON.stringify(beforeGraph)) as InstanceGraph;
    changed.notes[0]!.body += "\n\nA new authored sentence.";
    expect(
      extractKnowledgeSemantics(changed).notes[0]!.authored_body_digest,
    ).not.toBe(before.notes[0]!.authored_body_digest);
  });

  it("keeps the acceptance fixture free of a persisted derived perspective", async () => {
    expect(
      extractKnowledgeSemantics(graph()).forbidden_persisted_synthesis,
    ).toEqual([]);
  });
});
