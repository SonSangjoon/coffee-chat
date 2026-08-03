import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseStrictJson } from "../tools/strict-input.ts";

const root = resolve(import.meta.dirname, "..");

describe("engine review setup contracts", () => {
  it("keeps setup Preview and Receipt schemas strict and versioned", async () => {
    const [previewBytes, receiptBytes] = await Promise.all([
      readFile(
        resolve(root, "schemas/engine-review-setup-preview.schema.json"),
      ),
      readFile(
        resolve(root, "schemas/engine-review-setup-receipt.schema.json"),
      ),
    ]);
    const preview = parseStrictJson(
      previewBytes.toString("utf8"),
      "engine-review-setup-preview.schema.json",
    ) as Record<string, unknown>;
    const receipt = parseStrictJson(
      receiptBytes.toString("utf8"),
      "engine-review-setup-receipt.schema.json",
    ) as Record<string, unknown>;
    expect(preview.additionalProperties).toBe(false);
    expect(preview.required).toEqual(
      expect.arrayContaining(["setup_digest", "source", "checkout", "effects"]),
    );
    expect(receipt.oneOf).toHaveLength(3);
  });

  it("does not expose setup as a public engine CLI command", async () => {
    const cli = await readFile(resolve(root, "tools/engine-cli.ts"), "utf8");
    expect(cli).not.toMatch(/setup\s+(prepare|apply)/);
    expect(cli).toContain("update-prepare");
  });
});
