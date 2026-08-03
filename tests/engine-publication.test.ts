import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseStrictJson } from "../tools/strict-input.ts";

const root = resolve(import.meta.dirname, "..");

describe("engine publication contract", () => {
  it("keeps publication schemas strict and distinct from update receipts", async () => {
    const names = [
      "engine-update-publication-candidate.schema.json",
      "engine-update-publication-preview.schema.json",
      "engine-update-publication-receipt.schema.json",
      "engine-update-publication-journal.schema.json",
    ];
    for (const name of names) {
      const value = parseStrictJson(
        await readFile(resolve(root, "schemas", name), "utf8"),
        name,
      ) as Record<string, unknown>;
      expect(value.$id).toContain(name);
      expect(value.additionalProperties ?? value.oneOf).toBeDefined();
    }
  });

  it("keeps the publication module merge-free and approval-bound", async () => {
    const source = await readFile(
      resolve(root, "tools/engine-publication.ts"),
      "utf8",
    );
    expect(source).toContain("approval_digest");
    expect(source).toContain("pull-request");
    expect(source).toContain("merge remains a human decision");
    expect(source).not.toMatch(/merge_pull_request|mergePullRequest/);
  });
});
