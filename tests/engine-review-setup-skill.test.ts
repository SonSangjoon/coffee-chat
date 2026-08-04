import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("Init agent boundary", () => {
  it("keeps independent initialization approval-first", async () => {
    const skill = await readFile(
      resolve(root, "skills/coffee-init/SKILL.md"),
      "utf8",
    );
    expect(skill).toContain(
      "an explicit empty destination outside the invoking work repository",
    );
    expect(skill).toContain("Operation Preview");
    expect(skill).toContain("Do not use a source checkout as the new instance");
    expect(skill).toContain("Init is complete only when");
  });
});
