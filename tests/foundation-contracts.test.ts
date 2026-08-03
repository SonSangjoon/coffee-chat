import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema } from "ajv";
import type { FormatsPlugin } from "ajv-formats";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats").default as FormatsPlugin;
const targetFingerprint = {
  git_common_dir: {
    real_path: "/tmp/repository/.git",
    device: "16777232",
    inode: "123456",
  },
  origin_url: "https://github.com/example/downstream",
  base_commit: "583ba3e583ba3e583ba3e583ba3e583ba3e583ba",
  pre_conversion_manifest_digest:
    "sha256:78947f971ac9045761e2f19c751e305b8356a6cac191ef1aad73def41d9dc0f2",
};

async function readJson<T = unknown>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(root, path), "utf8")) as T;
}

async function contractValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);

  const schemaNames = (await readdir(resolve(root, "schemas")))
    .filter((name) => name.endsWith(".schema.json"))
    .sort();
  for (const name of schemaNames) {
    ajv.addSchema(await readJson<AnySchema>(`schemas/${name}`));
  }

  return ajv;
}

describe("Coffee Chat foundation contracts", () => {
  it("accepts the generic engine manifest without represented-person fields", async () => {
    const manifest = await readJson("coffee-chat.json");
    const validator = await contractValidator();
    const validate = validator.getSchema(
      "https://coffee-chat.dev/schemas/coffee-chat.schema.json",
    );

    expect(validate).toBeDefined();
    expect(validate?.(manifest)).toBe(true);
    expect(manifest).toMatchObject({
      schema_version: "1.1.0",
      repository_role: "engine",
      repository: { url: "https://github.com/SonSangjoon/coffee-chat" },
      pages_url: "https://sonsangjoon.github.io/coffee-chat/",
      plugin: { name: "coffee-chat", version: "1.0.0" },
      marketplace_name: "coffee-chat-marketplace",
    });
    expect(manifest).not.toHaveProperty("profile");
    expect(manifest).not.toHaveProperty("time_zone");
  });

  it("rejects represented-person fields in the generic engine manifest", async () => {
    const manifest = structuredClone(
      await readJson("coffee-chat.json"),
    ) as Record<string, unknown>;
    manifest.profile = {
      id: "69d249c9-3c4f-4e0d-b622-74b292f87e9d",
      display_name: "Person",
      short_name: "Person",
    };
    const validator = await contractValidator();
    const validate = validator.getSchema(
      "https://coffee-chat.dev/schemas/coffee-chat.schema.json",
    );

    expect(validate?.(manifest)).toBe(false);
    expect(validate?.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: "",
          keyword: "additionalProperties",
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
        {
          id: "48d1c840-5d38-48d0-8e74-7187d9f0c2fd",
          label: "Review boundary",
        },
      ],
      "https://coffee-chat.dev/schemas/knowledge-index.schema.json": {
        schema_version: "1.0.0",
        profile_id: "69d249c9-3c4f-4e0d-b622-74b292f87e9d",
        knowledge_digest:
          "sha256:78947f971ac9045761e2f19c751e305b8356a6cac191ef1aad73def41d9dc0f2",
        nodes: [],
        edges: [],
      },
      "https://coffee-chat.dev/schemas/engine-lock.schema.json": {
        schema_version: "1.0.0",
        engine: {
          repository: "https://github.com/sonsangjoon/coffee-chat",
          version: "1.1.0",
          source_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          release_digest:
            "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
        managed_files: [],
      },
      "https://coffee-chat.dev/schemas/candidate-request.schema.json": {
        schema_version: "1.0.0",
        mode: "make-mine",
        instance_configuration: {
          profile: {
            temporary_key: "owner_profile",
            display_name: "Projection Author",
            short_name: "Projection",
          },
          time_zone: "Asia/Seoul",
          repository: {
            url: "https://github.com/example/downstream",
            default_branch: "main",
          },
          pages_url: "https://example.github.io/downstream/",
          plugin: {
            name: "coffee-chat-projection",
            version: "1.0.0",
            description: "A public perspective graph.",
          },
          content_notice: "# Content Notice\n",
        },
        entity_changes: [
          {
            action: "create",
            temporary_key: "review_boundary",
            value: { label: "Review boundary", kind: "concept" },
          },
        ],
        note_changes: [
          {
            action: "create",
            temporary_key: "first_note",
            value: {
              title: "A dated note",
              temporal_coverage: "2026-02/2026-07",
              sources: [
                {
                  url: "https://example.com/source",
                  title: "Source title",
                  retrieval_status: "succeeded",
                },
              ],
              entity_refs: ["review_boundary"],
              body: "The complete public body.",
            },
          },
        ],
        setup_effects: [],
      },
      "https://coffee-chat.dev/schemas/preview.schema.json": {
        schema_version: "1.0.0",
        candidate_digest:
          "sha256:78947f971ac9045761e2f19c751e305b8356a6cac191ef1aad73def41d9dc0f2",
        candidate_directory: ".",
        mode: "update",
        base_commit: "583ba3e583ba3e583ba3e583ba3e583ba3e583ba",
        target_fingerprint: targetFingerprint,
        current_repository_role: "instance",
        proposed_repository_role: "instance",
        actual_origin_url: "https://github.com/example/downstream",
        proposed_time_zone: "Asia/Seoul",
        marketplace_name: "coffee-chat-example-marketplace",
        time_zone: "Asia/Seoul",
        frozen_date: "2026-08-01",
        affected_paths: ["./coffee-chat.json"],
        output_hashes: [
          {
            path: "./coffee-chat.json",
            digest:
              "sha256:78947f971ac9045761e2f19c751e305b8356a6cac191ef1aad73def41d9dc0f2",
          },
        ],
        knowledge_digest:
          "sha256:78947f971ac9045761e2f19c751e305b8356a6cac191ef1aad73def41d9dc0f2",
        canonical_diff: [
          {
            path: "./coffee-chat.json",
            change: "update",
            after_digest:
              "sha256:78947f971ac9045761e2f19c751e305b8356a6cac191ef1aad73def41d9dc0f2",
          },
        ],
        worktree: {
          fingerprint:
            "sha256:78947f971ac9045761e2f19c751e305b8356a6cac191ef1aad73def41d9dc0f2",
          changes: [],
        },
        notes: [],
        entities: [],
        source_observations: [],
        setup_effects: [],
        unresolved_source_limitations: [],
        privacy_warnings: [],
        validation: { status: "passed" },
      },
      "https://coffee-chat.dev/schemas/receipt.schema.json": {
        schema_version: "1.0.0",
        candidate_digest:
          "sha256:78947f971ac9045761e2f19c751e305b8356a6cac191ef1aad73def41d9dc0f2",
        status: "applied",
        changed_paths: ["./coffee-chat.json"],
        validation: { status: "passed" },
        target_fingerprint: targetFingerprint,
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
        entity_changes: [],
        note_changes: [
          {
            action: "correct",
            target_id: "a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61",
            value: {
              title: "A dated note",
              temporal_coverage: "2026-02",
              sources: [
                {
                  url: "https://example.com/source",
                  title: "Source title",
                  retrieval_status: "unavailable",
                  access_limitation: "The public page could not be fetched.",
                },
              ],
              entity_refs: [],
              body: "Corrected body.",
            },
          },
        ],
        setup_effects: [],
        output_paths: ["./knowledge/../secrets.json"],
      }),
    ).toBe(false);
  });

  it("does not impose semantic minimum-length gates on present text fields", async () => {
    const validator = await contractValidator();
    const manifest = structuredClone(
      await readJson("tests/fixtures/initialized-valid/coffee-chat.json"),
    ) as {
      time_zone: string;
      profile: { display_name: string };
      repository: { default_branch: string };
      plugin: { description: string };
    };
    manifest.time_zone = "";
    manifest.profile.display_name = "";
    manifest.repository.default_branch = "";
    manifest.plugin.description = "";

    const rootManifest = validator.getSchema(
      "https://coffee-chat.dev/schemas/coffee-chat.schema.json",
    );
    const note = validator.getSchema(
      "https://coffee-chat.dev/schemas/note-frontmatter.schema.json",
    );
    const entities = validator.getSchema(
      "https://coffee-chat.dev/schemas/entity-registry.schema.json",
    );
    const index = validator.getSchema(
      "https://coffee-chat.dev/schemas/knowledge-index.schema.json",
    );
    const preview = validator.getSchema(
      "https://coffee-chat.dev/schemas/preview.schema.json",
    );
    const receipt = validator.getSchema(
      "https://coffee-chat.dev/schemas/receipt.schema.json",
    );

    expect(rootManifest?.(manifest)).toBe(true);
    expect(
      note?.({
        id: "a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61",
        title: "",
        temporal_coverage: "2026-02",
        recorded_on: "2026-08-01",
        sources: [{ url: "https://example.com/source", title: "" }],
      }),
    ).toBe(true);
    expect(
      entities?.([
        {
          id: "48d1c840-5d38-48d0-8e74-7187d9f0c2fd",
          label: "",
          aliases: [""],
          kind: "",
        },
      ]),
    ).toBe(true);
    expect(
      index?.({
        schema_version: "1.0.0",
        profile_id: "69d249c9-3c4f-4e0d-b622-74b292f87e9d",
        knowledge_digest:
          "sha256:78947f971ac9045761e2f19c751e305b8356a6cac191ef1aad73def41d9dc0f2",
        nodes: [
          {
            id: "a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61",
            type: "note",
            path: "./knowledge/notes/a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61.md",
            content_digest:
              "sha256:260304ee1f19f5f31c3d5d338bd112f56833669335a177fd129d4129c16375e0",
            title: "",
            temporal_coverage: "",
            recorded_on: "2026-08-01",
          },
        ],
        edges: [],
      }),
    ).toBe(true);
    expect(
      preview?.({
        schema_version: "1.0.0",
        candidate_digest:
          "sha256:78947f971ac9045761e2f19c751e305b8356a6cac191ef1aad73def41d9dc0f2",
        candidate_directory: ".",
        mode: "update",
        base_commit: "583ba3e583ba3e583ba3e583ba3e583ba3e583ba",
        target_fingerprint: targetFingerprint,
        current_repository_role: "instance",
        proposed_repository_role: "instance",
        actual_origin_url: "https://github.com/example/downstream",
        proposed_time_zone: "Asia/Seoul",
        marketplace_name: "coffee-chat-example-marketplace",
        time_zone: "Asia/Seoul",
        frozen_date: "2026-08-01",
        affected_paths: ["./coffee-chat.json"],
        output_hashes: [
          {
            path: "./coffee-chat.json",
            digest:
              "sha256:78947f971ac9045761e2f19c751e305b8356a6cac191ef1aad73def41d9dc0f2",
          },
        ],
        knowledge_digest:
          "sha256:78947f971ac9045761e2f19c751e305b8356a6cac191ef1aad73def41d9dc0f2",
        canonical_diff: [],
        worktree: {
          fingerprint:
            "sha256:78947f971ac9045761e2f19c751e305b8356a6cac191ef1aad73def41d9dc0f2",
          changes: [],
        },
        notes: [],
        entities: [],
        source_observations: [],
        setup_effects: [],
        privacy_warnings: [],
        validation: { status: "passed" },
        unresolved_source_limitations: [""],
      }),
    ).toBe(true);
    expect(
      receipt?.({
        schema_version: "1.0.0",
        candidate_digest:
          "sha256:78947f971ac9045761e2f19c751e305b8356a6cac191ef1aad73def41d9dc0f2",
        status: "partial_local_result",
        changed_paths: ["./coffee-chat.json"],
        validation: { status: "passed" },
        setup_effects: [
          {
            effect: "install-pre-commit",
            target_path: "/tmp/repository/.git/hooks/pre-commit",
            status: "failed",
          },
        ],
        setup_failure: "",
        target_fingerprint: targetFingerprint,
      }),
    ).toBe(true);
  });

  it("requires complete approval Preview fields and enforces Receipt status semantics", async () => {
    const validator = await contractValidator();
    const preview = validator.getSchema(
      "https://coffee-chat.dev/schemas/preview.schema.json",
    );
    const receipt = validator.getSchema(
      "https://coffee-chat.dev/schemas/receipt.schema.json",
    );
    const digest =
      "sha256:78947f971ac9045761e2f19c751e305b8356a6cac191ef1aad73def41d9dc0f2";

    expect(
      preview?.({
        schema_version: "1.0.0",
        candidate_digest: digest,
        base_commit: "583ba3e",
        affected_paths: ["./coffee-chat.json"],
        validation: { status: "passed" },
      }),
    ).toBe(false);

    expect(
      receipt?.({
        schema_version: "1.0.0",
        candidate_digest: digest,
        status: "approval_invalidated",
        changed_paths: [],
        validation: { status: "not_run" },
        invalidation_code: "base-head-drift",
        target_fingerprint: targetFingerprint,
      }),
    ).toBe(true);
    expect(
      receipt?.({
        schema_version: "1.0.0",
        candidate_digest: digest,
        status: "approval_invalidated",
        changed_paths: ["./coffee-chat.json"],
        validation: { status: "not_run" },
        invalidation_code: "base-head-drift",
        target_fingerprint: targetFingerprint,
      }),
    ).toBe(false);
    expect(
      receipt?.({
        schema_version: "1.0.0",
        candidate_digest: digest,
        status: "applied",
        changed_paths: ["./coffee-chat.json"],
        validation: { status: "passed" },
        setup_failure: "failed",
        target_fingerprint: targetFingerprint,
      }),
    ).toBe(false);
    expect(
      receipt?.({
        schema_version: "1.0.0",
        candidate_digest: digest,
        status: "partial_local_result",
        changed_paths: ["./coffee-chat.json"],
        validation: { status: "passed" },
        target_fingerprint: targetFingerprint,
      }),
    ).toBe(false);
  });

  it("replaces the generic operation cross-product with complete typed Candidate changes", async () => {
    const validator = await contractValidator();
    const candidate = validator.getSchema(
      "https://coffee-chat.dev/schemas/candidate-request.schema.json",
    );

    const completeUpdate = {
      schema_version: "1.0.0",
      mode: "update",
      entity_changes: [
        {
          action: "update",
          target_id: "48d1c840-5d38-48d0-8e74-7187d9f0c2fd",
          value: {
            label: "Review boundary",
            aliases: ["Boundary"],
            kind: "concept",
          },
        },
      ],
      note_changes: [],
      setup_effects: [],
    };
    expect(candidate?.(completeUpdate)).toBe(true);

    expect(
      candidate?.({
        schema_version: "1.0.0",
        mode: "update",
        operations: [{ type: "entity", action: "update" }],
        entity_changes: [],
        note_changes: [],
        setup_effects: [],
      }),
    ).toBe(false);
    expect(
      candidate?.({
        ...completeUpdate,
        entity_changes: [
          {
            action: "retire",
            target_id: "48d1c840-5d38-48d0-8e74-7187d9f0c2fd",
            note_remaps: [
              {
                target_id: "a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61",
                entity_refs: ["replacement"],
              },
            ],
          },
        ],
      }),
    ).toBe(true);
    expect(
      candidate?.({
        ...completeUpdate,
        entity_changes: [{ action: "update" }],
      }),
    ).toBe(false);
    expect(
      candidate?.({
        ...completeUpdate,
        profile: {
          temporary_key: "replacement_owner",
          value: {
            display_name: "Wrong mode",
            repository: {
              url: "https://example.com/repository",
              default_branch: "main",
            },
            pages_url: "https://example.com/pages/",
            plugin: {
              name: "wrong-mode",
              version: "1.0.0",
              description: "Wrong mode.",
            },
          },
        },
      }),
    ).toBe(false);
  });

  it("publishes the exact code license and separate content rights boundary", async () => {
    const [license, contentLicense] = await Promise.all([
      readFile(resolve(root, "LICENSE"), "utf8"),
      readFile(resolve(root, "CONTENT_LICENSE.md"), "utf8"),
    ]);

    expect(license).toBe(
      'MIT License\n\nCopyright (c) 2026 Coffee Chat\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n',
    );
    expect(contentLicense).toContain("Downstream authors retain ownership");
    expect(contentLicense).toContain(
      "Only `tests/fixtures/son-input/**` is © 2026 Son, All rights reserved",
    );
    expect(contentLicense).toContain(
      "Third-party Sources retain their own terms",
    );
  });
});
