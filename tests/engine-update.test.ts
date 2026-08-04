import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { EngineReleaseManifest } from "../tools/engine-contracts.ts";
import type { EngineProvenance } from "../tools/engine-provenance.ts";
import { canonicalEngineReleaseDigest } from "../tools/engine-release.ts";
import { inspectEngineUpdate } from "../tools/engine-update.ts";
import {
  buildEngineUpdateAdvisory,
  compareEngineUpdateAdvisory,
  evaluateMigrationDocument,
  resolveUniqueMigrationPath,
  validateMigrationRegistry,
  type MigrationDocument,
  type MigrationRegistry,
} from "../tools/migrations.ts";

function digest(value: Buffer | string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function release(
  version: string,
  releaseDigest = digest(version),
): EngineReleaseManifest {
  return {
    schema_version: "1.0.0",
    repository: "https://github.com/example/coffee-chat",
    version,
    source_ref: `refs/tags/v${version}`,
    target_manifest_schema_version: "1.1.0",
    migration_registry: {
      path: "./engine/migrations/registry.json",
      digest: digest("registry"),
    },
    managed_files: [],
    delivery_files: [],
    release_digest: releaseDigest,
  };
}

function provenance(value: EngineReleaseManifest): EngineProvenance {
  return {
    repository: value.repository,
    version: value.version,
    source_commit: "a".repeat(40),
    release_digest: value.release_digest,
  };
}

describe("engine update advisory", () => {
  it("marks the exact target identity current and exposes a matching advisory edge", () => {
    const old = release("2026.08.01");
    const target = release("2026.08.02");
    const registry: MigrationRegistry = {
      schema_version: "1.0.0",
      edges: [
        {
          id: "one-one-one",
          from: {
            repository: old.repository,
            version: old.version,
            release_digest: old.release_digest,
          },
          to: {
            repository: target.repository,
            version: target.version,
            release_digest: target.release_digest,
          },
          document: "./engine/migrations/one-one-one.json",
          document_digest: digest("document"),
          write_scopes: ["manifest"],
        },
      ],
    };
    const advisory = buildEngineUpdateAdvisory(target, registry, {
      release: Buffer.from("release"),
      migration_registry: Buffer.from("registry"),
      advisory: Buffer.from("advisory"),
      migration_document: Buffer.from("document"),
    });

    expect(compareEngineUpdateAdvisory(provenance(target), advisory)).toEqual({
      status: "current",
      current: provenance(target),
    });
    expect(compareEngineUpdateAdvisory(provenance(old), advisory)).toEqual({
      status: "review_candidate_available",
      current: provenance(old),
      target: {
        repository: target.repository,
        version: target.version,
        release_digest: target.release_digest,
      },
      migration_edge_ids: ["one-one-one"],
    });
  });
});

describe("migration registry", () => {
  it("resolves exactly one forward path and refuses ambiguous paths", () => {
    const old = release("2026.08.01");
    const middle = release("2026.08.02");
    const target = release("2026.08.03");
    const edge = (
      id: string,
      from: EngineReleaseManifest,
      to: EngineReleaseManifest,
    ) => ({
      id,
      from: {
        repository: from.repository,
        version: from.version,
        release_digest: from.release_digest,
      },
      to: {
        repository: to.repository,
        version: to.version,
        release_digest: to.release_digest,
      },
      document: `./engine/migrations/${id}.json` as const,
      document_digest: digest(id),
      write_scopes: ["manifest"] as ["manifest"],
    });
    const registry: MigrationRegistry = {
      schema_version: "1.0.0",
      edges: [edge("first", old, middle), edge("second", middle, target)],
    };
    const current = {
      repository: old.repository,
      version: old.version,
      release_digest: old.release_digest,
    };
    const desired = {
      repository: target.repository,
      version: target.version,
      release_digest: target.release_digest,
    };
    expect(
      resolveUniqueMigrationPath(registry, current, desired)?.map(
        (item) => item.id,
      ),
    ).toEqual(["first", "second"]);
    expect(validateMigrationRegistry(registry, target)).toEqual([]);
    registry.edges.push(edge("direct", old, target));
    expect(
      resolveUniqueMigrationPath(registry, current, desired),
    ).toBeUndefined();
  });
});

describe("manifest document", () => {
  it("evaluates only closed manifest patches in memory", () => {
    const old = release("2026.08.01");
    const edge = {
      id: "schema",
      from: {
        repository: old.repository,
        version: old.version,
        release_digest: old.release_digest,
      },
      to: {
        repository: old.repository,
        version: "2026.08.02",
        release_digest: digest("next"),
      },
      document: "./engine/migrations/schema.json" as const,
      document_digest: digest("schema"),
      write_scopes: ["manifest"] as ["manifest"],
    };
    const document: MigrationDocument = {
      schema_version: "1.0.0",
      id: "schema",
      operations: [
        {
          kind: "manifest-json-patch",
          path: "./coffee-chat.json",
          patch: [
            { op: "test", path: "/repository_role", value: "instance" },
            { op: "replace", path: "/schema_version", value: "1.1.0" },
          ],
        },
      ],
    };
    const before = Buffer.from(
      '{"schema_version":"1.0.0","repository_role":"instance"}\n',
    );
    const result = evaluateMigrationDocument(before, edge, document);
    expect(result).toHaveLength(1);
    expect(result[0]?.before).toEqual(before);
    expect(JSON.parse(result[0]!.after.toString("utf8"))).toMatchObject({
      schema_version: "1.1.0",
    });
    expect(() =>
      evaluateMigrationDocument(before, edge, {
        ...document,
        operations: [
          {
            ...document.operations[0]!,
            patch: [{ op: "remove", path: "/schema_version" } as never],
          },
        ],
      }),
    ).toThrow(/migration/i);
  });
});

describe("verified update inspection", () => {
  it("returns a verified forward update without mutating either checkout", async () => {
    const old = release("2026.08.01");
    const target = release("2026.08.02");
    const sourceRelease = {
      ...target,
      migration_registry: {
        path: "./engine/migrations/registry.json" as const,
        digest: digest("placeholder"),
      },
    };
    sourceRelease.release_digest = canonicalEngineReleaseDigest(sourceRelease);
    const edge = {
      id: "schema-forward",
      from: {
        repository: old.repository,
        version: old.version,
        release_digest: old.release_digest,
      },
      to: {
        repository: target.repository,
        version: target.version,
        release_digest: sourceRelease.release_digest,
      },
      document: "./engine/migrations/schema-forward.json" as const,
      document_digest: digest("pending"),
      write_scopes: ["manifest"] as ["manifest"],
    };
    const document = {
      schema_version: "1.0.0" as const,
      id: edge.id,
      operations: [
        {
          kind: "manifest-json-patch" as const,
          path: "./coffee-chat.json" as const,
          patch: [
            {
              op: "replace" as const,
              path: "/schema_version" as const,
              value: "1.1.0",
            },
          ],
        },
      ],
    };
    const documentBytes = Buffer.from(`${JSON.stringify(document)}\n`);
    edge.document_digest = digest(documentBytes);
    const registry = { schema_version: "1.0.0" as const, edges: [edge] };
    const registryBytes = Buffer.from(`${JSON.stringify(registry)}\n`);
    sourceRelease.migration_registry.digest = digest(registryBytes);
    const manifest = {
      schema_version: "1.1.0",
      repository_role: "instance",
      provenance: {
        engine: provenance(old),
        created_from: {
          method: "github-template",
          template_repository: old.repository,
        },
      },
    };
    const lock = {
      schema_version: "1.0.0",
      engine: provenance(old),
      managed_files: [],
    };
    const files = new Map<string, Buffer>([
      [
        "/source/engine/release.json",
        Buffer.from(`${JSON.stringify(sourceRelease)}\n`),
      ],
      ["/source/engine/migrations/registry.json", registryBytes],
      ["/source/engine/migrations/schema-forward.json", documentBytes],
      [
        "/target/coffee-chat.json",
        Buffer.from(`${JSON.stringify(manifest)}\n`),
      ],
      [
        "/target/.coffee-chat/engine-lock.json",
        Buffer.from(`${JSON.stringify(lock)}\n`),
      ],
    ]);
    const calls: string[] = [];
    const result = await inspectEngineUpdate(
      { target_root: "/target", source_root: "/source" },
      {
        read_file: async (path) => {
          const value = files.get(path);
          if (!value) throw new Error("missing");
          return Buffer.from(value);
        },
        lstat: async (path) => ({
          mode: 0n,
          isSymbolicLink: () => !files.has(path),
        }),
        run_git_readonly: async (_cwd, args) => {
          calls.push(args.join(" "));
          return `${"b".repeat(40)}\n`;
        },
      },
    );
    expect(result).toMatchObject({
      status: "update_available",
      migration_path: [expect.objectContaining({ id: edge.id })],
    });
    expect(calls).toEqual(["rev-parse refs/tags/v2026.08.02"]);
    expect(
      JSON.parse(files.get("/target/coffee-chat.json")!.toString("utf8")),
    ).toEqual(manifest);
  });
});
