import { describe, expect, it } from "vitest";
import {
  calverForUtc,
  isCalver,
  migrationDocumentFor,
} from "../tools/release-version.ts";

describe("CalVer release preparation contracts", () => {
  it("formats the release date in UTC", () => {
    expect(calverForUtc(new Date("2026-08-04T23:59:59.999Z"))).toBe(
      "2026.08.04",
    );
    expect(calverForUtc(new Date("2026-08-05T00:00:00.000Z"))).toBe(
      "2026.08.05",
    );
  });

  it("accepts only real three-segment calendar dates", () => {
    expect(isCalver("2026.08.04")).toBe(true);
    expect(isCalver("2024.02.29")).toBe(true);
    expect(isCalver("2026.02.29")).toBe(false);
    expect(isCalver("2026.8.4")).toBe(false);
    expect(isCalver("2026.08.04-1")).toBe(false);
    expect(isCalver("2.0.0")).toBe(false);
  });

  it("creates a deterministic manifest-only migration document", () => {
    expect(migrationDocumentFor("2026.08.03", "2026.08.04", "1.1.0")).toEqual({
      schema_version: "1.0.0",
      id: "coffee-chat-2026-08-03-to-2026-08-04",
      operations: [
        {
          kind: "manifest-json-patch",
          path: "./coffee-chat.json",
          patch: [
            {
              op: "test",
              path: "/provenance/engine/version",
              value: "2026.08.03",
            },
            {
              op: "replace",
              path: "/schema_version",
              value: "1.1.0",
            },
          ],
        },
      ],
    });
  });
});
