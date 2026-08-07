import { describe, expect, it } from "vitest";
import { classifyChangedPaths } from "../.github/merge-policy.mjs";

describe("risk-based merge policy", () => {
  it("classifies ordinary product work as auto-merge eligible", () => {
    expect(classifyChangedPaths(["src/feature.ts", "README.md"])).toEqual({
      classification: "auto",
      protectedPaths: [],
      paths: ["src/feature.ts", "README.md"],
    });
  });

  it("protects workflow, dependency, and host-boundary changes", () => {
    const result = classifyChangedPaths([
      "src/feature.ts",
      ".github/workflows/ci.yml",
      "README.md",
    ]);
    expect(result.classification).toBe("protected");
    expect(result.protectedPaths).toEqual([".github/workflows/ci.yml"]);
  });
});
