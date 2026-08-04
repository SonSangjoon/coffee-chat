import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("review setup agent boundary", () => {
  it("keeps creation remote-only and approval-first", async () => {
    const skill = await readFile(
      resolve(root, "skills/coffee-create/SKILL.md"),
      "utf8",
    );
    expect(skill).toContain("Do not create a local-only instance");
    expect(skill).toContain("Preview");
    expect(skill).toContain("npm ci --ignore-scripts");
    expect(skill).toContain(
      "Candidate approval is not Git publication approval",
    );
  });
});
