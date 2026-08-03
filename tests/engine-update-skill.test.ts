import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseStrictJson } from "../tools/strict-input.ts";

const root = resolve(import.meta.dirname, "..");

describe("remote engine update Skill", () => {
  it("keeps discovery advisory-only and publication merge-free", async () => {
    const skill = await readFile(
      resolve(root, "skills/update-coffee-chat/SKILL.md"),
      "utf8",
    );
    for (const phrase of [
      "remote-only",
      "Review Coffee Chat update",
      "setup_digest",
      "update_digest",
      "publication_digest",
      "npm ci --ignore-scripts",
      "partial_remote_result",
      "never merges",
    ])
      expect(skill).toContain(phrase);
    expect(skill).not.toMatch(/merge_pull_request|mergePullRequest/);
  });

  it("ships the bound advisory and discovery schemas in both engine packages", async () => {
    for (const prefix of [
      "skills/update-coffee-chat/references",
      "plugins/coffee-chat/skills/update-coffee-chat/references",
    ]) {
      const advisory = parseStrictJson(
        await readFile(resolve(root, prefix, "advisory.json"), "utf8"),
        `${prefix}/advisory.json`,
      ) as Record<string, unknown>;
      expect(advisory.schema_version).toBe("1.0.0");
      for (const name of [
        "release.json",
        "migration-registry.json",
        "engine-release.schema.json",
        "engine-migration-registry.schema.json",
        "engine-update-advisory.schema.json",
        "engine-migration-document.schema.json",
      ])
        expect(await readFile(resolve(root, prefix, name), "utf8")).toContain(
          "schema",
        );
    }
  });
});
