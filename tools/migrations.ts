import { createHash } from "node:crypto";
import type { Diagnostic } from "./contracts.ts";
import {
  ValidationFailure,
  repositoryPath,
  sortDiagnostics,
} from "./contracts.ts";
import type { EngineReleaseManifest } from "./engine-contracts.ts";
import type { EngineProvenance } from "./engine-provenance.ts";
import { decodeCanonicalText, parseStrictJson } from "./strict-input.ts";
import { compareCalver, isCalver } from "./calver.ts";

export type EngineReleaseIdentity = {
  repository: string;
  version: string;
  release_digest: `sha256:${string}`;
};
export type MigrationEdge = {
  id: string;
  from: EngineReleaseIdentity;
  to: EngineReleaseIdentity;
  document: `./engine/migrations/${string}.json`;
  document_digest: `sha256:${string}`;
  write_scopes: ["manifest"];
};
export type MigrationRegistry = {
  schema_version: "1.0.0";
  edges: MigrationEdge[];
};
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };
export type ManifestMutationPointer = "/schema_version";
export type ManifestTestPointer =
  | ManifestMutationPointer
  | "/repository_role"
  | "/provenance/engine/repository"
  | "/provenance/engine/version"
  | "/provenance/engine/release_digest";
export type JsonPatch =
  | { op: "add" | "replace"; path: ManifestMutationPointer; value: JsonValue }
  | { op: "test"; path: ManifestTestPointer; value: JsonValue };
export type MigrationOperation = {
  kind: "manifest-json-patch";
  path: "./coffee-chat.json";
  patch: JsonPatch[];
};
export type MigrationDocument = {
  schema_version: "1.0.0";
  id: string;
  operations: MigrationOperation[];
};
export type MigrationFileOperation = {
  path: "./coffee-chat.json";
  before: Buffer;
  after: Buffer;
  scope: "manifest";
};
export type BoundUpdaterReference<
  Path extends `./references/${string}.schema.json`,
> = { path: Path; digest: `sha256:${string}` };
export type EngineUpdateAdvisory = {
  schema_version: "1.0.0";
  repository: string;
  target: EngineReleaseIdentity;
  registry_digest: `sha256:${string}`;
  reference_schemas: {
    release: BoundUpdaterReference<"./references/engine-release.schema.json">;
    migration_registry: BoundUpdaterReference<"./references/engine-migration-registry.schema.json">;
    advisory: BoundUpdaterReference<"./references/engine-update-advisory.schema.json">;
    migration_document: BoundUpdaterReference<"./references/engine-migration-document.schema.json">;
  };
  candidates: Array<{
    current: EngineReleaseIdentity;
    migration_edge_ids: string[];
  }>;
};
export type AdvisoryUpdateStatus =
  | { status: "current"; current: EngineProvenance }
  | {
      status: "review_candidate_available";
      current: EngineProvenance;
      target: EngineReleaseIdentity;
      migration_edge_ids: string[];
    }
  | { status: "unknown"; reason_code: string }
  | { status: "incompatible"; reason_code: string };

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DOCUMENT = /^\.\/engine\/migrations\/[A-Za-z0-9._-]+\.json$/;
const TEST_POINTERS = new Set<ManifestTestPointer>([
  "/schema_version",
  "/repository_role",
  "/provenance/engine/repository",
  "/provenance/engine/version",
  "/provenance/engine/release_digest",
]);

export function sha256(bytes: Buffer): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
    ? (value as Record<string, unknown>)
    : undefined;
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === keys.length &&
    actual.every((key, index) => key === [...keys].sort()[index])
  );
}
function identity(value: unknown): value is EngineReleaseIdentity {
  const item = record(value);
  return Boolean(
    item &&
      exactKeys(item, ["repository", "version", "release_digest"]) &&
      typeof item.repository === "string" &&
      typeof item.version === "string" &&
      isCalver(item.version) &&
      typeof item.release_digest === "string" &&
      DIGEST.test(item.release_digest),
  );
}
function identityKey(value: EngineReleaseIdentity): string {
  return `${value.repository}\u0000${value.version}\u0000${value.release_digest}`;
}
function sameIdentity(
  left: EngineReleaseIdentity,
  right: EngineReleaseIdentity,
): boolean {
  return identityKey(left) === identityKey(right);
}
function diagnostic(
  code: string,
  pointer: string,
  message: string,
): Diagnostic {
  return { code, path: "./engine/migrations/registry.json", pointer, message };
}

export function validateMigrationRegistry(
  registry: unknown,
  release: EngineReleaseManifest,
): Diagnostic[] {
  const output: Diagnostic[] = [];
  const value = record(registry);
  if (
    !value ||
    !exactKeys(value, ["schema_version", "edges"]) ||
    value.schema_version !== "1.0.0" ||
    !Array.isArray(value.edges)
  )
    return [
      diagnostic(
        "migration-registry-invalid",
        "",
        "Migration registry must be a strict v1 data document.",
      ),
    ];
  const ids = new Set<string>();
  const pairs = new Set<string>();
  for (const [index, raw] of value.edges.entries()) {
    const edge = record(raw);
    const p = `/edges/${index}`;
    if (
      !edge ||
      !exactKeys(edge, [
        "id",
        "from",
        "to",
        "document",
        "document_digest",
        "write_scopes",
      ]) ||
      !ID.test(String(edge.id ?? "")) ||
      !identity(edge.from) ||
      !identity(edge.to) ||
      typeof edge.document !== "string" ||
      !DOCUMENT.test(edge.document) ||
      typeof edge.document_digest !== "string" ||
      !DIGEST.test(edge.document_digest) ||
      !Array.isArray(edge.write_scopes) ||
      edge.write_scopes.length !== 1 ||
      edge.write_scopes[0] !== "manifest"
    ) {
      output.push(
        diagnostic(
          "migration-registry-edge-invalid",
          p,
          "Migration edge is not a closed declarative edge.",
        ),
      );
      continue;
    }
    if (
      edge.from.repository !== release.repository ||
      edge.to.repository !== release.repository
    )
      output.push(
        diagnostic(
          "migration-registry-repository-mismatch",
          p,
          "Migration edges must bind the release repository.",
        ),
      );
    if (compareCalver(edge.from.version, edge.to.version) >= 0)
      output.push(
        diagnostic(
          "migration-registry-nonforward",
          p,
          "Migration edges must strictly increase CalVer.",
        ),
      );
    const id = edge.id as string;
    if (ids.has(id))
      output.push(
        diagnostic(
          "migration-registry-duplicate-id",
          `${p}/id`,
          "Migration edge IDs must be unique.",
        ),
      );
    ids.add(id);
    const pair = `${identityKey(edge.from)}>${identityKey(edge.to)}`;
    if (pairs.has(pair))
      output.push(
        diagnostic(
          "migration-registry-duplicate-edge",
          p,
          "Migration edges must be unambiguous.",
        ),
      );
    pairs.add(pair);
  }
  const graph = new Map<string, string[]>();
  for (const raw of value.edges) {
    const edge = raw as MigrationEdge;
    if (!identity(edge.from) || !identity(edge.to)) continue;
    const from = identityKey(edge.from),
      to = identityKey(edge.to);
    graph.set(from, [...(graph.get(from) ?? []), to]);
  }
  const active = new Set<string>(),
    done = new Set<string>();
  const visit = (node: string): boolean => {
    if (active.has(node)) return true;
    if (done.has(node)) return false;
    active.add(node);
    for (const next of graph.get(node) ?? []) if (visit(next)) return true;
    active.delete(node);
    done.add(node);
    return false;
  };
  if ([...graph.keys()].some(visit))
    output.push(
      diagnostic(
        "migration-registry-cycle",
        "/edges",
        "Migration registry must not contain cycles.",
      ),
    );
  return sortDiagnostics(output);
}

export function resolveUniqueMigrationPath(
  registry: MigrationRegistry,
  current: EngineReleaseIdentity,
  target: EngineReleaseIdentity,
): MigrationEdge[] | undefined {
  if (!sameIdentity(current, target)) {
    if (
      current.repository !== target.repository ||
      compareCalver(current.version, target.version) >= 0
    )
      return undefined;
  } else return [];
  const found: MigrationEdge[][] = [];
  const walk = (
    node: EngineReleaseIdentity,
    path: MigrationEdge[],
    seen: Set<string>,
  ) => {
    if (found.length > 1) return;
    const nodeKey = identityKey(node);
    if (seen.has(nodeKey)) return;
    for (const edge of registry.edges) {
      if (
        !sameIdentity(edge.from, node) ||
        edge.from.repository !== target.repository ||
        edge.to.repository !== target.repository ||
        compareCalver(edge.from.version, edge.to.version) >= 0 ||
        compareCalver(edge.to.version, target.version) > 0
      )
        continue;
      const next = [...path, edge];
      if (sameIdentity(edge.to, target)) found.push(next);
      else walk(edge.to, next, new Set([...seen, nodeKey]));
    }
  };
  walk(current, [], new Set());
  return found.length === 1 ? found[0] : undefined;
}

export function buildEngineUpdateAdvisory(
  release: EngineReleaseManifest,
  registry: MigrationRegistry,
  schemas: {
    release: Buffer;
    migration_registry: Buffer;
    advisory: Buffer;
    migration_document: Buffer;
  },
): EngineUpdateAdvisory {
  const diagnostics = validateMigrationRegistry(registry, release);
  if (diagnostics.length) throw new ValidationFailure(diagnostics[0]!);
  const target: EngineReleaseIdentity = {
    repository: release.repository,
    version: release.version,
    release_digest: release.release_digest,
  };
  const source = new Map<string, EngineReleaseIdentity>();
  for (const edge of registry.edges)
    source.set(identityKey(edge.from), edge.from);
  const candidates = [...source.values()]
    .flatMap((current) => {
      const path = resolveUniqueMigrationPath(registry, current, target);
      return path && path.length
        ? [{ current, migration_edge_ids: path.map((edge) => edge.id) }]
        : [];
    })
    .sort((a, b) =>
      identityKey(a.current).localeCompare(identityKey(b.current)),
    );
  return {
    schema_version: "1.0.0",
    repository: release.repository,
    target,
    registry_digest: release.migration_registry.digest,
    reference_schemas: {
      release: {
        path: "./references/engine-release.schema.json",
        digest: sha256(schemas.release),
      },
      migration_registry: {
        path: "./references/engine-migration-registry.schema.json",
        digest: sha256(schemas.migration_registry),
      },
      advisory: {
        path: "./references/engine-update-advisory.schema.json",
        digest: sha256(schemas.advisory),
      },
      migration_document: {
        path: "./references/engine-migration-document.schema.json",
        digest: sha256(schemas.migration_document),
      },
    },
    candidates,
  };
}

function validProvenance(value: EngineProvenance): boolean {
  return Boolean(
    value &&
      typeof value.repository === "string" &&
      typeof value.version === "string" &&
      isCalver(value.version) &&
      typeof value.release_digest === "string" &&
      DIGEST.test(value.release_digest) &&
      typeof value.source_commit === "string" &&
      /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.source_commit),
  );
}
function validAdvisory(value: EngineUpdateAdvisory): boolean {
  if (
    !value ||
    value.schema_version !== "1.0.0" ||
    !identity(value.target) ||
    value.repository !== value.target.repository ||
    !DIGEST.test(value.registry_digest) ||
    !Array.isArray(value.candidates)
  )
    return false;
  const refs = value.reference_schemas;
  if (
    !value.candidates.every(
      (candidate) =>
        candidate &&
        identity(candidate.current) &&
        Array.isArray(candidate.migration_edge_ids) &&
        candidate.migration_edge_ids.length > 0 &&
        candidate.migration_edge_ids.every((id) => typeof id === "string"),
    )
  )
    return false;
  const candidateIdentities = value.candidates.map((candidate) =>
    identityKey(candidate.current),
  );
  if (new Set(candidateIdentities).size !== candidateIdentities.length)
    return false;
  return Boolean(
    refs &&
      refs.release.path === "./references/engine-release.schema.json" &&
      refs.migration_registry.path ===
        "./references/engine-migration-registry.schema.json" &&
      refs.advisory.path ===
        "./references/engine-update-advisory.schema.json" &&
      refs.migration_document.path ===
        "./references/engine-migration-document.schema.json" &&
      Object.values(refs).every((item) => DIGEST.test(item.digest)),
  );
}
export function compareEngineUpdateAdvisory(
  current: EngineProvenance,
  advisory: EngineUpdateAdvisory,
): AdvisoryUpdateStatus {
  if (!validProvenance(current))
    return {
      status: "incompatible",
      reason_code: "current-provenance-invalid",
    };
  if (!validAdvisory(advisory))
    return { status: "incompatible", reason_code: "advisory-invalid" };
  const identityCurrent: EngineReleaseIdentity = {
    repository: current.repository,
    version: current.version,
    release_digest: current.release_digest,
  };
  if (sameIdentity(identityCurrent, advisory.target))
    return { status: "current", current };
  if (current.repository !== advisory.repository)
    return { status: "incompatible", reason_code: "repository-mismatch" };
  if (current.version === advisory.target.version)
    return { status: "incompatible", reason_code: "version-digest-mismatch" };
  const matches = advisory.candidates.filter((candidate) =>
    sameIdentity(candidate.current, identityCurrent),
  );
  if (matches.length === 1 && matches[0]!.migration_edge_ids.length)
    return {
      status: "review_candidate_available",
      current,
      target: advisory.target,
      migration_edge_ids: matches[0]!.migration_edge_ids,
    };
  return { status: "unknown", reason_code: "migration-path-unknown" };
}

function jsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(jsonValue);
  const item = record(value);
  return Boolean(item && Object.values(item).every(jsonValue));
}
function atPointer(
  value: Record<string, unknown>,
  pointer: ManifestTestPointer,
): unknown {
  return pointer
    .slice(1)
    .split("/")
    .reduce<unknown>((node, key) => record(node)?.[key], value);
}
function migrationFailure(code: string): never {
  throw new ValidationFailure({
    code,
    path: "./engine/migrations",
    message:
      "Migration document is not a permitted declarative manifest patch.",
  });
}
export function evaluateMigrationDocument(
  manifest: Buffer,
  edge: MigrationEdge,
  document: MigrationDocument,
): MigrationFileOperation[] {
  let parsed: unknown;
  try {
    parsed = parseStrictJson(
      decodeCanonicalText(manifest, "coffee-chat.json"),
      "coffee-chat.json",
    );
  } catch {
    return migrationFailure("migration-manifest-invalid");
  }
  const documentRecord = record(document);
  const root = record(parsed);
  if (
    !root ||
    !documentRecord ||
    !exactKeys(documentRecord, ["schema_version", "id", "operations"]) ||
    document.schema_version !== "1.0.0" ||
    document.id !== edge.id ||
    !Array.isArray(document.operations) ||
    document.operations.length !== 1 ||
    !Array.isArray(edge.write_scopes) ||
    edge.write_scopes.length !== 1 ||
    edge.write_scopes[0] !== "manifest"
  )
    return migrationFailure("migration-document-invalid");
  const operation = document.operations[0] as unknown;
  const item = record(operation);
  if (
    !item ||
    !exactKeys(item, ["kind", "path", "patch"]) ||
    item.kind !== "manifest-json-patch" ||
    item.path !== "./coffee-chat.json" ||
    !Array.isArray(item.patch) ||
    item.patch.length === 0
  )
    return migrationFailure("migration-operation-invalid");
  const output = structuredClone(root);
  for (const patch of item.patch) {
    const value = record(patch);
    if (
      !value ||
      !exactKeys(value, ["op", "path", "value"]) ||
      !jsonValue(value.value) ||
      typeof value.op !== "string" ||
      typeof value.path !== "string"
    )
      return migrationFailure("migration-patch-invalid");
    if (value.op === "test") {
      if (
        !TEST_POINTERS.has(value.path as ManifestTestPointer) ||
        JSON.stringify(atPointer(output, value.path as ManifestTestPointer)) !==
          JSON.stringify(value.value)
      )
        return migrationFailure("migration-test-failed");
    } else if (
      (value.op === "add" || value.op === "replace") &&
      value.path === "/schema_version"
    )
      output.schema_version = value.value;
    else return migrationFailure("migration-patch-forbidden");
  }
  return [
    {
      path: "./coffee-chat.json",
      before: Buffer.from(manifest),
      after: Buffer.from(`${JSON.stringify(output, null, 2)}\n`, "utf8"),
      scope: "manifest",
    },
  ];
}
