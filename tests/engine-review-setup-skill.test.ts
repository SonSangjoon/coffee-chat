import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMarkdownDocument } from "../tools/strict-input.ts";

const root = resolve(import.meta.dirname, "..");

describe("Init agent boundary", () => {
  it("keeps independent initialization approval-first", async () => {
    const document = parseMarkdownDocument(
      await readFile(resolve(root, "skills/coffee-init/SKILL.md"), "utf8"),
      "skills/coffee-init/SKILL.md",
    );
    const headings = [...document.body.matchAll(/^#{1,6}\s+(.+)$/gm)].map(
      (match) => match[1]!.trim(),
    );
    expect(document.frontmatter).toEqual(expect.any(Object));
    expect(headings).toEqual(
      expect.arrayContaining(["Inputs", "Required sequence", "Write boundary"]),
    );

    const sequence = document.body.match(
      /## Required sequence\n([\s\S]*?)(?=\n## |$)/,
    )?.[1];
    expect(sequence).toBeDefined();
    expect(sequence!.match(/^\d+\. /gm)).toHaveLength(5);
    expect(sequence).toMatch(/engine|coffee-chat\.json/);
    expect(sequence).toMatch(/inspect|without writing/);
    expect(sequence).toMatch(/preview/i);
    expect(sequence).toMatch(/approval|stop/i);
    expect(sequence).toMatch(/receipt/i);

    const boundary = document.body.match(
      /## Write boundary\n([\s\S]*?)(?=\n## |$)/,
    )?.[1];
    expect(boundary).toBeDefined();
    expect(boundary).toMatch(/independent|new repository/);
    expect(boundary).toMatch(/protected|engine checkout|cache/i);
    expect(boundary).toMatch(/source checkout|personal records/i);
  });
});
