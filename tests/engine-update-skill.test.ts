import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseMarkdownDocument,
  parseStrictJson,
} from "../tools/strict-input.ts";

const root = resolve(import.meta.dirname, "..");

describe("Coffee Chat update Skill", () => {
  it("keeps update approval-bound and personal records protected", async () => {
    const document = parseMarkdownDocument(
      await readFile(resolve(root, "skills/coffee-update/SKILL.md"), "utf8"),
      "skills/coffee-update/SKILL.md",
    );
    const headings = [...document.body.matchAll(/^#{1,6}\s+(.+)$/gm)].map(
      (match) => match[1]!.trim(),
    );
    expect(document.frontmatter).toEqual(expect.any(Object));
    expect(headings[0]).toMatch(/^Update\b/);
    expect(document.body).toMatch(/approval|approved/i);
    expect(document.body).toMatch(/protected/);
    expect(document.body).toMatch(/engine-owned paths/);
    expect(document.body).toMatch(/Origins/);
    expect(document.body).toMatch(/Green Beans/);
    expect(document.body).toMatch(/merge a pull request/);
    expect(document.body).toMatch(/verification is\s+incomplete/);
    expect(document.body).not.toMatch(/merge_pull_request|mergePullRequest/);
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
      for (const name of ["release.json", "migration-registry.json"]) {
        const metadata = parseStrictJson(
          await readFile(resolve(root, prefix, name), "utf8"),
          `${prefix}/${name}`,
        ) as Record<string, unknown>;
        expect(metadata.schema_version).toBe("1.0.0");
      }
      for (const name of [
        "engine-release.schema.json",
        "engine-migration-registry.schema.json",
        "engine-update-advisory.schema.json",
        "engine-migration-document.schema.json",
      ]) {
        const schema = parseStrictJson(
          await readFile(resolve(root, prefix, name), "utf8"),
          `${prefix}/${name}`,
        ) as Record<string, unknown>;
        expect(schema).toEqual(
          expect.objectContaining({
            $schema: expect.any(String),
            type: "object",
            required: expect.any(Array),
          }),
        );
      }
    }
  });
});
