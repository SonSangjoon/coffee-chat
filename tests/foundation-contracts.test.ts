import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema } from "ajv";
import type { FormatsPlugin } from "ajv-formats";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats").default as FormatsPlugin;
const schemaNames = [
  "coffee-chat.schema.json",
  "note-frontmatter.schema.json",
  "entity-registry.schema.json",
  "knowledge-index.schema.json",
  "candidate-request.schema.json",
  "preview.schema.json",
  "receipt.schema.json",
] as const;

async function readJson<T = unknown>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(root, path), "utf8")) as T;
}

async function contractValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);

  for (const name of schemaNames) {
    ajv.addSchema(await readJson<AnySchema>(`schemas/${name}`));
  }

  return ajv;
}

describe("Coffee Chat foundation contracts", () => {
  it("accepts the canonical pending-first-candidate manifest without inventing a profile UUID", async () => {
    const manifest = await readJson("coffee-chat.json");
    const validator = await contractValidator();
    const validate = validator.getSchema(
      "https://coffee-chat.dev/schemas/coffee-chat.schema.json",
    );

    expect(validate).toBeDefined();
    expect(validate?.(manifest)).toBe(true);
    expect(manifest).toMatchObject({
      schema_version: "1.0.0",
      time_zone: "Asia/Seoul",
      initialization_state: "pending_first_candidate",
      profile: { display_name: "Sangjoon Son" },
      repository: { url: "https://github.com/SonSangjoon/coffee-chat" },
      pages_url: "https://sonsangjoon.github.io/coffee-chat/",
      plugin: { name: "coffee-chat-sangjoon", version: "1.0.0" },
      marketplace_name: "coffee-chat-sangjoon-marketplace",
    });
    expect(
      (manifest as { profile: { id?: string } }).profile.id,
    ).toBeUndefined();
  });

  it("requires an approved profile UUID once initialization is complete", async () => {
    const manifest = structuredClone(await readJson("coffee-chat.json")) as {
      initialization_state: string;
      profile: Record<string, string>;
    };
    manifest.initialization_state = "initialized";
    const validator = await contractValidator();
    const validate = validator.getSchema(
      "https://coffee-chat.dev/schemas/coffee-chat.schema.json",
    );

    expect(validate?.(manifest)).toBe(false);
    expect(validate?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: "/profile",
          keyword: "required",
        }),
      ]),
    );
  });

  it("compiles every schema and accepts one complete structural fixture per contract", async () => {
    const validator = await contractValidator();
    const fixtures: Record<string, unknown> = {
      "https://coffee-chat.dev/schemas/note-frontmatter.schema.json": {
        id: "a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61",
        title: "A dated note",
        temporal_coverage: "2026-02/2026-07",
        recorded_on: "2026-08-01",
        sources: [{ url: "https://example.com/source", title: "Source title" }],
      },
      "https://coffee-chat.dev/schemas/entity-registry.schema.json": [
        { id: "48d1c840-5d38-48d0-8e74-7187d9f0c2fd", label: "Taste" },
      ],
      "https://coffee-chat.dev/schemas/knowledge-index.schema.json": {
        schema_version: "1.0.0",
        profile_id: "69d249c9-3c4f-4e0d-b622-74b292f87e9d",
        knowledge_digest:
          "sha256:78947f971ac9045761e2f19c751e305b8356a6cac191ef1aad73def41d9dc0f2",
        nodes: [],
        edges: [],
      },
      "https://coffee-chat.dev/schemas/candidate-request.schema.json": {
        schema_version: "1.0.0",
        mode: "make-mine",
        operations: [],
        setup_effects: [],
      },
      "https://coffee-chat.dev/schemas/preview.schema.json": {
        schema_version: "1.0.0",
        candidate_digest:
          "sha256:78947f971ac9045761e2f19c751e305b8356a6cac191ef1aad73def41d9dc0f2",
        base_commit: "583ba3e",
        affected_paths: ["./coffee-chat.json"],
        validation: { status: "passed" },
      },
      "https://coffee-chat.dev/schemas/receipt.schema.json": {
        schema_version: "1.0.0",
        candidate_digest:
          "sha256:78947f971ac9045761e2f19c751e305b8356a6cac191ef1aad73def41d9dc0f2",
        status: "applied",
        changed_paths: ["./coffee-chat.json"],
        validation: { status: "passed" },
      },
    };

    for (const [id, fixture] of Object.entries(fixtures)) {
      const validate = validator.getSchema(id);
      expect(validate, id).toBeDefined();
      expect(validate?.(fixture), id).toBe(true);
    }
  });

  it("rejects unknown properties, null optional values, and unsafe repository paths", async () => {
    const validator = await contractValidator();
    const note = validator.getSchema(
      "https://coffee-chat.dev/schemas/note-frontmatter.schema.json",
    );
    const candidate = validator.getSchema(
      "https://coffee-chat.dev/schemas/candidate-request.schema.json",
    );

    expect(
      note?.({
        id: "a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61",
        title: "A dated note",
        temporal_coverage: "2026-02",
        recorded_on: "2026-08-01",
        sources: [
          {
            url: "https://example.com/source",
            title: "Source title",
            published_on: null,
          },
        ],
        undeclared: true,
      }),
    ).toBe(false);
    expect(
      candidate?.({
        schema_version: "1.0.0",
        mode: "update",
        operations: [],
        setup_effects: [],
        output_paths: ["./knowledge/../secrets.json"],
      }),
    ).toBe(false);
  });

  it("publishes the exact code license and separate content rights boundary", async () => {
    const [license, contentLicense] = await Promise.all([
      readFile(resolve(root, "LICENSE"), "utf8"),
      readFile(resolve(root, "CONTENT_LICENSE.md"), "utf8"),
    ]);

    expect(license).toBe(
      'MIT License\n\nCopyright (c) 2026 Sangjoon Son\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n',
    );
    expect(contentLicense).toContain("knowledge/notes/**");
    expect(contentLicense).toContain(
      "© 2026 Sangjoon Son, All rights reserved",
    );
    expect(contentLicense).toContain(
      "Third-party Sources retain their own terms",
    );
  });
});
