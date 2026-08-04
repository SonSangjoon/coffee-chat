import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseStrictJson } from "../tools/strict-input.ts";

const root = resolve(import.meta.dirname, "..");

describe("Coffee Chat update Skill", () => {
  it("keeps update approval-bound and personal records protected", async () => {
    const skill = await readFile(
      resolve(root, "skills/coffee-update/SKILL.md"),
      "utf8",
    );
    for (const phrase of [
      "Review changes",
      "protected personal records",
      "write only approved engine-owned paths",
      "merge a pull request",
    ])
      expect(skill).toContain(phrase);
    expect(skill).toMatch(/Never\s+rewrite Origins or Green Beans/);
    expect(skill).toMatch(/verification is\s+incomplete/);
    expect(skill).not.toMatch(/merge_pull_request|mergePullRequest/);
  });

  it("ships the bound advisory and discovery schemas in both engine packages", async () => {
    for (const prefix of [
      "skills/coffee-update/references",
      "plugins/coffee-chat/skills/coffee-update/references",
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
