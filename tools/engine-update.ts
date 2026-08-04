import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  lstat as fsLstat,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, relative, resolve } from "node:path";
import { canonicalEngineReleaseDigest } from "./engine-release.ts";
import type { EngineReleaseManifest } from "./engine-contracts.ts";
import type { EngineProvenance } from "./engine-provenance.ts";
import {
  assertLockMatchesManifest,
  normalizeGitHubRepositoryUrl,
  parseEngineLock,
} from "./engine-provenance.ts";
import {
  isInstanceGraph,
  isInstanceManifest,
  sha256 as knowledgeSha256,
  validateKnowledge,
  type InstanceGraph,
  type InstanceManifest,
} from "./knowledge.ts";
import {
  evaluateMigrationDocument,
  resolveUniqueMigrationPath,
  sha256,
  validateMigrationRegistry,
  type MigrationDocument,
  type MigrationEdge,
  type MigrationRegistry,
} from "./migrations.ts";
import { canonicalizeJson } from "./generate.ts";
import { applyAtomicFileTransaction } from "./transaction.ts";
import { decodeCanonicalText, parseStrictJson } from "./strict-input.ts";
import { createSnapshot } from "./snapshot.ts";
import type { TargetFingerprint } from "./candidate.ts";
import { writeGeneratedProjections } from "./projections.ts";
import { isCalver } from "./calver.ts";

export type VerifiedEngineUpdateStatus =
  | { status: "current"; current: EngineProvenance }
  | {
      status: "update_available";
      current: EngineProvenance;
      target: EngineProvenance;
      migration_path: MigrationEdge[];
      documents: MigrationDocument[];
    }
  | { status: "unknown"; reason_code: string }
  | { status: "incompatible"; reason_code: string };
export type InspectEngineUpdateInput = {
  target_root: string;
  source_root: string;
};
export type EngineUpdateDependencies = {
  read_file: (path: string) => Promise<Buffer>;
  lstat: (path: string) => Promise<{ mode: bigint; isSymbolicLink(): boolean }>;
  run_git_readonly: (cwd: string, args: string[]) => Promise<string>;
};

export type Sha256Digest = `sha256:${string}`;
export type EngineSourceFingerprint = {
  real_path: string;
  origin_url: string;
  source_commit: string;
  source_tree: string;
  release_digest: Sha256Digest;
  registry_digest: Sha256Digest;
  package_lock_digest: Sha256Digest;
};
export type EngineReviewSetupGitEffect = {
  kind: "git-checkout";
  command: string[];
  network_hosts: string[];
  writes: string[];
};
export type EngineReviewSetupNpmEffect = {
  kind: "npm-ci";
  command: ["npm", "ci", "--ignore-scripts"];
  network_hosts: [string];
  writes: ["node_modules/**"];
};
export type EngineReviewSetupEffect =
  | EngineReviewSetupGitEffect
  | EngineReviewSetupNpmEffect;
export type EngineReviewSetupPreview = {
  schema_version: "1.0.0";
  setup_digest: Sha256Digest;
  source: {
    repository: string;
    source_ref: string;
    source_commit: string;
    release_digest: Sha256Digest;
    registry_digest: Sha256Digest;
    package_lock_digest: Sha256Digest;
  };
  checkout: {
    path: string;
    node_version: "24.5.0";
    npm_version: "11.5.1";
    receipt_path: string;
  };
  effects: [EngineReviewSetupGitEffect, EngineReviewSetupNpmEffect];
};
export type EngineReviewSetupCommandResult = {
  command: string[];
  exit_code: number;
  stdout_digest: Sha256Digest;
  stderr_digest: Sha256Digest;
};
export type CompletedEngineReviewSetupReceipt = {
  schema_version: "1.0.0";
  setup_digest: Sha256Digest;
  status: "completed";
  source: EngineReviewSetupPreview["source"];
  checkout_path: string;
  observations: {
    source_commit: string;
    source_tree: string;
    release_digest: Sha256Digest;
    registry_digest: Sha256Digest;
    package_lock_digest: Sha256Digest;
    node_version: "24.5.0";
    npm_version: "11.5.1";
    registry_host: string;
    writes: ["node_modules/**"];
  };
  command_results: [
    EngineReviewSetupCommandResult,
    EngineReviewSetupCommandResult,
  ];
  completed_effects: ["git-checkout", "npm-ci"];
};
export type InvalidatedEngineReviewSetupReceipt = {
  schema_version: "1.0.0";
  setup_digest: Sha256Digest;
  status: "invalidated";
  reason_codes: string[];
  completed_effects: [];
};
export type PartialEngineReviewSetupReceipt = {
  schema_version: "1.0.0";
  setup_digest: Sha256Digest;
  status: "partial_setup_result";
  completed_effects: [] | ["git-checkout"];
  checkout_path?: string;
  command_results: EngineReviewSetupCommandResult[];
  recovery: string[];
};
export type EngineReviewSetupReceipt =
  | CompletedEngineReviewSetupReceipt
  | InvalidatedEngineReviewSetupReceipt
  | PartialEngineReviewSetupReceipt;
export type EngineSetupObservation = {
  kind: "npm-ci";
  setup_digest: Sha256Digest;
  setup_receipt_digest: Sha256Digest;
  cwd: string;
  command: ["npm", "ci", "--ignore-scripts"];
  node_version: "24.5.0";
  npm_version: "11.5.1";
  lockfile_digest: Sha256Digest;
  registry_host: string;
  writes: [string];
  exit_code: 0;
  stdout_digest: Sha256Digest;
  stderr_digest: Sha256Digest;
};
export type PrepareCheck = {
  name: string;
  status: "passed" | "blocked";
  diagnostic_codes: string[];
};
export type CanonicalProfileSemantics = {
  id: string;
  display_name: string;
  short_name: string;
  time_zone: string;
  repository_url: string;
  pages_url: string;
  plugin_name: string;
  marketplace_name: string;
  created_from: { method: "github-template"; template_repository: string };
};
export type CanonicalCitationSemantics = {
  url: string;
  title: string;
  published_on?: string;
  accessed_on?: string;
};
export type CanonicalNoteSemantics = {
  id: string;
  title: string;
  recorded_on: string;
  temporal_coverage: string;
  authored_body_digest: Sha256Digest;
  sources: CanonicalCitationSemantics[];
  entities: string[];
  internal_links: string[];
};
export type CanonicalEntitySemantics = {
  id: string;
  label: string;
  kind?: string;
  aliases: string[];
  same_as: string[];
};
export type InstanceKnowledgeSemantics = {
  instance_owned_manifest_digest: Sha256Digest;
  profile: CanonicalProfileSemantics;
  notes: CanonicalNoteSemantics[];
  entities: CanonicalEntitySemantics[];
  content_license_digest: Sha256Digest;
  forbidden_persisted_synthesis: [];
};
export type InstancePreservationLedger = {
  before_semantic_digest: Sha256Digest;
  after_semantic_digest: Sha256Digest;
  fields: Array<{
    pointer: string;
    before_digest: Sha256Digest;
    after_digest: Sha256Digest;
    status: "preserved";
  }>;
};
export type EngineUpdatePreview = {
  schema_version: "1.0.0";
  update_digest: Sha256Digest;
  target_fingerprint: TargetFingerprint;
  source_fingerprint: EngineSourceFingerprint;
  current_engine: EngineProvenance;
  target_engine: EngineProvenance;
  migration_path: MigrationEdge[];
  worktree_plan: {
    branch_name: string;
    path: string;
    base_commit: string;
    empty_hooks_path: string;
    empty_hooks_path_digest: Sha256Digest;
    effective_config_digest: Sha256Digest;
    worktree_argv: string[];
    tree_materialization: "ls-tree-cat-file";
    filters: "custom-filters-rejected";
  };
  receipt_plan: { path: string };
  setup_observations: EngineSetupObservation[];
  validation_commands: string[];
  prepare_checks: PrepareCheck[];
  changed_paths: Array<{
    path: string;
    change: "create" | "update" | "delete";
    ownership: "engine" | "manifest" | "projection";
    before_digest?: Sha256Digest;
    after_digest?: Sha256Digest;
    before_mode?: "100644" | "100755";
    after_mode?: "100644" | "100755";
  }>;
  conflicts: Array<{
    path: string;
    expected_digest: Sha256Digest;
    expected_mode: "100644" | "100755";
    actual:
      | { state: "file"; digest: Sha256Digest; mode: "100644" | "100755" }
      | { state: "missing" | "symlink" | "other" };
  }>;
  preservation: InstancePreservationLedger;
  instance_plugin_version: {
    before: string;
    after: string;
    before_content_digest: Sha256Digest;
    after_content_digest: Sha256Digest;
    reason: "unchanged-package" | "distributable-package-changed";
  };
  validation: { status: "passed" | "blocked" };
};
export type EngineUpdateCandidateFile = {
  candidate_path: string;
  target_path: string;
  digest: Sha256Digest;
  mode: "100644" | "100755";
};
export type EngineUpdateCandidateManifest = {
  schema_version: "1.0.0";
  update_digest: Sha256Digest;
  preview: Omit<EngineUpdatePreview, "update_digest">;
  proposed_files: EngineUpdateCandidateFile[];
  deletions: Array<{
    target_path: string;
    before_digest: Sha256Digest;
    before_mode: "100644" | "100755";
  }>;
  support_files: Array<{ path: string; digest: Sha256Digest }>;
};
export type EngineUpdateCommandResult = {
  command: string;
  exit_code: number;
  stdout_digest: Sha256Digest;
  stderr_digest: Sha256Digest;
};
export type EngineUpdateReceiptCommon = {
  schema_version: "1.0.0";
  update_digest: Sha256Digest;
  base_commit: string;
  current_engine: EngineProvenance;
  target_engine: EngineProvenance;
  source_fingerprint: EngineSourceFingerprint;
  migration_edge_ids: string[];
  changed_paths: string[];
  preservation: InstancePreservationLedger;
  command_results: EngineUpdateCommandResult[];
};
export type AppliedEngineUpdateReceipt = EngineUpdateReceiptCommon & {
  status: "applied";
  branch_name: string;
  worktree_path: string;
  result_tree: {
    git_tree_sha: string;
    inventory_digest: Sha256Digest;
    base_index_tree_sha: string;
    unstaged_diff_digest: Sha256Digest;
    changed_paths: string[];
  };
};
export type InvalidatedEngineUpdateReceipt = EngineUpdateReceiptCommon & {
  status: "invalidated";
  reason_codes: string[];
  completed_steps: [];
};
export type PartialEngineUpdateReceipt = EngineUpdateReceiptCommon & {
  status: "partial_apply_result";
  branch_name?: string;
  worktree_path?: string;
  completed_steps: Array<
    "branch-created" | "worktree-created" | "files-applied"
  >;
  recovery: string[];
};
export type EngineUpdateReceipt =
  | AppliedEngineUpdateReceipt
  | InvalidatedEngineUpdateReceipt
  | PartialEngineUpdateReceipt;
export type PrepareEngineUpdateInput = {
  target_root: string;
  source_root: string;
  out_dir: string;
  setup_receipt_path: string;
  receipt_path: string;
};
export type ApplyEngineUpdateInput = {
  target_root: string;
  candidate_dir: string;
  approval_digest: Sha256Digest;
  receipt_path: string;
};
export type CommandResult = {
  exit_code: number;
  stdout: Buffer;
  stderr: Buffer;
};
export type EngineUpdateRuntime = EngineUpdateDependencies & {
  run_git: (input: {
    cwd: string;
    args: string[];
    env?: Readonly<Record<string, string>>;
    stdin?: Buffer;
  }) => Promise<CommandResult>;
  run_command: (cwd: string, argv: string[]) => Promise<CommandResult>;
  now: () => Date;
  write_file?: (path: string, bytes: Buffer) => Promise<void>;
  mkdir?: (path: string) => Promise<void>;
  remove?: (path: string) => Promise<void>;
};

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function provenance(value: unknown): EngineProvenance | undefined {
  const candidate = record(value);
  if (
    !candidate ||
    typeof candidate.repository !== "string" ||
    typeof candidate.version !== "string" ||
    typeof candidate.source_commit !== "string" ||
    !COMMIT.test(candidate.source_commit) ||
    typeof candidate.release_digest !== "string" ||
    !DIGEST.test(candidate.release_digest)
  )
    return undefined;
  return candidate as EngineProvenance;
}
function releaseIdentity(release: EngineReleaseManifest) {
  return {
    repository: release.repository,
    version: release.version,
    release_digest: release.release_digest,
  };
}
function equalIdentity(
  left: { repository: string; version: string; release_digest: string },
  right: { repository: string; version: string; release_digest: string },
) {
  return (
    left.repository === right.repository &&
    left.version === right.version &&
    left.release_digest === right.release_digest
  );
}
function inside(root: string, path: string): string {
  const relativePath = path.replace(/^\.\//, "");
  if (
    path.startsWith("/") ||
    relativePath.length === 0 ||
    relativePath
      .split("/")
      .some(
        (segment) =>
          segment.length === 0 || segment === "." || segment === "..",
      ) ||
    relativePath.includes("\\")
  )
    throw new Error("unsafe path");
  const absolute = resolve(root, relativePath);
  const rootAbsolute = resolve(root);
  if (absolute !== rootAbsolute && !absolute.startsWith(`${rootAbsolute}/`))
    throw new Error("path escape");
  return absolute;
}
async function readFile(
  dependencies: EngineUpdateDependencies,
  root: string,
  path: string,
): Promise<Buffer> {
  const absolute = inside(root, path);
  const entry = await dependencies.lstat(absolute);
  if (entry.isSymbolicLink()) throw new Error("symlink");
  return dependencies.read_file(absolute);
}
function strictJson(bytes: Buffer, path: string): unknown {
  return parseStrictJson(decodeCanonicalText(bytes, path), path);
}
function validRelease(value: unknown): value is EngineReleaseManifest {
  const item = record(value);
  const repository = /^https:\/\/github\.com\/[A-Za-z0-9.-]+\/[A-Za-z0-9._-]+$/;
  const filePath =
    /^\.\/(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)(?:[A-Za-z0-9._\-[\]]+\/)*[A-Za-z0-9._\-[\]]+$/;
  const files = (candidate: unknown, expectedClass: string) => {
    if (!Array.isArray(candidate)) return false;
    const paths: string[] = [];
    for (const raw of candidate) {
      const file = record(raw);
      if (
        !file ||
        Object.keys(file).sort().join("\0") !== "class\0digest\0mode\0path" ||
        typeof file.path !== "string" ||
        !filePath.test(file.path) ||
        typeof file.digest !== "string" ||
        !DIGEST.test(file.digest) ||
        file.class !== expectedClass ||
        (file.mode !== "100644" && file.mode !== "100755")
      )
        return false;
      paths.push(file.path);
    }
    return (
      paths.every((path, index) => index === 0 || paths[index - 1]! < path) &&
      new Set(paths).size === paths.length
    );
  };
  const managedPaths = new Set(
    Array.isArray(item?.managed_files)
      ? (item.managed_files as Array<{ path: string }>).map((file) => file.path)
      : [],
  );
  const deliveryPaths = new Set(
    Array.isArray(item?.delivery_files)
      ? (item.delivery_files as Array<{ path: string }>).map(
          (file) => file.path,
        )
      : [],
  );
  const inventoryOverlap = [...managedPaths].some((path) =>
    deliveryPaths.has(path),
  );
  return Boolean(
    item &&
      Object.keys(item).sort().join("\0") ===
        "delivery_files\0managed_files\0migration_registry\0release_digest\0repository\0schema_version\0source_ref\0target_manifest_schema_version\0version" &&
      item.schema_version === "1.0.0" &&
      typeof item.repository === "string" &&
      repository.test(item.repository) &&
      typeof item.version === "string" &&
      isCalver(item.version) &&
      typeof item.source_ref === "string" &&
      item.source_ref === `refs/tags/v${item.version}` &&
      typeof item.target_manifest_schema_version === "string" &&
      item.target_manifest_schema_version === "1.1.0" &&
      record(item.migration_registry)?.path ===
        "./engine/migrations/registry.json" &&
      typeof record(item.migration_registry)?.digest === "string" &&
      DIGEST.test(record(item.migration_registry)?.digest as string) &&
      files(item.managed_files, "engine-source") &&
      files(item.delivery_files, "engine-delivery") &&
      !inventoryOverlap &&
      typeof item.release_digest === "string" &&
      DIGEST.test(item.release_digest),
  );
}
async function verifyRelease(
  sourceRoot: string,
  dependencies: EngineUpdateDependencies,
): Promise<EngineReleaseManifest | undefined> {
  let release: EngineReleaseManifest;
  try {
    const raw = strictJson(
      await readFile(dependencies, sourceRoot, "engine/release.json"),
      "engine/release.json",
    );
    if (!validRelease(raw)) return undefined;
    release = raw;
  } catch {
    return undefined;
  }
  if (release.release_digest !== canonicalEngineReleaseDigest(release))
    return undefined;
  for (const file of [...release.managed_files, ...release.delivery_files]) {
    if (
      !file ||
      typeof file.path !== "string" ||
      typeof file.digest !== "string" ||
      !DIGEST.test(file.digest)
    )
      return undefined;
    try {
      if (
        sha256(await readFile(dependencies, sourceRoot, file.path)) !==
        file.digest
      )
        return undefined;
    } catch {
      return undefined;
    }
  }
  return release;
}
function asDocument(value: unknown): MigrationDocument | undefined {
  const item = record(value);
  if (
    !item ||
    item.schema_version !== "1.0.0" ||
    typeof item.id !== "string" ||
    !Array.isArray(item.operations)
  )
    return undefined;
  return item as MigrationDocument;
}

/** Purely read-only update inspection. Source and target remain untouched. */
export async function inspectEngineUpdate(
  input: InspectEngineUpdateInput,
  dependencies: EngineUpdateDependencies,
): Promise<VerifiedEngineUpdateStatus> {
  let targetManifest: Record<string, unknown>;
  try {
    const parsed = strictJson(
      await readFile(dependencies, input.target_root, "coffee-chat.json"),
      "coffee-chat.json",
    );
    const item = record(parsed);
    if (!item || item.repository_role !== "instance")
      return { status: "incompatible", reason_code: "target-role-invalid" };
    targetManifest = item;
  } catch {
    return { status: "unknown", reason_code: "target-manifest-unavailable" };
  }
  const current = provenance(record(targetManifest.provenance)?.engine);
  if (!current)
    return { status: "unknown", reason_code: "target-provenance-unknown" };
  try {
    const lock = parseEngineLock(
      await readFile(
        dependencies,
        input.target_root,
        ".coffee-chat/engine-lock.json",
      ),
      ".coffee-chat/engine-lock.json",
    );
    if (
      assertLockMatchesManifest(targetManifest as InstanceManifest, lock).length
    )
      return {
        status: "incompatible",
        reason_code: "target-engine-lock-mismatch",
      };
  } catch {
    return {
      status: "incompatible",
      reason_code: "target-engine-lock-invalid",
    };
  }
  const release = await verifyRelease(input.source_root, dependencies);
  if (!release)
    return { status: "incompatible", reason_code: "source-release-invalid" };
  if (current.repository !== release.repository)
    return { status: "incompatible", reason_code: "repository-mismatch" };
  let registry: MigrationRegistry;
  try {
    const bytes = await readFile(
      dependencies,
      input.source_root,
      "engine/migrations/registry.json",
    );
    if (sha256(bytes) !== release.migration_registry.digest)
      return {
        status: "incompatible",
        reason_code: "migration-registry-digest-mismatch",
      };
    const parsed = strictJson(bytes, "engine/migrations/registry.json");
    const diagnostics = validateMigrationRegistry(parsed, release);
    if (diagnostics.length)
      return { status: "incompatible", reason_code: diagnostics[0]!.code };
    registry = parsed as MigrationRegistry;
  } catch {
    return {
      status: "incompatible",
      reason_code: "migration-registry-unavailable",
    };
  }
  const target = releaseIdentity(release);
  if (equalIdentity(current, target)) return { status: "current", current };
  if (current.version === release.version)
    return { status: "incompatible", reason_code: "version-digest-mismatch" };
  const path = resolveUniqueMigrationPath(
    registry,
    {
      repository: current.repository,
      version: current.version,
      release_digest: current.release_digest,
    },
    target,
  );
  if (!path)
    return { status: "unknown", reason_code: "migration-path-unknown" };
  const documents: MigrationDocument[] = [];
  let migrationManifest = await readFile(
    dependencies,
    input.target_root,
    "coffee-chat.json",
  );
  for (const edge of path) {
    try {
      const bytes = await readFile(
        dependencies,
        input.source_root,
        edge.document,
      );
      if (sha256(bytes) !== edge.document_digest)
        return {
          status: "incompatible",
          reason_code: "migration-document-digest-mismatch",
        };
      const document = asDocument(strictJson(bytes, edge.document));
      if (!document)
        return {
          status: "incompatible",
          reason_code: "migration-document-invalid",
        };
      evaluateMigrationDocument(migrationManifest, edge, document).forEach(
        (operation) => {
          migrationManifest = operation.after;
        },
      );
      documents.push(document);
    } catch {
      return {
        status: "incompatible",
        reason_code: "migration-document-invalid",
      };
    }
  }
  let sourceCommit: string;
  try {
    sourceCommit = (
      await dependencies.run_git_readonly(input.source_root, [
        "rev-parse",
        release.source_ref,
      ])
    ).trim();
  } catch {
    return { status: "incompatible", reason_code: "source-ref-unavailable" };
  }
  if (!COMMIT.test(sourceCommit))
    return { status: "incompatible", reason_code: "source-ref-invalid" };
  return {
    status: "update_available",
    current,
    target: {
      repository: release.repository,
      version: release.version,
      source_commit: sourceCommit,
      release_digest: release.release_digest,
    },
    migration_path: path,
    documents,
  };
}

const UPDATE_DOMAIN = "coffee-chat-engine-update/v1";
const SETUP_DOMAIN = "coffee-chat-engine-review-setup/v1";
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const COMMIT_HEX = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

function digestValue(value: unknown): Sha256Digest {
  if (typeof value !== "string" || !SHA256.test(value))
    throw new Error("digest-invalid");
  return value as Sha256Digest;
}

function nextPatchVersion(value: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value);
  if (!match) throw new Error("plugin-version-invalid");
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function digestBytes(bytes: Buffer): Sha256Digest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digestJson(value: unknown, domain: string): Sha256Digest {
  const payload = { domain, ...(value as Record<string, unknown>) };
  return digestBytes(Buffer.from(canonicalizeJson(payload as never), "utf8"));
}

function stableJson(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8");
}

function jsonRecord(value: unknown): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    throw new Error("json-object-required");
  return value as Record<string, unknown>;
}

function pathValue(path: string): string {
  const normalized = path.replace(/^\.\//, "");
  if (
    normalized.length === 0 ||
    path.startsWith("/") ||
    normalized.includes("\\") ||
    normalized
      .split("/")
      .some((part) => part.length === 0 || part === "." || part === "..")
  )
    throw new Error("unsafe-path");
  return normalized;
}

async function readRuntimeFile(
  runtime: EngineUpdateRuntime,
  root: string,
  path: string,
): Promise<Buffer> {
  const relativePath = pathValue(path);
  const absolute = resolve(root, relativePath);
  const status = await runtime.lstat(absolute);
  if (status.isSymbolicLink()) throw new Error("symlink");
  return runtime.read_file(absolute);
}

async function runtimeGit(
  runtime: EngineUpdateRuntime,
  cwd: string,
  args: string[],
): Promise<Buffer> {
  const result = await runtime.run_git({ cwd, args });
  if (result.exit_code !== 0) throw new Error("git-command-failed");
  return Buffer.from(result.stdout);
}

async function runtimeGitText(
  runtime: EngineUpdateRuntime,
  cwd: string,
  args: string[],
): Promise<string> {
  return (await runtimeGit(runtime, cwd, args)).toString("utf8").trim();
}

function runtimeResult(
  result: CommandResult,
  command: string[],
): EngineUpdateCommandResult {
  return {
    command: command.join(" "),
    exit_code: result.exit_code,
    stdout_digest: digestBytes(result.stdout),
    stderr_digest: digestBytes(result.stderr),
  };
}

async function targetFingerprintFor(
  root: string,
  runtime: EngineUpdateRuntime,
): Promise<TargetFingerprint> {
  const commonRaw = await runtimeGitText(runtime, root, [
    "rev-parse",
    "--git-common-dir",
  ]);
  const commonPath = await realpath(resolve(root, commonRaw));
  const stat = (await runtime.lstat(commonPath)) as unknown as {
    dev?: bigint | number;
    ino?: bigint | number;
  };
  const originValues = (
    await runtimeGit(runtime, root, [
      "config",
      "--get-all",
      "remote.origin.url",
    ])
  )
    .toString("utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(normalizeGitHubRepositoryUrl);
  if (originValues.length !== 1 || new Set(originValues).size !== 1)
    throw new Error("origin-invalid");
  const manifest = await readRuntimeFile(runtime, root, "coffee-chat.json");
  return {
    git_common_dir: {
      real_path: commonPath,
      device: String(stat.dev ?? 0),
      inode: String(stat.ino ?? 0),
    },
    origin_url: originValues[0],
    base_commit: await runtimeGitText(runtime, root, [
      "rev-parse",
      "--verify",
      "HEAD^{commit}",
    ]),
    pre_conversion_manifest_digest: digestBytes(manifest),
  };
}

async function sourceFingerprintFor(
  root: string,
  release: EngineReleaseManifest,
  runtime: EngineUpdateRuntime,
  sourceCommit: string,
): Promise<EngineSourceFingerprint> {
  const origin = await runtimeGitText(runtime, root, [
    "config",
    "--get",
    "remote.origin.url",
  ]);
  const packageLock = await readRuntimeFile(runtime, root, "package-lock.json");
  const registry = await readRuntimeFile(
    runtime,
    root,
    "engine/migrations/registry.json",
  );
  return {
    real_path: await realpath(root),
    origin_url: normalizeGitHubRepositoryUrl(origin),
    source_commit: sourceCommit,
    source_tree: await runtimeGitText(runtime, root, [
      "rev-parse",
      sourceCommit + "^{tree}",
    ]),
    release_digest: release.release_digest,
    registry_digest: release.migration_registry.digest,
    package_lock_digest: digestBytes(packageLock),
  };
}

function setupReceiptObservation(
  value: unknown,
  source: EngineSourceFingerprint,
  sourceRef: string,
  setupPath: string,
): EngineSetupObservation {
  const receipt = jsonRecord(value);
  if (
    receipt.schema_version !== "1.0.0" ||
    receipt.status !== "completed" ||
    typeof receipt.setup_digest !== "string" ||
    !SHA256.test(receipt.setup_digest) ||
    !Array.isArray(receipt.completed_effects) ||
    JSON.stringify(receipt.completed_effects) !==
      JSON.stringify(["git-checkout", "npm-ci"])
  )
    throw new Error("setup-receipt-invalid");
  const sourceValue = jsonRecord(receipt.source);
  if (
    sourceValue.repository !== source.origin_url ||
    sourceValue.source_ref !== sourceRef ||
    sourceValue.source_commit !== source.source_commit ||
    sourceValue.release_digest !== source.release_digest ||
    sourceValue.registry_digest !== source.registry_digest ||
    sourceValue.package_lock_digest !== source.package_lock_digest
  )
    throw new Error("setup-receipt-source-drift");
  const observations = jsonRecord(receipt.observations);
  const commandResults = receipt.command_results;
  if (
    observations.node_version !== "24.5.0" ||
    observations.npm_version !== "11.5.1" ||
    observations.source_commit !== source.source_commit ||
    observations.source_tree !== source.source_tree ||
    observations.release_digest !== source.release_digest ||
    observations.registry_digest !== source.registry_digest ||
    observations.package_lock_digest !== source.package_lock_digest ||
    observations.writes instanceof Array === false ||
    JSON.stringify(observations.writes) !==
      JSON.stringify(["node_modules/**"]) ||
    !Array.isArray(commandResults) ||
    commandResults.length !== 2 ||
    !commandResults.every((item) => {
      const result = record(item);
      return Boolean(
        result &&
          Array.isArray(result.command) &&
          result.command.every((value) => typeof value === "string") &&
          result.exit_code === 0 &&
          typeof result.stdout_digest === "string" &&
          SHA256.test(result.stdout_digest) &&
          typeof result.stderr_digest === "string" &&
          SHA256.test(result.stderr_digest),
      );
    }) ||
    JSON.stringify((commandResults[1] as Record<string, unknown>).command) !==
      JSON.stringify(["npm", "ci", "--ignore-scripts"])
  )
    throw new Error("setup-receipt-observation-invalid");
  const checkoutPath = String(receipt.checkout_path ?? "");
  if (
    !checkoutPath.startsWith("/") ||
    checkoutPath.includes("\\") ||
    checkoutPath.split("/").some((part) => part === ".." || part === ".")
  )
    throw new Error("setup-checkout-path-invalid");
  return {
    kind: "npm-ci",
    setup_digest: digestValue(receipt.setup_digest),
    setup_receipt_digest: digestBytes(stableJson(value)),
    cwd: checkoutPath || setupPath,
    command: ["npm", "ci", "--ignore-scripts"],
    node_version: "24.5.0",
    npm_version: "11.5.1",
    lockfile_digest: source.package_lock_digest,
    registry_host: String(observations.registry_host ?? "registry.npmjs.org"),
    writes: ["node_modules/**"],
    exit_code: 0,
    stdout_digest: digestValue(commandResults[1]?.stdout_digest),
    stderr_digest: digestValue(commandResults[1]?.stderr_digest),
  };
}

export function extractKnowledgeSemantics(
  graph: InstanceGraph,
): InstanceKnowledgeSemantics {
  const manifest = JSON.parse(JSON.stringify(graph.manifest)) as Record<
    string,
    unknown
  >;
  delete manifest.schema_version;
  const plugin = jsonRecord(graph.manifest.plugin);
  delete plugin.version;
  manifest.plugin = plugin;
  if (manifest.provenance !== undefined) {
    const provenance = jsonRecord(manifest.provenance);
    delete provenance.engine;
    manifest.provenance = provenance;
  }
  const profile: CanonicalProfileSemantics = {
    id: graph.manifest.profile.id,
    display_name: graph.manifest.profile.display_name,
    short_name: graph.manifest.profile.short_name,
    time_zone: graph.manifest.time_zone,
    repository_url: graph.manifest.repository.url,
    pages_url: graph.manifest.pages_url,
    plugin_name: graph.manifest.plugin.name,
    marketplace_name: graph.manifest.marketplace_name,
    created_from: graph.manifest.provenance?.created_from ?? {
      method: "github-template",
      template_repository: graph.manifest.repository.url,
    },
  };
  const notes = graph.notes.map((note) => ({
    id: note.frontmatter.id,
    title: note.frontmatter.title,
    recorded_on: note.frontmatter.recorded_on,
    temporal_coverage: note.frontmatter.temporal_coverage,
    authored_body_digest: digestBytes(Buffer.from(note.body, "utf8")),
    sources: note.frontmatter.sources.map((source) => ({ ...source })),
    entities: [...(note.frontmatter.entities ?? [])].sort(),
    internal_links: [...note.noteLinks].sort(),
  }));
  notes.sort((left, right) => left.id.localeCompare(right.id));
  const entities = graph.entities
    .map((entity) => ({
      id: entity.id,
      label: entity.label,
      ...(entity.kind !== undefined ? { kind: entity.kind } : {}),
      aliases: [...(entity.aliases ?? [])].sort(),
      same_as: [...(entity.same_as ?? [])].sort(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return {
    instance_owned_manifest_digest: digestBytes(
      Buffer.from(canonicalizeJson(manifest as never), "utf8"),
    ),
    profile,
    notes,
    entities,
    content_license_digest: digestBytes(Buffer.alloc(0)),
    forbidden_persisted_synthesis: [],
  };
}

function preservationLedger(
  before: InstanceKnowledgeSemantics,
  after: InstanceKnowledgeSemantics,
): InstancePreservationLedger {
  const beforeBytes = Buffer.from(canonicalizeJson(before as never), "utf8");
  const afterBytes = Buffer.from(canonicalizeJson(after as never), "utf8");
  const beforeDigest = digestBytes(beforeBytes);
  const afterDigest = digestBytes(afterBytes);
  if (beforeDigest !== afterDigest)
    throw new Error("knowledge-semantics-drift");
  return {
    before_semantic_digest: beforeDigest,
    after_semantic_digest: afterDigest,
    fields: [
      {
        pointer: "/profile",
        before_digest: digestBytes(
          Buffer.from(canonicalizeJson(before.profile as never), "utf8"),
        ),
        after_digest: digestBytes(
          Buffer.from(canonicalizeJson(after.profile as never), "utf8"),
        ),
        status: "preserved",
      },
      ...before.notes.map((note) => ({
        pointer: "/notes/" + note.id,
        before_digest: digestBytes(
          Buffer.from(canonicalizeJson(note as never), "utf8"),
        ),
        after_digest: digestBytes(
          Buffer.from(
            canonicalizeJson(
              (after.notes.find((item) => item.id === note.id) ??
                note) as never,
            ),
            "utf8",
          ),
        ),
        status: "preserved" as const,
      })),
      ...before.entities.map((entity) => ({
        pointer: "/entities/" + entity.id,
        before_digest: digestBytes(
          Buffer.from(canonicalizeJson(entity as never), "utf8"),
        ),
        after_digest: digestBytes(
          Buffer.from(
            canonicalizeJson(
              (after.entities.find((item) => item.id === entity.id) ??
                entity) as never,
            ),
            "utf8",
          ),
        ),
        status: "preserved" as const,
      })),
      {
        pointer: "/content_license",
        before_digest: before.content_license_digest,
        after_digest: after.content_license_digest,
        status: "preserved" as const,
      },
      {
        pointer: "/forbidden_persisted_synthesis",
        before_digest: digestBytes(
          Buffer.from(
            canonicalizeJson(before.forbidden_persisted_synthesis as never),
            "utf8",
          ),
        ),
        after_digest: digestBytes(
          Buffer.from(
            canonicalizeJson(after.forbidden_persisted_synthesis as never),
            "utf8",
          ),
        ),
        status: "preserved" as const,
      },
    ],
  };
}

async function packageContentDigest(
  root: string,
  manifest: InstanceManifest,
  runtime: EngineUpdateRuntime,
): Promise<Sha256Digest> {
  const prefix = "plugins/" + manifest.plugin.name;
  let paths: string[] = [];
  try {
    paths = (await runtimeGit(runtime, root, ["ls-files", "-z", "--", prefix]))
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .filter((path) => !path.endsWith(".coffee-chat-generated.json"));
  } catch {
    return digestBytes(Buffer.alloc(0));
  }
  const files = [];
  for (const path of paths.sort()) {
    files.push({
      path,
      bytes: (await readRuntimeFile(runtime, root, path)).toString("base64"),
    });
  }
  const normalized = JSON.stringify(files).replace(
    /("version"\s*:\s*")[^"]+(")/g,
    "$11.0.0$2",
  );
  return digestBytes(Buffer.from(normalized, "utf8"));
}

function outside(path: string, roots: string[]): boolean {
  const absolute = resolve(path);
  return roots.every((root) => {
    const base = resolve(root);
    return absolute !== base && !absolute.startsWith(base + "/");
  });
}

async function ensureEmptyExternalDirectory(
  path: string,
  roots: string[],
): Promise<void> {
  if (!outside(path, roots)) throw new Error("external-path-invalid");
  try {
    const status = await fsLstat(path);
    if (status.isSymbolicLink() || !status.isDirectory())
      throw new Error("output-invalid");
    const entries = await (await import("node:fs/promises")).readdir(path);
    if (entries.length > 0) throw new Error("output-not-empty");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function previewMarkdown(preview: EngineUpdatePreview): Buffer {
  return Buffer.from(
    [
      "# Coffee Chat engine update",
      "",
      "Update digest: " + preview.update_digest,
      "Current engine: " + preview.current_engine.version,
      "Target engine: " + preview.target_engine.version,
      "",
      "The update is prepared for review. No target checkout bytes were changed.",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function buildUpdateFiles(
  input: PrepareEngineUpdateInput,
  runtime: EngineUpdateRuntime,
  release: EngineReleaseManifest,
  current: EngineProvenance,
  target: EngineProvenance,
  manifestBefore: Buffer,
  lockBefore: Buffer,
  docs: MigrationDocument[],
  migrationPath: MigrationEdge[],
): Promise<{
  preview: EngineUpdatePreview;
  candidate: EngineUpdateCandidateManifest;
}> {
  let migrated = Buffer.from(manifestBefore);
  for (const [index, document] of docs.entries()) {
    const edge = migrationPath[index];
    if (edge) {
      const result = evaluateMigrationDocument(migrated, edge, document);
      migrated = Buffer.from(result[0]!.after);
    }
  }
  const nextManifest = jsonRecord(
    parseStrictJson(
      decodeCanonicalText(migrated, "coffee-chat.json"),
      "coffee-chat.json",
    ),
  );
  nextManifest.provenance = {
    ...jsonRecord(nextManifest.provenance ?? {}),
    engine: target,
  };
  let manifestAfter = stableJson(nextManifest);
  const lock = jsonRecord(
    parseStrictJson(
      decodeCanonicalText(lockBefore, ".coffee-chat/engine-lock.json"),
      ".coffee-chat/engine-lock.json",
    ),
  );
  lock.engine = target;
  lock.managed_files = release.managed_files;
  const lockAfter = stableJson(lock);
  const oldLock = jsonRecord(
    parseStrictJson(
      decodeCanonicalText(lockBefore, ".coffee-chat/engine-lock.json"),
      ".coffee-chat/engine-lock.json",
    ),
  );
  const oldFiles = new Map<
    string,
    { path: string; digest: Sha256Digest; mode: "100644" | "100755" }
  >();
  for (const raw of Array.isArray(oldLock.managed_files)
    ? oldLock.managed_files
    : []) {
    const file = jsonRecord(raw);
    if (
      typeof file.path === "string" &&
      typeof file.digest === "string" &&
      SHA256.test(file.digest) &&
      (file.mode === "100644" || file.mode === "100755")
    )
      oldFiles.set(file.path, {
        path: file.path,
        digest: file.digest as Sha256Digest,
        mode: file.mode,
      });
  }
  const newFiles = new Map<
    string,
    EngineReleaseManifest["managed_files"][number]
  >(release.managed_files.map((file) => [file.path, file]));
  const proposed: Array<{
    path: string;
    bytes: Buffer;
    mode: "100644" | "100755";
    before: Buffer | null;
  }> = [];
  const deletions: Array<{
    path: string;
    before: Buffer;
    mode: "100644" | "100755";
  }> = [];
  const conflicts: EngineUpdatePreview["conflicts"] = [];
  const addOrUpdate = async (
    path: string,
    after: Buffer,
    mode: "100644" | "100755",
    ownership: "engine" | "manifest",
  ): Promise<void> => {
    const logical = pathValue(path);
    let before: Buffer | null = null;
    let actual: { digest: Sha256Digest; mode: "100644" | "100755" } | undefined;
    try {
      const absolute = resolve(input.target_root, logical);
      const status = await runtime.lstat(absolute);
      if (status.isSymbolicLink()) {
        conflicts.push({
          path: "./" + logical,
          expected_digest: digestBytes(after),
          expected_mode: mode,
          actual: { state: "symlink" },
        });
        return;
      }
      before = await runtime.read_file(absolute);
      actual = {
        digest: digestBytes(before),
        mode: Number(status.mode) & 0o111 ? "100755" : "100644",
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (ownership === "manifest") {
      if (!before || !before.equals(after))
        proposed.push({ path: "./" + logical, bytes: after, mode, before });
      return;
    }
    const old = oldFiles.get("./" + logical);
    if (
      before &&
      old &&
      (actual!.digest !== old.digest || actual!.mode !== old.mode)
    ) {
      conflicts.push({
        path: "./" + logical,
        expected_digest: old.digest,
        expected_mode: old.mode,
        actual: { state: "file", digest: actual!.digest, mode: actual!.mode },
      });
      return;
    }
    if (before && !old) {
      conflicts.push({
        path: "./" + logical,
        expected_digest: digestBytes(after),
        expected_mode: mode,
        actual: { state: "file", digest: actual!.digest, mode: actual!.mode },
      });
      return;
    }
    if (!before || !before.equals(after))
      proposed.push({ path: "./" + logical, bytes: after, mode, before });
  };
  for (const file of release.managed_files) {
    const bytes = await readRuntimeFile(runtime, input.source_root, file.path);
    await addOrUpdate(file.path, bytes, file.mode, "engine");
  }
  for (const [path, old] of oldFiles) {
    if (newFiles.has(path)) continue;
    const logical = pathValue(path);
    try {
      const status = await runtime.lstat(resolve(input.target_root, logical));
      if (status.isSymbolicLink()) {
        conflicts.push({
          path,
          expected_digest: old.digest,
          expected_mode: old.mode,
          actual: { state: "symlink" },
        });
        continue;
      }
      const before = await runtime.read_file(
        resolve(input.target_root, logical),
      );
      const actualDigest = digestBytes(before);
      const actualMode = (Number(status.mode) & 0o111 ? "100755" : "100644") as
        | "100644"
        | "100755";
      if (actualDigest !== old.digest || actualMode !== old.mode) {
        conflicts.push({
          path,
          expected_digest: old.digest,
          expected_mode: old.mode,
          actual: { state: "file", digest: actualDigest, mode: actualMode },
        });
      } else deletions.push({ path, before, mode: old.mode });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const packageSourceChanged = proposed.some(
    (file) =>
      file.path.startsWith("./skills/") || file.path.startsWith("./method/"),
  );
  const pluginBefore = String(jsonRecord(nextManifest.plugin).version ?? "");
  const pluginAfter = packageSourceChanged
    ? nextPatchVersion(pluginBefore)
    : pluginBefore;
  if (pluginAfter !== pluginBefore) {
    nextManifest.plugin = {
      ...jsonRecord(nextManifest.plugin),
      version: pluginAfter,
    };
    manifestAfter = stableJson(nextManifest);
  }
  await addOrUpdate("./coffee-chat.json", manifestAfter, "100644", "manifest");
  await addOrUpdate(
    "./.coffee-chat/engine-lock.json",
    lockAfter,
    "100644",
    "manifest",
  );
  const sourceCommit = target.source_commit;
  const targetFingerprint = await targetFingerprintFor(
    input.target_root,
    runtime,
  );
  const sourceFingerprint = await sourceFingerprintFor(
    input.source_root,
    release,
    runtime,
    sourceCommit,
  );
  const targetSnapshot = await createSnapshot(input.target_root, "worktree");
  const targetValidation = await validateKnowledge(targetSnapshot, {
    validateIndex: false,
  });
  if (!targetValidation.graph || !isInstanceGraph(targetValidation.graph))
    throw new Error("target-instance-invalid");
  let contentLicense: Uint8Array = Buffer.alloc(0);
  try {
    contentLicense = await readRuntimeFile(
      runtime,
      input.target_root,
      "CONTENT_LICENSE.md",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const semantics = {
    ...extractKnowledgeSemantics(targetValidation.graph),
    content_license_digest: digestBytes(Buffer.from(contentLicense)),
  } satisfies InstanceKnowledgeSemantics;
  const packageDigest = await packageContentDigest(
    input.target_root,
    targetValidation.graph.manifest,
    runtime,
  );
  const packageAfterDigest = packageSourceChanged
    ? digestJson(
        {
          base: packageDigest,
          changed_paths: proposed
            .filter(
              (file) =>
                file.path.startsWith("./skills/") ||
                file.path.startsWith("./method/"),
            )
            .map((file) => ({
              path: file.path,
              bytes: file.bytes.toString("base64"),
            })),
        },
        "coffee-chat-engine-package/v1",
      )
    : packageDigest;
  let setupObservation: EngineSetupObservation | undefined;
  try {
    const setupBytes = await fsReadFile(input.setup_receipt_path);
    setupObservation = setupReceiptObservation(
      parseStrictJson(
        decodeCanonicalText(setupBytes, input.setup_receipt_path),
        input.setup_receipt_path,
      ),
      sourceFingerprint,
      release.source_ref,
      input.setup_receipt_path,
    );
  } catch {
    throw new Error("setup-receipt-unavailable");
  }
  const branchName = "coffee-chat/engine-v" + release.version;
  const worktreePath = resolve(
    dirname(input.target_root),
    ".coffee-chat-engine-update-" + release.version,
  );
  const emptyHooksPath = resolve(input.out_dir, ".empty-hooks");
  const effectiveConfigDigest = digestBytes(
    Buffer.from(
      JSON.stringify({
        core_hooksPath: emptyHooksPath,
        git_config: ["GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL=/dev/null"],
        filters: "rejected",
      }),
      "utf8",
    ),
  );
  const changedPaths = [
    ...proposed.map((file) => file.path),
    ...deletions.map((file) => file.path),
  ].sort();
  const changed: EngineUpdatePreview["changed_paths"] = proposed.map(
    (file) => ({
      path: file.path,
      change: file.before ? "update" : "create",
      ownership:
        file.path === "./coffee-chat.json" ||
        file.path === "./.coffee-chat/engine-lock.json"
          ? "manifest"
          : "engine",
      ...(file.before ? { before_digest: digestBytes(file.before) } : {}),
      after_digest: digestBytes(file.bytes),
      ...(file.before ? { before_mode: "100644" as const } : {}),
      after_mode: file.mode,
    }),
  );
  changed.push(
    ...deletions.map((file) => ({
      path: file.path,
      change: "delete" as const,
      ownership: "engine" as const,
      before_digest: digestBytes(file.before),
      before_mode: file.mode,
    })),
  );
  const ledger = preservationLedger(semantics, semantics);
  const noDigestPreview = {
    schema_version: "1.0.0",
    target_fingerprint: targetFingerprint,
    source_fingerprint: sourceFingerprint,
    current_engine: current,
    target_engine: target,
    migration_path: migrationPath,
    worktree_plan: {
      branch_name: branchName,
      path: worktreePath,
      base_commit: String(targetFingerprint.base_commit),
      empty_hooks_path: emptyHooksPath,
      empty_hooks_path_digest: digestBytes(Buffer.alloc(0)),
      effective_config_digest: effectiveConfigDigest,
      worktree_argv: [
        "-c",
        "core.hooksPath=" + emptyHooksPath,
        "worktree",
        "add",
        "--no-checkout",
        "-b",
        branchName,
        worktreePath,
        String(targetFingerprint.base_commit),
      ],
      tree_materialization: "ls-tree-cat-file" as const,
      filters: "custom-filters-rejected" as const,
    },
    receipt_plan: { path: input.receipt_path },
    setup_observations: setupObservation ? [setupObservation] : [],
    validation_commands: [
      "npm ci --ignore-scripts",
      "npm run cc -- validate --snapshot worktree --format json",
      "npm run cc -- generate --check",
      "npm run cc -- check --snapshot worktree",
      "npm run typecheck",
      "npm test",
      "npm run gitleaks:scan",
    ],
    prepare_checks: [
      {
        name: "target-fingerprint",
        status: "passed" as const,
        diagnostic_codes: [],
      },
      {
        name: "source-release",
        status: "passed" as const,
        diagnostic_codes: [],
      },
      {
        name: "migration-path",
        status: docs.length ? ("passed" as const) : ("blocked" as const),
        diagnostic_codes: docs.length ? [] : ["migration-path-unknown"],
      },
      {
        name: "ownership-conflicts",
        status: conflicts.length ? ("blocked" as const) : ("passed" as const),
        diagnostic_codes: conflicts.map(() => "engine-owned-conflict"),
      },
    ],
    changed_paths: changed,
    conflicts,
    preservation: ledger,
    instance_plugin_version: {
      before: targetValidation.graph.manifest.plugin.version,
      after: pluginAfter,
      before_content_digest: packageDigest,
      after_content_digest: packageAfterDigest,
      reason: packageSourceChanged
        ? ("distributable-package-changed" as const)
        : ("unchanged-package" as const),
    },
    validation: {
      status: conflicts.length ? ("blocked" as const) : ("passed" as const),
    },
  } satisfies Omit<EngineUpdatePreview, "update_digest">;
  const proposedFiles = proposed.map((file) => ({
    candidate_path: "./files/" + pathValue(file.path),
    target_path: file.path,
    digest: digestBytes(file.bytes),
    mode: file.mode,
  }));
  const supportNames = [
    "engine-update-candidate.schema.json",
    "engine-update-preview.schema.json",
    "engine-update-receipt.schema.json",
  ] as const;
  const supportBytes = await Promise.all(
    supportNames.map(async (name) => ({
      path: `./schemas/${name}`,
      bytes: await readRuntimeFile(
        runtime,
        input.source_root,
        `schemas/${name}`,
      ),
    })),
  );
  const supportFiles = supportBytes.map((file) => ({
    path: file.path,
    digest: digestBytes(file.bytes),
  }));
  const digestFreeCandidate = {
    schema_version: "1.0.0",
    preview: noDigestPreview,
    proposed_files: proposedFiles,
    deletions: deletions.map((file) => ({
      target_path: file.path,
      before_digest: digestBytes(file.before),
      before_mode: file.mode,
    })),
    support_files: supportFiles,
  } satisfies Omit<EngineUpdateCandidateManifest, "update_digest">;
  const updateDigest = digestJson(digestFreeCandidate, UPDATE_DOMAIN);
  const preview = {
    ...noDigestPreview,
    update_digest: updateDigest,
  } as EngineUpdatePreview;
  const candidate: EngineUpdateCandidateManifest = {
    ...digestFreeCandidate,
    update_digest: updateDigest,
  };
  await ensureEmptyExternalDirectory(input.out_dir, [
    input.target_root,
    input.source_root,
  ]);
  await mkdir(resolve(input.out_dir, "files"), { recursive: true });
  await mkdir(resolve(input.out_dir, "schemas"), { recursive: true });
  for (const file of proposed) {
    await fsWriteFile(
      resolve(input.out_dir, "files", pathValue(file.path)),
      file.bytes,
    );
  }
  for (const file of supportBytes)
    await fsWriteFile(resolve(input.out_dir, pathValue(file.path)), file.bytes);
  await fsWriteFile(
    resolve(input.out_dir, "candidate-manifest.json"),
    stableJson(candidate),
  );
  await fsWriteFile(
    resolve(input.out_dir, "preview.json"),
    stableJson(preview),
  );
  await fsWriteFile(
    resolve(input.out_dir, "preview.md"),
    previewMarkdown(preview),
  );
  return { preview, candidate };
}

export async function prepareEngineUpdate(
  input: PrepareEngineUpdateInput,
  runtime: EngineUpdateRuntime,
): Promise<EngineUpdatePreview> {
  await ensureEmptyExternalDirectory(input.out_dir, [
    input.target_root,
    input.source_root,
  ]);
  await assertNewReceiptPath(input.receipt_path, [
    input.target_root,
    input.source_root,
    input.out_dir,
  ]);
  const inspected = await inspectEngineUpdate(
    { target_root: input.target_root, source_root: input.source_root },
    {
      read_file: runtime.read_file,
      lstat: runtime.lstat,
      run_git_readonly: async (cwd, args) =>
        (await runtimeGit(runtime, cwd, args)).toString("utf8"),
    },
  );
  if (inspected.status !== "update_available")
    throw new Error(
      inspected.status === "unknown"
        ? inspected.reason_code
        : "engine-update-incompatible",
    );
  const releaseBytes = await readRuntimeFile(
    runtime,
    input.source_root,
    "engine/release.json",
  );
  const release = strictJson(
    releaseBytes,
    "engine/release.json",
  ) as EngineReleaseManifest;
  const manifestBefore = await readRuntimeFile(
    runtime,
    input.target_root,
    "coffee-chat.json",
  );
  const lockBefore = await readRuntimeFile(
    runtime,
    input.target_root,
    ".coffee-chat/engine-lock.json",
  );
  return (
    await buildUpdateFiles(
      input,
      runtime,
      release,
      inspected.current,
      inspected.target,
      manifestBefore,
      lockBefore,
      inspected.documents,
      inspected.migration_path,
    )
  ).preview;
}

async function writeReceipt(
  path: string,
  receipt: EngineUpdateReceipt,
): Promise<void> {
  if (!outside(path, [])) throw new Error("receipt-path-invalid");
  await mkdir(dirname(path), { recursive: true });
  try {
    const status = await fsLstat(path);
    if (status.isSymbolicLink() || !status.isFile())
      throw new Error("receipt-path-invalid");
    throw new Error("receipt-already-exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = `${path}.tmp-${receipt.update_digest.slice(-16)}`;
  await fsWriteFile(temporary, stableJson(receipt), { flag: "wx" });
  try {
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function readCandidateFile(
  runtime: EngineUpdateRuntime,
  directory: string,
  path: string,
): Promise<Buffer> {
  const logical = pathValue(path);
  const root = await realpath(directory);
  const target = resolve(root, logical);
  if (target !== root && !target.startsWith(`${root}/`))
    throw new Error("candidate-path-escape");
  const status = await fsLstat(target);
  if (status.isSymbolicLink() || !status.isFile())
    throw new Error("candidate-file-invalid");
  return runtime.read_file(target);
}

async function loadCandidate(
  input: ApplyEngineUpdateInput,
  runtime: EngineUpdateRuntime,
): Promise<EngineUpdateCandidateManifest> {
  const bytes = await readCandidateFile(
    runtime,
    input.candidate_dir,
    "candidate-manifest.json",
  );
  const value = jsonRecord(
    parseStrictJson(
      decodeCanonicalText(bytes, "candidate-manifest.json"),
      "candidate-manifest.json",
    ),
  ) as unknown as EngineUpdateCandidateManifest;
  const topKeys = Object.keys(value).sort().join("\0");
  if (
    topKeys !==
      "deletions\0preview\0proposed_files\0schema_version\0support_files\0update_digest" ||
    value.schema_version !== "1.0.0" ||
    !SHA256.test(value.update_digest) ||
    value.update_digest !== input.approval_digest
  )
    throw new Error("candidate-digest-mismatch");
  const digestInput = { ...value, update_digest: undefined };
  delete (digestInput as unknown as Record<string, unknown>).update_digest;
  if (digestJson(digestInput, UPDATE_DOMAIN) !== value.update_digest)
    throw new Error("candidate-digest-mismatch");
  if (
    !value.preview ||
    Object.prototype.hasOwnProperty.call(value.preview, "update_digest") ||
    value.preview.receipt_plan.path !== input.receipt_path
  )
    throw new Error("receipt-path-mismatch");
  const renderedPreview = {
    ...value.preview,
    update_digest: value.update_digest,
  };
  const previewBytes = await readCandidateFile(
    runtime,
    input.candidate_dir,
    "preview.json",
  );
  if (!previewBytes.equals(stableJson(renderedPreview)))
    throw new Error("preview-digest-mismatch");
  const previewMarkdownBytes = await readCandidateFile(
    runtime,
    input.candidate_dir,
    "preview.md",
  );
  if (!previewMarkdownBytes.equals(previewMarkdown(renderedPreview)))
    throw new Error("preview-markdown-mismatch");
  for (const file of value.proposed_files) {
    if (
      typeof file.candidate_path !== "string" ||
      !file.candidate_path.startsWith("./files/") ||
      typeof file.target_path !== "string" ||
      !file.target_path.startsWith("./") ||
      !SHA256.test(file.digest) ||
      (file.mode !== "100644" && file.mode !== "100755")
    )
      throw new Error("candidate-file-invalid");
    const fileBytes = await readCandidateFile(
      runtime,
      input.candidate_dir,
      file.candidate_path,
    );
    if (digestBytes(fileBytes) !== file.digest)
      throw new Error("candidate-file-digest-mismatch");
  }
  for (const file of value.support_files) {
    const fileBytes = await readCandidateFile(
      runtime,
      input.candidate_dir,
      file.path,
    );
    if (digestBytes(fileBytes) !== file.digest)
      throw new Error("candidate-support-file-digest-mismatch");
  }
  return value;
}

export function createEngineUpdateRuntime(): EngineUpdateRuntime {
  const exec = promisify(execFile);
  return {
    read_file: async (path) => fsReadFile(path),
    lstat: async (path) => {
      const value = await fsLstat(path);
      return value as unknown as { mode: bigint; isSymbolicLink(): boolean };
    },
    run_git_readonly: async (cwd, args) =>
      (await exec("git", args, { cwd, encoding: "utf8" })).stdout,
    run_git: async ({ cwd, args, env }) => {
      try {
        const result = await exec("git", args, {
          cwd,
          encoding: "buffer",
          env: { ...process.env, ...(env ?? {}) },
        });
        return {
          exit_code: 0,
          stdout: Buffer.from(result.stdout),
          stderr: Buffer.from(result.stderr),
        };
      } catch (error) {
        const result = error as {
          code?: number;
          stdout?: Buffer;
          stderr?: Buffer;
        };
        return {
          exit_code: typeof result.code === "number" ? result.code : 2,
          stdout: Buffer.from(result.stdout ?? Buffer.alloc(0)),
          stderr: Buffer.from(result.stderr ?? Buffer.alloc(0)),
        };
      }
    },
    run_command: async (cwd, argv) => {
      try {
        const result = await exec(argv[0]!, argv.slice(1), {
          cwd,
          encoding: "buffer",
        });
        return {
          exit_code: 0,
          stdout: Buffer.from(result.stdout),
          stderr: Buffer.from(result.stderr),
        };
      } catch (error) {
        const result = error as {
          code?: number;
          stdout?: Buffer;
          stderr?: Buffer;
        };
        return {
          exit_code: typeof result.code === "number" ? result.code : 2,
          stdout: Buffer.from(result.stdout ?? Buffer.alloc(0)),
          stderr: Buffer.from(result.stderr ?? Buffer.alloc(0)),
        };
      }
    },
    now: () => new Date(),
  };
}

async function targetKnowledgeSemantics(
  root: string,
  runtime: EngineUpdateRuntime,
): Promise<InstanceKnowledgeSemantics> {
  const snapshot = await createSnapshot(root, "worktree");
  const validation = await validateKnowledge(snapshot, {
    validateIndex: false,
  });
  if (!validation.graph || !isInstanceGraph(validation.graph))
    throw new Error("target-instance-invalid");
  let license: Uint8Array = Buffer.alloc(0);
  try {
    license = await readRuntimeFile(runtime, root, "CONTENT_LICENSE.md");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return {
    ...extractKnowledgeSemantics(validation.graph),
    content_license_digest: digestBytes(Buffer.from(license)),
  };
}

function semanticDigest(value: InstanceKnowledgeSemantics): Sha256Digest {
  return digestBytes(Buffer.from(canonicalizeJson(value as never), "utf8"));
}

async function verifySourceAtApply(
  preview: Omit<EngineUpdatePreview, "update_digest">,
  runtime: EngineUpdateRuntime,
): Promise<void> {
  const sourceRoot = await realpath(preview.source_fingerprint.real_path);
  if (sourceRoot !== preview.source_fingerprint.real_path)
    throw new Error("source-path-drift");
  const release = strictJson(
    await readRuntimeFile(runtime, sourceRoot, "engine/release.json"),
    "engine/release.json",
  );
  if (!validRelease(release)) throw new Error("source-release-invalid");
  const verifiedRelease = await verifyRelease(sourceRoot, runtime);
  if (
    !verifiedRelease ||
    JSON.stringify(verifiedRelease) !== JSON.stringify(release)
  )
    throw new Error("source-release-drift");
  const sourceCommit = await runtimeGitText(runtime, sourceRoot, [
    "rev-parse",
    release.source_ref,
  ]);
  if (sourceCommit !== preview.target_engine.source_commit)
    throw new Error("source-commit-drift");
  const sourceFingerprint = await sourceFingerprintFor(
    sourceRoot,
    release,
    runtime,
    sourceCommit,
  );
  if (
    JSON.stringify(sourceFingerprint) !==
    JSON.stringify(preview.source_fingerprint)
  )
    throw new Error("source-fingerprint-drift");
  for (const edge of preview.migration_path) {
    const bytes = await readRuntimeFile(runtime, sourceRoot, edge.document);
    if (digestBytes(bytes) !== edge.document_digest)
      throw new Error("migration-document-drift");
    const document = asDocument(strictJson(bytes, edge.document));
    if (!document || document.id !== edge.id)
      throw new Error("migration-document-invalid");
  }
}

async function verifyTargetPreimages(
  targetRoot: string,
  preview: Omit<EngineUpdatePreview, "update_digest">,
  runtime: EngineUpdateRuntime,
): Promise<void> {
  for (const change of preview.changed_paths) {
    const target = resolve(targetRoot, pathValue(change.path));
    try {
      const status = await runtime.lstat(target);
      if (status.isSymbolicLink()) throw new Error("target-preimage-symlink");
      const before = await runtime.read_file(target);
      const digest = digestBytes(before);
      const mode = (Number(status.mode) & 0o111 ? "100755" : "100644") as
        | "100644"
        | "100755";
      if (change.change === "create" || change.before_digest !== digest)
        throw new Error("target-preimage-drift");
      if (change.before_mode && change.before_mode !== mode)
        throw new Error("target-preimage-mode-drift");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        if (change.change !== "create")
          throw new Error("target-preimage-missing");
        continue;
      }
      throw error;
    }
  }
}

async function assertNewReceiptPath(
  receiptPath: string,
  roots: string[],
): Promise<void> {
  if (!outside(receiptPath, roots)) throw new Error("receipt-path-invalid");
  try {
    const status = await fsLstat(receiptPath);
    if (status.isSymbolicLink() || status.isFile())
      throw new Error("receipt-already-exists");
    throw new Error("receipt-path-invalid");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function applyEngineUpdate(
  input: ApplyEngineUpdateInput,
  runtime: EngineUpdateRuntime = createEngineUpdateRuntime(),
): Promise<EngineUpdateReceipt> {
  const candidate = await loadCandidate(input, runtime);
  const preview = candidate.preview;
  const common: EngineUpdateReceiptCommon = {
    schema_version: "1.0.0",
    update_digest: candidate.update_digest,
    base_commit: preview.worktree_plan.base_commit,
    current_engine: preview.current_engine,
    target_engine: preview.target_engine,
    source_fingerprint: preview.source_fingerprint,
    migration_edge_ids: preview.migration_path.map((edge) => edge.id),
    changed_paths: preview.changed_paths.map((change) => change.path),
    preservation: preview.preservation,
    command_results: [],
  };
  const worktreePath = preview.worktree_plan.path;
  const branch = preview.worktree_plan.branch_name;
  const sourceRoot = preview.source_fingerprint.real_path;
  await assertNewReceiptPath(input.receipt_path, [
    input.target_root,
    input.candidate_dir,
    sourceRoot,
    worktreePath,
  ]);
  const env = { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
  const created: string[] = [];
  try {
    await verifySourceAtApply(preview, runtime);
    const targetFingerprint = await targetFingerprintFor(
      input.target_root,
      runtime,
    );
    if (
      JSON.stringify(targetFingerprint) !==
      JSON.stringify(preview.target_fingerprint)
    )
      throw new Error("target-fingerprint-drift");
    const currentSemantics = await targetKnowledgeSemantics(
      input.target_root,
      runtime,
    );
    if (
      semanticDigest(currentSemantics) !==
      preview.preservation.before_semantic_digest
    )
      throw new Error("knowledge-semantics-drift");
    await verifyTargetPreimages(input.target_root, preview, runtime);
    const targetManifest = jsonRecord(
      strictJson(
        await readRuntimeFile(runtime, input.target_root, "coffee-chat.json"),
        "coffee-chat.json",
      ),
    );
    const targetPlugin = jsonRecord(targetManifest.plugin);
    if (
      String(targetPlugin.version ?? "") !==
      preview.instance_plugin_version.before
    )
      throw new Error("plugin-version-drift");
    await ensureEmptyExternalDirectory(preview.worktree_plan.empty_hooks_path, [
      input.target_root,
      input.candidate_dir,
      sourceRoot,
      worktreePath,
    ]);
    await mkdir(preview.worktree_plan.empty_hooks_path, { recursive: true });
    try {
      const destination = await fsLstat(worktreePath);
      if (destination.isSymbolicLink())
        throw new Error("worktree-path-invalid");
      throw new Error("worktree-path-exists");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const branchCheck = await runtime.run_git({
      cwd: input.target_root,
      args: ["show-ref", "--verify", "--quiet", "refs/heads/" + branch],
      env,
    });
    if (branchCheck.exit_code === 0) throw new Error("branch-exists");
    const worktree = await runtime.run_git({
      cwd: input.target_root,
      args: [
        "-c",
        "core.hooksPath=" + preview.worktree_plan.empty_hooks_path,
        "worktree",
        "add",
        "--no-checkout",
        "-b",
        branch,
        worktreePath,
        preview.worktree_plan.base_commit,
      ],
      env,
    });
    if (worktree.exit_code !== 0) throw new Error("worktree-create-failed");
    created.push("branch-created", "worktree-created");
    await mkdir(worktreePath, { recursive: true });
    const treeEntries = (
      await runtimeGit(runtime, input.target_root, [
        "ls-tree",
        "-r",
        "-z",
        preview.worktree_plan.base_commit,
      ])
    )
      .toString("utf8")
      .split("\0")
      .filter(Boolean);
    for (const entry of treeEntries) {
      const match = /^(\d{6}) (blob|commit|tree) ([0-9a-f]+)\t(.+)$/.exec(
        entry,
      );
      if (!match) throw new Error("base-tree-invalid");
      const mode = match[1]!;
      const kind = match[2]!;
      const object = match[3]!;
      const path = match[4]!;
      if (kind !== "blob" || (mode !== "100644" && mode !== "100755"))
        throw new Error("base-tree-special-entry");
      const target = resolve(worktreePath, pathValue("./" + path));
      await mkdir(dirname(target), { recursive: true });
      await fsWriteFile(
        target,
        await runtimeGit(runtime, input.target_root, [
          "cat-file",
          "blob",
          object,
        ]),
        { mode: mode === "100755" ? 0o755 : 0o644 },
      );
    }
    const operations = [];
    for (const file of candidate.proposed_files) {
      const target = resolve(worktreePath, pathValue(file.target_path));
      let before: Buffer | null = null;
      try {
        before = await fsReadFile(target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      operations.push({
        path: file.target_path,
        before,
        after: await readCandidateFile(
          runtime,
          input.candidate_dir,
          file.candidate_path,
        ),
        mode: file.mode,
      });
    }
    for (const deletion of candidate.deletions) {
      const target = resolve(worktreePath, pathValue(deletion.target_path));
      operations.push({
        path: deletion.target_path,
        before: await fsReadFile(target),
        after: null,
        mode: deletion.before_mode,
      });
    }
    const transaction = await applyAtomicFileTransaction({
      root: worktreePath,
      journal_root: dirname(worktreePath),
      operations,
      checkpoint: async () => undefined,
    });
    if (transaction.status !== "applied")
      throw new Error("engine-update-transaction-failed");
    created.push("files-applied");
    const postSnapshot = await createSnapshot(worktreePath, "worktree");
    const postValidation = await validateKnowledge(postSnapshot, {
      validateIndex: false,
    });
    if (!postValidation.graph || postValidation.diagnostics.length > 0)
      throw new Error("engine-update-knowledge-invalid");
    await writeGeneratedProjections(
      worktreePath,
      postSnapshot,
      postValidation.graph,
    );
    const commandResults: EngineUpdateCommandResult[] = [];
    for (const command of preview.validation_commands) {
      const argv = command.split(" ");
      const result = await runtime.run_command(worktreePath, argv);
      commandResults.push(runtimeResult(result, argv));
      if (result.exit_code !== 0)
        throw new Error("engine-update-validation-failed");
    }
    const virtualIndex = resolve(
      dirname(worktreePath),
      ".coffee-chat-result-index-" + candidate.update_digest.slice(-16),
    );
    const virtualEnv = {
      ...env,
      GIT_INDEX_FILE: virtualIndex,
    };
    const readTree = await runtime.run_git({
      cwd: worktreePath,
      args: ["read-tree", preview.worktree_plan.base_commit],
      env: virtualEnv,
    });
    if (readTree.exit_code !== 0) throw new Error("result-index-failed");
    const stage = await runtime.run_git({
      cwd: worktreePath,
      args: ["add", "-A"],
      env: virtualEnv,
    });
    if (stage.exit_code !== 0) throw new Error("result-index-failed");
    const treeResult = await runtime.run_git({
      cwd: worktreePath,
      args: ["write-tree"],
      env: virtualEnv,
    });
    if (treeResult.exit_code !== 0) throw new Error("result-index-failed");
    const tree = treeResult.stdout.toString("utf8").trim();
    const inventoryResult = await runtime.run_git({
      cwd: worktreePath,
      args: ["ls-files", "--stage", "-z"],
      env: virtualEnv,
    });
    if (inventoryResult.exit_code !== 0) throw new Error("result-index-failed");
    const inventory = inventoryResult.stdout;
    const baseTree = await runtimeGitText(runtime, input.target_root, [
      "rev-parse",
      preview.worktree_plan.base_commit + "^{tree}",
    ]);
    const status = await runtimeGit(runtime, worktreePath, [
      "diff",
      "--binary",
      "--no-ext-diff",
    ]);
    const receipt: AppliedEngineUpdateReceipt = {
      ...common,
      status: "applied",
      branch_name: branch,
      worktree_path: worktreePath,
      command_results: commandResults,
      result_tree: {
        git_tree_sha: tree,
        inventory_digest: digestBytes(inventory),
        base_index_tree_sha: baseTree,
        unstaged_diff_digest: digestBytes(status),
        changed_paths: common.changed_paths,
      },
    };
    await rm(virtualIndex, { force: true });
    await writeReceipt(input.receipt_path, receipt);
    return receipt;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "update-failed";
    const receipt: EngineUpdateReceipt = created.length
      ? {
          ...common,
          status: "partial_apply_result",
          ...(created.includes("branch-created")
            ? { branch_name: branch }
            : {}),
          ...(created.includes("worktree-created")
            ? { worktree_path: worktreePath }
            : {}),
          completed_steps: created as Array<
            "branch-created" | "worktree-created" | "files-applied"
          >,
          recovery: [
            "Review the isolated worktree and remove the branch only after inspection.",
            `Recovery reason: ${reason}`,
          ],
        }
      : {
          ...common,
          status: "invalidated",
          reason_codes: [reason],
          completed_steps: [],
        };
    try {
      await writeReceipt(input.receipt_path, receipt);
    } catch {
      // Receipt creation itself is best effort after an execution failure.
    }
    return receipt;
  }
}
