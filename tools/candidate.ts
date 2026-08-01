import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Dirent, Stats } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, posix, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import type { FormatsPlugin } from "ajv-formats";
import {
  UnableToComplete,
  ValidationFailure,
  type Diagnostic,
} from "./contracts.ts";
import {
  canonicalizeJson,
  checkGeneratedIndex,
  compareCodePoints,
  generatedIndexBytes,
} from "./generate.ts";
import {
  checkGeneratedProjections,
  generatedProjectionStatePaths,
  hasDeliveryProjectionInputs,
  inspectGeneratedProjections,
  writeGeneratedProjections,
} from "./projections.ts";
import {
  inspectHook,
  installHook,
  type GitExecutor,
  type HookInspection,
  type ProcessExecutor,
} from "./hooks.ts";
import {
  type Citation,
  type Entity,
  type KnowledgeGraph,
  type LoadedNote,
  type Manifest,
  type NoteFrontmatter,
  sha256,
  validateKnowledge,
} from "./knowledge.ts";
import { createSnapshot } from "./snapshot.ts";
import { decodeCanonicalText, parseStrictJson } from "./strict-input.ts";

const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats").default as FormatsPlugin;
const execFileAsync = promisify(execFile);
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const CANDIDATE_FORMAT_VERSION = "1.0.0";

type ProfileValue = {
  display_name: string;
  repository: { url: string; default_branch: string };
  pages_url: string;
  plugin: { name: string; version: string; description: string };
};

type EntityValue = Omit<Entity, "id">;
type SourceObservationInput = Citation & {
  retrieval_status: "succeeded" | "unavailable";
  access_limitation?: string;
};
type NoteValue = {
  title: string;
  temporal_coverage: string;
  sources: SourceObservationInput[];
  entity_refs: string[];
  body: string;
  public_content_warnings?: string[];
};
type EntityChange =
  | { action: "create"; temporary_key: string; value: EntityValue }
  | { action: "update"; target_id: string; value: EntityValue }
  | {
      action: "retire";
      target_id: string;
      note_remaps: Array<{ target_id: string; entity_refs: string[] }>;
    };
type NoteChange =
  | { action: "create"; temporary_key: string; value: NoteValue }
  | { action: "correct"; target_id: string; value: NoteValue };
type CandidateRequest = {
  schema_version: string;
  mode: "make-mine" | "contribute" | "update";
  profile?: { temporary_key: string; value: ProfileValue };
  entity_changes: EntityChange[];
  note_changes: NoteChange[];
  setup_effects: Array<"install-pre-commit">;
};

export type PathDigest = { path: string; digest: string };
type SourceObservation = SourceObservationInput & { note_id: string };
type RepositoryIdentity = {
  top_level: string;
  git_common_dir: string;
  branch: string;
};
type WorktreeBinding = {
  paths: string[];
  fingerprint: string;
  changes: string[];
};
type SetupBinding = {
  effect: "install-pre-commit";
  target_path: string;
  target_fingerprint: HookInspection;
};
type CanonicalDiff = {
  path: string;
  change: "create" | "update" | "delete";
  before_digest?: string;
  after_digest?: string;
};
type MaterializedEntityChange =
  | { action: "create"; id: string; value: EntityValue }
  | { action: "update"; target_id: string; value: EntityValue }
  | {
      action: "retire";
      target_id: string;
      note_remaps: Array<{ target_id: string; entity_ids: string[] }>;
    };
type MaterializedNoteChange = {
  action: "create" | "correct";
  id: string;
  value: NoteFrontmatter & { body: string };
};
type PreviewNote = NoteFrontmatter & {
  body: string;
  entities: string[];
  change?: "create" | "correct" | "unchanged";
};
type PreviewEntity = Entity & {
  change?: "create" | "update" | "retire" | "unchanged";
};
type PreviewData = {
  candidate_directory: ".";
  mode: CandidateRequest["mode"];
  base_commit: string;
  time_zone: string;
  frozen_date: string;
  affected_paths: string[];
  output_hashes: PathDigest[];
  knowledge_digest: string;
  canonical_diff: CanonicalDiff[];
  worktree: { fingerprint: string; changes: string[] };
  notes: PreviewNote[];
  entities: PreviewEntity[];
  source_observations: SourceObservation[];
  setup_effects: SetupBinding[];
  unresolved_source_limitations: string[];
  privacy_warnings: string[];
  validation: { status: "passed" };
};

export type CandidateManifest = {
  schema_version: "1.0.0";
  candidate_format_version: "1.0.0";
  candidate_digest: string;
  request_binding: { path: string; digest: string };
  mode: CandidateRequest["mode"];
  base_commit: string;
  repository_identity: RepositoryIdentity;
  time_zone: string;
  frozen_date: string;
  canonical_inputs: PathDigest[];
  implementation_inputs: PathDigest[];
  support_files: PathDigest[];
  worktree: WorktreeBinding;
  source_observations: SourceObservation[];
  materialized_changes: {
    profile?: { id: string; value: ProfileValue };
    entity_changes: MaterializedEntityChange[];
    note_changes: MaterializedNoteChange[];
  };
  setup_effects: SetupBinding[];
  outputs: PathDigest[];
  deletions: string[];
  changed_paths: string[];
  knowledge_digest: string;
  validation: { status: "passed" };
  preview: PreviewData;
};

export type CandidateReceipt = {
  schema_version: "1.0.0";
  candidate_digest: string;
  status: "applied" | "partial_local_result" | "approval_invalidated";
  changed_paths: string[];
  validation: { status: "passed" | "not_run" };
  invalidation_code?: string;
  setup_effects?: Array<{
    effect: "install-pre-commit";
    target_path: string;
    status: "applied" | "failed";
  }>;
  setup_failure?: string;
};

export type MutationPoint =
  | "before-candidate-root-create"
  | "before-candidate-write"
  | "before-candidate-manifest-read"
  | "before-candidate-inventory"
  | "before-candidate-transaction"
  | "temp-write"
  | "temp-fsync"
  | "backup"
  | "backup-fsync"
  | "mode"
  | "swap"
  | "delete"
  | "directory-fsync"
  | "final-verification"
  | "before-applied-validation"
  | "rollback-verification";

type CandidateFileHandle = {
  writeFile(bytes: Buffer): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
};

export type CandidateFileSystem = {
  checkpoint(point: MutationPoint, path: string): Promise<void>;
  readFile(path: string): Promise<Buffer>;
  writeFile(
    path: string,
    bytes: string | Buffer,
    options?: { mode?: number; flag?: string },
  ): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<unknown>;
  readdir(
    path: string,
    options: { withFileTypes: true },
  ): Promise<Dirent<string>[]>;
  lstat(path: string): Promise<Stats>;
  realpath(path: string): Promise<string>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  rm(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
  open(
    path: string,
    flags: string,
    mode?: number,
  ): Promise<CandidateFileHandle>;
};

export const nodeFileSystem: CandidateFileSystem = {
  checkpoint: async () => undefined,
  readFile,
  writeFile: async (path, bytes, options) => writeFile(path, bytes, options),
  mkdir,
  readdir,
  lstat,
  realpath,
  rename,
  unlink,
  rm,
  chmod,
  open: async (path, flags, mode) => open(path, flags, mode),
};

export type CandidateDependencies = {
  clock?: { now(): Date };
  uuid?: { next(): string };
  fileSystem?: CandidateFileSystem;
  git?: GitExecutor;
  process?: ProcessExecutor;
  preflight?: {
    checkpoint(point: "before-shared-validation"): Promise<void>;
  };
};

type RequiredDependencies = {
  clock: { now(): Date };
  uuid: { next(): string };
  fileSystem: CandidateFileSystem;
  git: GitExecutor;
  process?: ProcessExecutor;
  preflight: {
    checkpoint(point: "before-shared-validation"): Promise<void>;
  };
};

export class CandidateTransactionFailure extends UnableToComplete {
  readonly rollbackVerified: boolean;

  constructor(diagnostic: Diagnostic, rollbackVerified: boolean) {
    super(diagnostic);
    this.rollbackVerified = rollbackVerified;
  }
}

const defaultGit: GitExecutor = {
  async execute(root, args) {
    try {
      const result = await execFileAsync("git", args, {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      });
      return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      const result = error as {
        code?: number;
        stdout?: string;
        stderr?: string;
      };
      return {
        exitCode: typeof result.code === "number" ? result.code : 2,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
      };
    }
  },
};

function dependencies(overrides: CandidateDependencies): RequiredDependencies {
  return {
    clock: overrides.clock ?? { now: () => new Date() },
    uuid: overrides.uuid ?? { next: () => randomUUID() },
    fileSystem: overrides.fileSystem ?? nodeFileSystem,
    git: overrides.git ?? defaultGit,
    ...(overrides.process ? { process: overrides.process } : {}),
    preflight: overrides.preflight ?? { checkpoint: async () => undefined },
  };
}

function validationFailure(
  code: string,
  path: string,
  message: string,
): ValidationFailure {
  return new ValidationFailure({ code, path, message });
}

function unable(code: string, path: string, message: string): UnableToComplete {
  return new UnableToComplete({ code, path, message });
}

function repositoryPath(path: string): string {
  return path.startsWith("./") ? path : `./${path}`;
}

function logicalPath(path: string): string {
  return path.replace(/^\.\//, "");
}

function sorted<T>(values: T[], key: (value: T) => string): T[] {
  return [...values].sort((left, right) =>
    compareCodePoints(key(left), key(right)),
  );
}

function sortedStrings(values: string[]): string[] {
  return [...values].sort(compareCodePoints);
}

function pathWithin(parent: string, child: string): boolean {
  const fromParent = relative(parent, child);
  return (
    fromParent === "" ||
    (fromParent !== ".." && !fromParent.startsWith(`..${sep}`))
  );
}

async function pathExists(
  fileSystem: CandidateFileSystem,
  path: string,
): Promise<boolean> {
  try {
    await fileSystem.lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function walkFiles(
  fileSystem: CandidateFileSystem,
  root: string,
): Promise<string[]> {
  const files: string[] = [];
  async function walk(directory: string, prefix: string): Promise<void> {
    let entries;
    try {
      entries = await fileSystem.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const path = prefix ? posix.join(prefix, entry.name) : entry.name;
      const absolute = resolve(directory, entry.name);
      if (entry.isSymbolicLink())
        throw validationFailure(
          "candidate-symlink-unsafe",
          repositoryPath(path),
          "Candidate paths must not contain symbolic links.",
        );
      if (entry.isDirectory()) await walk(absolute, path);
      else if (entry.isFile()) files.push(path);
      else
        throw validationFailure(
          "candidate-path-unsafe",
          repositoryPath(path),
          "Candidate paths must be regular files.",
        );
    }
  }
  await walk(root, "");
  return sortedStrings(files);
}

async function pathDigests(
  fileSystem: CandidateFileSystem,
  root: string,
  paths: string[],
): Promise<PathDigest[]> {
  return Promise.all(
    sortedStrings(paths).map(async (path) => ({
      path: repositoryPath(path),
      digest: sha256(await fileSystem.readFile(resolve(root, path))),
    })),
  );
}

async function schemaValidator(
  root: string,
  name: string,
): Promise<ValidateFunction> {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const path = resolve(root, "schemas", name);
  const bytes = await readFile(path);
  const text = decodeCanonicalText(bytes, `schemas/${name}`);
  return ajv.compile(parseStrictJson(text, `schemas/${name}`) as object);
}

async function parseRequest(
  root: string,
  requestPath: string,
  fileSystem: CandidateFileSystem,
): Promise<{ request: CandidateRequest; bytes: Buffer; realPath: string }> {
  let status;
  try {
    status = await fileSystem.lstat(requestPath);
    if (!status.isFile() || status.isSymbolicLink()) throw new Error("unsafe");
  } catch {
    throw unable(
      "candidate-request-unavailable",
      ".",
      "Candidate request could not be read safely.",
    );
  }
  let bytes: Buffer;
  let realPath: string;
  try {
    [bytes, realPath] = await Promise.all([
      fileSystem.readFile(requestPath),
      fileSystem.realpath(requestPath),
    ]);
  } catch {
    throw unable(
      "candidate-request-unavailable",
      ".",
      "Candidate request could not be read safely.",
    );
  }
  let value: unknown;
  try {
    value = parseStrictJson(
      decodeCanonicalText(bytes, requestPath),
      requestPath,
    );
  } catch {
    throw validationFailure(
      "candidate-request-invalid",
      ".",
      "Candidate request is not strict canonical JSON.",
    );
  }
  const validate = await schemaValidator(root, "candidate-request.schema.json");
  if (!validate(value))
    throw validationFailure(
      "candidate-request-invalid",
      ".",
      "Candidate request violates the public structured interface.",
    );
  return { request: value as CandidateRequest, bytes, realPath };
}

function validateRequestSemantics(request: CandidateRequest): void {
  if (request.entity_changes.length === 0 && request.note_changes.length === 0)
    throw validationFailure(
      "candidate-no-op",
      ".",
      "Candidate request must contain at least one canonical change.",
    );
  if (
    request.mode === "make-mine" &&
    !request.note_changes.some((change) => change.action === "create")
  )
    throw validationFailure(
      "make-mine-first-note-required",
      ".",
      "Make mine requires an approved first public Note.",
    );
  const temporaryKeys: string[] = [];
  if (request.profile) temporaryKeys.push(request.profile.temporary_key);
  for (const change of request.entity_changes)
    if (change.action === "create") temporaryKeys.push(change.temporary_key);
  for (const change of request.note_changes)
    if (change.action === "create") temporaryKeys.push(change.temporary_key);
  if (new Set(temporaryKeys).size !== temporaryKeys.length)
    throw validationFailure(
      "duplicate-temporary-key",
      ".",
      "Candidate-local temporary keys must be unique.",
    );
  const targets = [
    ...request.entity_changes
      .filter(
        (change): change is Exclude<EntityChange, { action: "create" }> =>
          change.action !== "create",
      )
      .map((change) => `entity:${change.target_id}`),
    ...request.note_changes
      .filter(
        (change): change is Extract<NoteChange, { action: "correct" }> =>
          change.action === "correct",
      )
      .map((change) => `note:${change.target_id}`),
  ];
  if (new Set(targets).size !== targets.length)
    throw validationFailure(
      "conflicting-candidate-change",
      ".",
      "A stable target may appear in only one Candidate change.",
    );
  const remappedNotes = request.entity_changes
    .filter(
      (change): change is Extract<EntityChange, { action: "retire" }> =>
        change.action === "retire",
    )
    .flatMap((change) => change.note_remaps.map((remap) => remap.target_id));
  if (new Set(remappedNotes).size !== remappedNotes.length)
    throw validationFailure(
      "conflicting-entity-retirement-remap",
      ".",
      "A Note may be remapped by only one Entity retirement in one Candidate.",
    );
  const correctedNotes = new Set(
    request.note_changes
      .filter(
        (change): change is Extract<NoteChange, { action: "correct" }> =>
          change.action === "correct",
      )
      .map((change) => change.target_id),
  );
  if (remappedNotes.some((id) => correctedNotes.has(id)))
    throw validationFailure(
      "conflicting-candidate-change",
      ".",
      "A Note correction and Entity remap cannot target the same Note in one Candidate.",
    );
  if (request.note_changes.some((change) => change.value.body.includes("\r")))
    throw validationFailure(
      "candidate-body-noncanonical",
      ".",
      "Candidate Note bodies must use LF newlines without carriage returns.",
    );
}

async function requiredGit(
  git: GitExecutor,
  root: string,
  args: string[],
  code = "candidate-git-unavailable",
): Promise<string> {
  const result = await git.execute(root, args);
  if (result.exitCode !== 0 || result.stdout.trim().length === 0)
    throw unable(
      code,
      ".",
      "Required Git repository state could not be resolved.",
    );
  return result.stdout.trim();
}

async function repositoryBinding(
  root: string,
  git: GitExecutor,
  fileSystem: CandidateFileSystem,
): Promise<{ root: string; head: string; identity: RepositoryIdentity }> {
  const [realRoot, topRaw, commonRaw, head, branch] = await Promise.all([
    fileSystem.realpath(root),
    requiredGit(git, root, ["rev-parse", "--show-toplevel"]),
    requiredGit(git, root, ["rev-parse", "--git-common-dir"]),
    requiredGit(git, root, ["rev-parse", "--verify", "HEAD^{commit}"]),
    requiredGit(git, root, ["rev-parse", "--abbrev-ref", "HEAD"]),
  ]);
  const topLevel = await fileSystem.realpath(resolve(root, topRaw));
  if (topLevel !== realRoot)
    throw unable(
      "candidate-repository-mismatch",
      ".",
      "Candidate commands must run at the authoritative repository root.",
    );
  const commonDir = await fileSystem.realpath(resolve(root, commonRaw));
  return {
    root: realRoot,
    head,
    identity: { top_level: topLevel, git_common_dir: commonDir, branch },
  };
}

type DirectoryIdentity = {
  observed_path: string;
  real_path: string;
  device: number;
  inode: number;
};

type CandidateLocationBinding = {
  requested_root: string;
  safe_root: string;
  parent: DirectoryIdentity;
  root?: DirectoryIdentity;
};

async function directoryIdentity(
  path: string,
  fileSystem: CandidateFileSystem,
): Promise<DirectoryIdentity> {
  const before = await fileSystem.lstat(path);
  if (before.isSymbolicLink() || !before.isDirectory())
    throw new Error("unsafe directory");
  const realPath = await fileSystem.realpath(path);
  const after = await fileSystem.lstat(path);
  if (
    after.isSymbolicLink() ||
    !after.isDirectory() ||
    before.dev !== after.dev ||
    before.ino !== after.ino
  )
    throw new Error("directory changed");
  return {
    observed_path: path,
    real_path: realPath,
    device: after.dev,
    inode: after.ino,
  };
}

async function sameDirectoryIdentity(
  identity: DirectoryIdentity,
  fileSystem: CandidateFileSystem,
): Promise<boolean> {
  try {
    const current = await directoryIdentity(identity.observed_path, fileSystem);
    return (
      current.real_path === identity.real_path &&
      current.device === identity.device &&
      current.inode === identity.inode
    );
  } catch {
    return false;
  }
}

async function bindExternalCandidateLocation(
  repositoryRoot: string,
  candidateRoot: string,
  fileSystem: CandidateFileSystem,
  options: { requireExisting: boolean; requireEmpty: boolean },
): Promise<CandidateLocationBinding> {
  const requestedRoot = resolve(candidateRoot);
  if (pathWithin(repositoryRoot, requestedRoot)) throw new Error("inside");
  const parent = await directoryIdentity(dirname(requestedRoot), fileSystem);
  const safeRoot = resolve(parent.real_path, basename(requestedRoot));
  if (
    pathWithin(repositoryRoot, parent.real_path) ||
    pathWithin(repositoryRoot, safeRoot)
  )
    throw new Error("inside");
  let root: DirectoryIdentity | undefined;
  try {
    root = await directoryIdentity(requestedRoot, fileSystem);
    if (
      root.real_path !== safeRoot ||
      pathWithin(repositoryRoot, root.real_path)
    )
      throw new Error("unsafe root");
    if (
      options.requireEmpty &&
      (await fileSystem.readdir(root.real_path, { withFileTypes: true }))
        .length > 0
    )
      throw new Error("nonempty");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (options.requireExisting) throw error;
  }
  return {
    requested_root: requestedRoot,
    safe_root: safeRoot,
    parent,
    ...(root ? { root } : {}),
  };
}

async function candidateLocationMatches(
  binding: CandidateLocationBinding,
  fileSystem: CandidateFileSystem,
): Promise<boolean> {
  if (!(await sameDirectoryIdentity(binding.parent, fileSystem))) return false;
  if (!binding.root) return !(await pathExists(fileSystem, binding.safe_root));
  return sameDirectoryIdentity(binding.root, fileSystem);
}

async function requireCandidateLocation(
  binding: CandidateLocationBinding,
  point: MutationPoint,
  fileSystem: CandidateFileSystem,
): Promise<void> {
  await fileSystem.checkpoint(point, binding.requested_root);
  if (!(await candidateLocationMatches(binding, fileSystem)))
    throw validationFailure(
      "candidate-output-drift",
      ".",
      "The bound external Candidate location changed during the operation.",
    );
}

async function canonicalPaths(
  root: string,
  fileSystem: CandidateFileSystem,
): Promise<string[]> {
  const files = await walkFiles(fileSystem, root);
  return files.filter(
    (path) =>
      path === "coffee-chat.json" ||
      path === "knowledge/entities.yml" ||
      path === "knowledge/index.json" ||
      /^knowledge\/notes\/[^/]+\.md$/.test(path) ||
      path.startsWith("method/"),
  );
}

async function deliveryProjectionPaths(
  snapshot: Awaited<ReturnType<typeof createSnapshot>>,
  graph: KnowledgeGraph,
): Promise<string[]> {
  if (!(await hasDeliveryProjectionInputs(snapshot))) return [];
  return generatedProjectionStatePaths(snapshot, graph);
}

async function repositoryStatePaths(
  root: string,
  graph: KnowledgeGraph,
  fileSystem: CandidateFileSystem,
): Promise<string[]> {
  const snapshot = await createSnapshot(root, "worktree");
  return sortedStrings([
    ...(await canonicalPaths(root, fileSystem)),
    ...(await deliveryProjectionPaths(snapshot, graph)),
  ]);
}

async function supportPaths(
  root: string,
  fileSystem: CandidateFileSystem,
): Promise<string[]> {
  const schemas = (await walkFiles(fileSystem, resolve(root, "schemas"))).map(
    (path) => `schemas/${path}`,
  );
  const optional = [
    "LICENSE",
    "skills/coffee-chat/SKILL.md",
    "skills/apply-perspective/SKILL.md",
    "skills/build-kg/SKILL.md",
  ];
  const found: string[] = [];
  for (const path of optional)
    if (await pathExists(fileSystem, resolve(root, path))) found.push(path);
  return sortedStrings([...schemas, ...found]);
}

async function implementationPaths(
  root: string,
  fileSystem: CandidateFileSystem,
): Promise<string[]> {
  const schemas = await supportPaths(root, fileSystem);
  const tools = (await walkFiles(fileSystem, resolve(root, "tools"))).map(
    (path) => `tools/${path}`,
  );
  return sortedStrings([...schemas, ...tools]);
}

function configuredDate(instant: Date, timeZone: string): string {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  if (!values.year || !values.month || !values.day)
    throw unable(
      "configured-date-unavailable",
      "./coffee-chat.json",
      "Configured-zone calendar date could not be produced.",
    );
  return `${values.year}-${values.month}-${values.day}`;
}

function mintIds(
  request: CandidateRequest,
  graphIds: Set<string>,
  uuid: { next(): string },
): Map<string, string> {
  const keys: string[] = [];
  if (request.profile) keys.push(request.profile.temporary_key);
  for (const change of request.entity_changes)
    if (change.action === "create") keys.push(change.temporary_key);
  for (const change of request.note_changes)
    if (change.action === "create") keys.push(change.temporary_key);
  const minted = new Map<string, string>();
  const used = new Set(graphIds);
  for (const key of keys) {
    const id = uuid.next();
    if (!UUID_V4.test(id))
      throw validationFailure(
        "invalid-generated-uuid",
        ".",
        "UUID provider must return canonical lowercase UUIDv4 values.",
      );
    if (used.has(id))
      throw validationFailure(
        "duplicate-generated-uuid",
        ".",
        "Generated UUIDs must be unique across the Candidate and base graph.",
      );
    used.add(id);
    minted.set(key, id);
  }
  return minted;
}

function resolveEntityRefs(
  refs: string[],
  minted: Map<string, string>,
  knownEntityIds: Set<string>,
): string[] {
  const resolved = refs.map((ref) => minted.get(ref) ?? ref);
  for (const id of resolved)
    if (
      !UUID_V4.test(id) ||
      (!knownEntityIds.has(id) && ![...minted.values()].includes(id))
    )
      throw validationFailure(
        "unknown-entity-reference",
        ".",
        "Candidate Entity reference does not resolve explicitly.",
      );
  return sortedStrings([...new Set(resolved)]);
}

function materializeCitation(
  source: SourceObservationInput,
  frozenDate: string,
  prior?: Citation,
): Citation {
  const accessedOn =
    source.accessed_on ??
    (prior?.url === source.url ? prior.accessed_on : undefined);
  return {
    url: source.url,
    title: source.title,
    ...(source.published_on ? { published_on: source.published_on } : {}),
    ...(accessedOn !== undefined
      ? { accessed_on: accessedOn }
      : source.retrieval_status === "succeeded"
        ? { accessed_on: frozenDate }
        : {}),
  };
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function serializeEntities(entities: Entity[]): Buffer {
  if (entities.length === 0) return Buffer.from("[]\n");
  const lines: string[] = [];
  for (const entity of sorted(entities, (value) => value.id)) {
    lines.push(`- id: ${quote(entity.id)}`, `  label: ${quote(entity.label)}`);
    if (entity.aliases !== undefined) {
      lines.push("  aliases:");
      for (const alias of entity.aliases) lines.push(`    - ${quote(alias)}`);
    }
    if (entity.kind !== undefined) lines.push(`  kind: ${quote(entity.kind)}`);
    if (entity.same_as !== undefined) {
      lines.push("  same_as:");
      for (const url of entity.same_as) lines.push(`    - ${quote(url)}`);
    }
  }
  return Buffer.from(`${lines.join("\n")}\n`);
}

function serializeNote(frontmatter: NoteFrontmatter, body: string): Buffer {
  const lines = [
    "---",
    `id: ${quote(frontmatter.id)}`,
    `title: ${quote(frontmatter.title)}`,
    `temporal_coverage: ${quote(frontmatter.temporal_coverage)}`,
    `recorded_on: ${quote(frontmatter.recorded_on)}`,
    "sources:",
  ];
  for (const source of frontmatter.sources) {
    lines.push(
      `  - url: ${quote(source.url)}`,
      `    title: ${quote(source.title)}`,
    );
    if (source.published_on !== undefined)
      lines.push(`    published_on: ${quote(source.published_on)}`);
    if (source.accessed_on !== undefined)
      lines.push(`    accessed_on: ${quote(source.accessed_on)}`);
  }
  if (frontmatter.entities !== undefined) {
    lines.push("entities:");
    for (const entity of frontmatter.entities)
      lines.push(`  - ${quote(entity)}`);
  }
  const canonicalBody = canonicalNoteBody(body);
  return Buffer.from(`${lines.join("\n")}\n---\n\n${canonicalBody}\n`);
}

function canonicalNoteBody(body: string): string {
  return body.endsWith("\n") ? body.slice(0, -1) : body;
}

function loadedCanonicalNoteBody(body: string): string {
  const withoutDelimiterNewline = body.startsWith("\n") ? body.slice(1) : body;
  return withoutDelimiterNewline.endsWith("\n")
    ? withoutDelimiterNewline.slice(0, -1)
    : withoutDelimiterNewline;
}

function manifestBytes(manifest: Manifest): Buffer {
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
}

type DesiredState = {
  manifest: Manifest;
  entities: Entity[];
  notes: LoadedNote[];
  sourceObservations: SourceObservation[];
  materializedChanges: CandidateManifest["materialized_changes"];
  changedNoteIds: Map<string, "create" | "correct">;
  changedEntityIds: Map<string, "create" | "update">;
  privacyWarnings: string[];
};

function buildDesiredState(
  request: CandidateRequest,
  baseManifest: Manifest,
  baseEntities: Entity[],
  baseNotes: LoadedNote[],
  minted: Map<string, string>,
  frozenDate: string,
): DesiredState {
  if (
    request.mode !== "make-mine" &&
    baseManifest.initialization_state !== "initialized"
  )
    throw validationFailure(
      "initialized-mode-required",
      "./coffee-chat.json",
      "Contribute and update require an initialized graph.",
    );
  const manifest = structuredClone(baseManifest);
  const materializedChanges: CandidateManifest["materialized_changes"] = {
    entity_changes: [],
    note_changes: [],
  };
  if (request.mode === "make-mine") {
    const profile = request.profile as NonNullable<CandidateRequest["profile"]>;
    const id = minted.get(profile.temporary_key) as string;
    manifest.initialization_state = "initialized";
    manifest.profile = { id, display_name: profile.value.display_name };
    manifest.repository = structuredClone(profile.value.repository);
    manifest.pages_url = profile.value.pages_url;
    manifest.plugin = structuredClone(profile.value.plugin);
    manifest.marketplace_name = `${profile.value.plugin.name}-marketplace`;
    materializedChanges.profile = { id, value: structuredClone(profile.value) };
  }

  const baseEntityById = new Map(
    baseEntities.map((entity) => [entity.id, entity]),
  );
  const knownEntityIds = new Set(baseEntities.map((entity) => entity.id));
  for (const change of request.entity_changes)
    if (change.action === "create")
      knownEntityIds.add(minted.get(change.temporary_key) as string);
  let entities =
    request.mode === "make-mine" ? [] : structuredClone(baseEntities);
  const changedEntityIds = new Map<string, "create" | "update">();
  for (const change of request.entity_changes) {
    if (change.action === "create") {
      const id = minted.get(change.temporary_key) as string;
      entities.push({ id, ...structuredClone(change.value) });
      changedEntityIds.set(id, "create");
      materializedChanges.entity_changes.push({
        action: "create",
        id,
        value: change.value,
      });
    } else if (change.action === "update") {
      const index = entities.findIndex(
        (entity) => entity.id === change.target_id,
      );
      if (index < 0)
        throw validationFailure(
          "entity-target-not-found",
          "./knowledge/entities.yml",
          "Entity update target does not exist.",
        );
      entities[index] = {
        id: change.target_id,
        ...structuredClone(change.value),
      };
      changedEntityIds.set(change.target_id, "update");
      materializedChanges.entity_changes.push({
        action: "update",
        target_id: change.target_id,
        value: change.value,
      });
    }
  }

  let notes = request.mode === "make-mine" ? [] : structuredClone(baseNotes);
  const changedNoteIds = new Map<string, "create" | "correct">();
  const sourceObservations: SourceObservation[] = [];
  const requestedPrivacyWarnings: string[] = [];
  for (const change of request.note_changes) {
    const id =
      change.action === "create"
        ? (minted.get(change.temporary_key) as string)
        : change.target_id;
    const existing = baseNotes.find((note) => note.frontmatter.id === id);
    if (change.action === "correct" && !existing)
      throw validationFailure(
        "note-target-not-found",
        `./knowledge/notes/${id}.md`,
        "Note correction target does not exist.",
      );
    const entityIds = resolveEntityRefs(
      change.value.entity_refs,
      minted,
      knownEntityIds,
    );
    const priorSources = new Map(
      existing?.frontmatter.sources.map((source) => [source.url, source]) ?? [],
    );
    const frontmatter: NoteFrontmatter = {
      id,
      title: change.value.title,
      temporal_coverage: change.value.temporal_coverage,
      recorded_on:
        change.action === "correct"
          ? (existing as LoadedNote).frontmatter.recorded_on
          : frozenDate,
      sources: change.value.sources.map((source) =>
        materializeCitation(source, frozenDate, priorSources.get(source.url)),
      ),
      ...(entityIds.length > 0 ? { entities: entityIds } : {}),
    };
    for (const source of change.value.sources) {
      sourceObservations.push({
        note_id: id,
        url: source.url,
        title: source.title,
        ...(source.published_on ? { published_on: source.published_on } : {}),
        ...(source.retrieval_status === "succeeded"
          ? {
              accessed_on:
                source.accessed_on ??
                priorSources.get(source.url)?.accessed_on ??
                frozenDate,
            }
          : {}),
        retrieval_status: source.retrieval_status,
        ...(source.access_limitation
          ? { access_limitation: source.access_limitation }
          : {}),
      });
    }
    const note: LoadedNote = {
      path: `knowledge/notes/${id}.md`,
      bytes: serializeNote(frontmatter, change.value.body),
      frontmatter,
      body: canonicalNoteBody(change.value.body),
      noteLinks: [],
    };
    if (change.action === "correct") {
      const index = notes.findIndex((item) => item.frontmatter.id === id);
      notes[index] = note;
    } else notes.push(note);
    changedNoteIds.set(id, change.action);
    requestedPrivacyWarnings.push(
      ...(change.value.public_content_warnings ?? []),
    );
    materializedChanges.note_changes.push({
      action: change.action,
      id,
      value: {
        ...frontmatter,
        body: note.body,
      },
    });
  }

  for (const change of request.entity_changes) {
    if (change.action !== "retire") continue;
    if (!baseEntityById.has(change.target_id))
      throw validationFailure(
        "entity-target-not-found",
        "./knowledge/entities.yml",
        "Entity retirement target does not exist.",
      );
    const affected = baseNotes
      .filter((note) => note.frontmatter.entities?.includes(change.target_id))
      .map((note) => note.frontmatter.id)
      .sort(compareCodePoints);
    const supplied = change.note_remaps
      .map((remap) => remap.target_id)
      .sort(compareCodePoints);
    if (
      new Set(supplied).size !== supplied.length ||
      canonicalizeJson(affected as never) !==
        canonicalizeJson(supplied as never)
    )
      throw validationFailure(
        "incomplete-entity-retirement-remap",
        "./knowledge/entities.yml",
        "Entity retirement must explicitly remap every affected Note exactly once.",
      );
    for (const remap of change.note_remaps) {
      const note = notes.find(
        (item) => item.frontmatter.id === remap.target_id,
      );
      if (!note)
        throw validationFailure(
          "note-target-not-found",
          `./knowledge/notes/${remap.target_id}.md`,
          "Entity remap target Note does not exist.",
        );
      const entityIds = resolveEntityRefs(
        remap.entity_refs,
        minted,
        knownEntityIds,
      );
      note.frontmatter = {
        ...note.frontmatter,
        ...(entityIds.length > 0
          ? { entities: entityIds }
          : { entities: undefined }),
      };
      if (note.frontmatter.entities === undefined)
        delete note.frontmatter.entities;
      note.bytes = serializeNote(note.frontmatter, note.body);
    }
    if (
      notes.some((note) =>
        note.frontmatter.entities?.includes(change.target_id),
      )
    )
      throw validationFailure(
        "dangling-entity-retirement",
        "./knowledge/entities.yml",
        "Retired Entity remains referenced by a Note.",
      );
    entities = entities.filter((entity) => entity.id !== change.target_id);
    materializedChanges.entity_changes.push({
      action: "retire",
      target_id: change.target_id,
      note_remaps: change.note_remaps.map((remap) => ({
        target_id: remap.target_id,
        entity_ids: resolveEntityRefs(
          remap.entity_refs,
          minted,
          knownEntityIds,
        ),
      })),
    });
  }

  if (request.mode === "make-mine") {
    const required = new Set(
      notes.flatMap((note) => note.frontmatter.entities ?? []),
    );
    for (const id of required) {
      if (!entities.some((entity) => entity.id === id)) {
        const existing = baseEntityById.get(id);
        if (existing) entities.push(structuredClone(existing));
      }
    }
    entities = entities.filter((entity) => required.has(entity.id));
  }
  entities = sorted(entities, (entity) => entity.id);
  notes = sorted(notes, (note) => note.frontmatter.id);
  return {
    manifest,
    entities,
    notes,
    sourceObservations: sorted(
      sourceObservations,
      (source) => `${source.note_id}\u0000${source.url}`,
    ),
    materializedChanges,
    changedNoteIds,
    changedEntityIds,
    privacyWarnings: [...new Set(requestedPrivacyWarnings)],
  };
}

async function writeMaterializedRepository(
  candidateRepository: string,
  root: string,
  state: DesiredState,
  currentCanonical: string[],
  support: string[],
  fileSystem: CandidateFileSystem,
): Promise<void> {
  await fileSystem.mkdir(candidateRepository, { recursive: true });
  for (const path of support) {
    const target = resolve(candidateRepository, path);
    await fileSystem.mkdir(dirname(target), { recursive: true });
    await fileSystem.writeFile(
      target,
      await fileSystem.readFile(resolve(root, path)),
    );
  }
  for (const path of currentCanonical.filter((path) =>
    path.startsWith("method/"),
  )) {
    const target = resolve(candidateRepository, path);
    await fileSystem.mkdir(dirname(target), { recursive: true });
    await fileSystem.writeFile(
      target,
      await fileSystem.readFile(resolve(root, path)),
    );
  }
  await fileSystem.writeFile(
    resolve(candidateRepository, "coffee-chat.json"),
    manifestBytes(state.manifest),
  );
  await fileSystem.mkdir(resolve(candidateRepository, "knowledge/notes"), {
    recursive: true,
  });
  await fileSystem.writeFile(
    resolve(candidateRepository, "knowledge/entities.yml"),
    serializeEntities(state.entities),
  );
  for (const note of state.notes)
    await fileSystem.writeFile(
      resolve(candidateRepository, note.path),
      note.bytes,
    );
}

async function worktreeBinding(
  root: string,
  paths: string[],
  git: GitExecutor,
): Promise<WorktreeBinding> {
  const normalized = sortedStrings([...new Set(paths.map(logicalPath))]);
  const result = await git.execute(root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
    "--",
    ...normalized,
  ]);
  if (result.exitCode !== 0)
    throw unable(
      "candidate-git-unavailable",
      ".",
      "Relevant worktree state could not be inspected.",
    );
  const raw = result.stdout;
  return {
    paths: normalized.map(repositoryPath),
    fingerprint: sha256(raw),
    changes: raw.split("\0").filter(Boolean),
  };
}

function previewObject(manifest: CandidateManifest): Record<string, unknown> {
  return {
    schema_version: manifest.schema_version,
    candidate_digest: manifest.candidate_digest,
    ...manifest.preview,
  };
}

function previewJsonBytes(manifest: CandidateManifest): Buffer {
  return Buffer.from(`${JSON.stringify(previewObject(manifest), null, 2)}\n`);
}

function previewMarkdownBytes(manifest: CandidateManifest): Buffer {
  const preview = manifest.preview;
  const lines = [
    "# Coffee Chat Public-content Preview",
    "",
    `Candidate digest: \`${manifest.candidate_digest}\``,
    `Base commit: \`${preview.base_commit}\``,
    `Frozen date (${preview.time_zone}): \`${preview.frozen_date}\``,
    `Knowledge digest: \`${preview.knowledge_digest}\``,
    "",
    "## Repository changes",
    "",
    ...preview.canonical_diff.map(
      (change) => `- ${change.change}: \`${change.path}\``,
    ),
    "",
    "## Public Notes",
    "",
  ];
  for (const note of preview.notes) {
    lines.push(
      `### ${note.title}`,
      "",
      `ID: \`${note.id}\`  `,
      `Coverage: \`${note.temporal_coverage}\`  `,
      `Recorded on: \`${note.recorded_on}\``,
      "",
      note.body,
      "",
      "Citations:",
      ...note.sources.map((source) => `- [${source.title}](${source.url})`),
      "",
    );
  }
  lines.push("## Entity Registry", "");
  for (const entity of preview.entities)
    lines.push(
      `- \`${entity.id}\` — ${entity.label}${entity.kind ? ` (${entity.kind})` : ""}`,
    );
  lines.push("", "## Local-only setup effects", "");
  if (preview.setup_effects.length === 0) lines.push("- None");
  else
    for (const effect of preview.setup_effects)
      lines.push(`- ${effect.effect}: \`${effect.target_path}\``);
  if (preview.unresolved_source_limitations.length > 0)
    lines.push(
      "",
      "## Unresolved Source limitations",
      "",
      ...preview.unresolved_source_limitations.map((value) => `- ${value}`),
    );
  if (preview.privacy_warnings.length > 0)
    lines.push(
      "",
      "## Privacy warnings",
      "",
      ...preview.privacy_warnings.map((value) => `- ${value}`),
    );
  return Buffer.from(`${lines.join("\n")}\n`);
}

function withoutCandidateDigest(
  manifest: CandidateManifest,
): Record<string, unknown> {
  const copy = structuredClone(manifest) as unknown as Record<string, unknown>;
  delete copy.candidate_digest;
  return copy;
}

export async function prepareCandidate(
  options: { root: string; requestPath: string; out: string },
  overrides: CandidateDependencies = {},
): Promise<{
  candidateDigest: string;
  previewJson: string;
  previewMarkdown: string;
}> {
  const deps = dependencies(overrides);
  const repository = await repositoryBinding(
    options.root,
    deps.git,
    deps.fileSystem,
  );
  let candidateLocation: CandidateLocationBinding;
  try {
    candidateLocation = await bindExternalCandidateLocation(
      repository.root,
      options.out,
      deps.fileSystem,
      { requireExisting: false, requireEmpty: true },
    );
  } catch {
    throw validationFailure(
      "candidate-output-must-be-external",
      ".",
      "Candidate output must be an empty, non-symlinked directory outside the repository.",
    );
  }
  const parsed = await parseRequest(
    repository.root,
    options.requestPath,
    deps.fileSystem,
  );
  validateRequestSemantics(parsed.request);
  const snapshot = await createSnapshot(repository.root, "worktree");
  const baseValidation = await validateKnowledge(snapshot, {
    validateIndex: false,
  });
  if (!baseValidation.graph || baseValidation.diagnostics.length > 0)
    throw validationFailure(
      "candidate-base-invalid",
      ".",
      "Existing canonical graph must pass the shared validator before preparation.",
    );
  const baseProjectionPaths = await deliveryProjectionPaths(
    snapshot,
    baseValidation.graph,
  );
  if (baseProjectionPaths.length > 0) {
    const inspection = await inspectGeneratedProjections(
      snapshot,
      baseValidation.graph,
    );
    const ownedStale = new Set(inspection.ownedStalePaths.map(repositoryPath));
    if (
      inspection.blockingDiagnostics.length > 0 ||
      inspection.diagnostics.some(
        (diagnostic) => !ownedStale.has(diagnostic.path),
      )
    )
      throw validationFailure(
        "candidate-base-invalid",
        ".",
        "Existing generated delivery projections must match canonical inputs; only marker-owned stale package files may be bound for deletion.",
      );
  }
  const graphIds = new Set([
    ...(baseValidation.graph.manifest.profile.id
      ? [baseValidation.graph.manifest.profile.id]
      : []),
    ...baseValidation.graph.entities.map((entity) => entity.id),
    ...baseValidation.graph.notes.map((note) => note.frontmatter.id),
  ]);
  const minted = mintIds(parsed.request, graphIds, deps.uuid);
  const frozenDate = configuredDate(
    deps.clock.now(),
    baseValidation.graph.manifest.time_zone,
  );
  const desired = buildDesiredState(
    parsed.request,
    baseValidation.graph.manifest,
    baseValidation.graph.entities,
    baseValidation.graph.notes,
    minted,
    frozenDate,
  );
  const currentCanonical = await canonicalPaths(
    repository.root,
    deps.fileSystem,
  );
  const currentState = sortedStrings([
    ...currentCanonical,
    ...baseProjectionPaths,
  ]);
  const support = await supportPaths(repository.root, deps.fileSystem);
  const implementation = await implementationPaths(
    repository.root,
    deps.fileSystem,
  );
  let createdOutput = false;
  try {
    if (!candidateLocation.root) {
      await requireCandidateLocation(
        candidateLocation,
        "before-candidate-root-create",
        deps.fileSystem,
      );
      await deps.fileSystem.mkdir(candidateLocation.safe_root);
      createdOutput = true;
      candidateLocation = await bindExternalCandidateLocation(
        repository.root,
        candidateLocation.safe_root,
        deps.fileSystem,
        { requireExisting: true, requireEmpty: true },
      );
    }
    await requireCandidateLocation(
      candidateLocation,
      "before-candidate-write",
      deps.fileSystem,
    );
    const candidateRoot = candidateLocation.root?.real_path as string;
    const candidateRepository = resolve(candidateRoot, "repository");
    await writeMaterializedRepository(
      candidateRepository,
      repository.root,
      desired,
      currentCanonical,
      support,
      deps.fileSystem,
    );
    let materializedSnapshot = await createSnapshot(
      candidateRepository,
      "worktree",
    );
    let materializedValidation = await validateKnowledge(materializedSnapshot, {
      validateIndex: false,
    });
    if (
      !materializedValidation.graph ||
      materializedValidation.diagnostics.length > 0
    )
      throw validationFailure(
        "candidate-validation-failed",
        ".",
        "Materialized Candidate failed the shared validator.",
      );
    const indexBytes = generatedIndexBytes(materializedValidation.graph);
    if (!indexBytes)
      throw validationFailure(
        "candidate-validation-failed",
        "./knowledge/index.json",
        "Materialized Candidate did not produce an initialized deterministic index.",
      );
    await deps.fileSystem.writeFile(
      resolve(candidateRepository, "knowledge/index.json"),
      indexBytes,
    );
    materializedSnapshot = await createSnapshot(
      candidateRepository,
      "worktree",
    );
    materializedValidation = await validateKnowledge(materializedSnapshot);
    if (
      !materializedValidation.graph ||
      materializedValidation.diagnostics.length > 0
    )
      throw validationFailure(
        "candidate-validation-failed",
        ".",
        "Materialized Candidate failed the shared validator.",
      );
    if (baseProjectionPaths.length > 0)
      await writeGeneratedProjections(
        candidateRepository,
        materializedSnapshot,
        materializedValidation.graph,
      );
    materializedSnapshot = await createSnapshot(
      candidateRepository,
      "worktree",
    );
    materializedValidation = await validateKnowledge(materializedSnapshot);
    if (
      !materializedValidation.graph ||
      materializedValidation.diagnostics.length > 0
    )
      throw validationFailure(
        "candidate-validation-failed",
        ".",
        "Materialized Candidate failed the shared validator.",
      );
    if (
      (
        await checkGeneratedIndex(
          materializedSnapshot,
          materializedValidation.graph,
        )
      ).length > 0
    )
      throw validationFailure(
        "candidate-generation-mismatch",
        "./knowledge/index.json",
        "Materialized generated bytes do not match the shared generator.",
      );
    if (
      baseProjectionPaths.length > 0 &&
      (
        await checkGeneratedProjections(
          materializedSnapshot,
          materializedValidation.graph,
        )
      ).length > 0
    )
      throw validationFailure(
        "candidate-generation-mismatch",
        ".",
        "Materialized delivery projections do not match the shared generator.",
      );

    const materializedCanonical = await repositoryStatePaths(
      candidateRepository,
      materializedValidation.graph,
      deps.fileSystem,
    );
    const outputs = await pathDigests(
      deps.fileSystem,
      candidateRepository,
      materializedCanonical,
    );
    const currentInputs = await pathDigests(
      deps.fileSystem,
      repository.root,
      currentState,
    );
    const currentByPath = new Map(
      currentInputs.map((entry) => [entry.path, entry.digest]),
    );
    const outputByPath = new Map(
      outputs.map((entry) => [entry.path, entry.digest]),
    );
    const deletions = currentInputs
      .map((entry) => entry.path)
      .filter((path) => !outputByPath.has(path))
      .sort(compareCodePoints);
    const changedPaths = [
      ...new Set([
        ...outputs
          .filter((entry) => currentByPath.get(entry.path) !== entry.digest)
          .map((entry) => entry.path),
        ...deletions,
      ]),
    ].sort(compareCodePoints);
    const canonicalDiff: CanonicalDiff[] = changedPaths.map((path) => ({
      path,
      change: !currentByPath.has(path)
        ? "create"
        : !outputByPath.has(path)
          ? "delete"
          : "update",
      ...(currentByPath.has(path)
        ? { before_digest: currentByPath.get(path) }
        : {}),
      ...(outputByPath.has(path)
        ? { after_digest: outputByPath.get(path) }
        : {}),
    }));
    const relevantWorktree = await worktreeBinding(
      repository.root,
      [...currentState, ...materializedCanonical],
      deps.git,
    );
    const setupEffects: SetupBinding[] = [];
    if (parsed.request.setup_effects.includes("install-pre-commit")) {
      const inspection = await inspectHook(repository.root, { git: deps.git });
      if (inspection.classification === "unmanaged")
        throw validationFailure(
          "unmanaged-pre-commit-hook",
          ".",
          "An unmanaged pre-commit hook blocks Candidate preparation.",
        );
      setupEffects.push({
        effect: "install-pre-commit",
        target_path: inspection.target_path,
        target_fingerprint: inspection,
      });
    }
    const index = parseStrictJson(
      decodeCanonicalText(indexBytes, "knowledge/index.json"),
      "knowledge/index.json",
    ) as { knowledge_digest: string };
    const previewNotes = desired.notes
      .filter((note) => desired.changedNoteIds.has(note.frontmatter.id))
      .map((note) => ({
        ...note.frontmatter,
        entities: note.frontmatter.entities ?? [],
        body: note.body,
        change: desired.changedNoteIds.get(note.frontmatter.id),
      }));
    const previewEntities: PreviewEntity[] = desired.entities.map((entity) => ({
      ...entity,
      ...(desired.changedEntityIds.has(entity.id)
        ? { change: desired.changedEntityIds.get(entity.id) }
        : { change: "unchanged" as const }),
    }));
    const preview: PreviewData = {
      candidate_directory: ".",
      mode: parsed.request.mode,
      base_commit: repository.head,
      time_zone: desired.manifest.time_zone,
      frozen_date: frozenDate,
      affected_paths: changedPaths,
      output_hashes: outputs,
      knowledge_digest: index.knowledge_digest,
      canonical_diff: canonicalDiff,
      worktree: {
        fingerprint: relevantWorktree.fingerprint,
        changes: relevantWorktree.changes,
      },
      notes: previewNotes,
      entities: previewEntities,
      source_observations: desired.sourceObservations,
      setup_effects: setupEffects,
      unresolved_source_limitations: desired.sourceObservations
        .flatMap((source) => source.access_limitation ?? [])
        .filter((value, index, values) => values.indexOf(value) === index),
      privacy_warnings: desired.privacyWarnings,
      validation: { status: "passed" },
    };
    const manifestWithoutDigest = {
      schema_version: "1.0.0" as const,
      candidate_format_version: CANDIDATE_FORMAT_VERSION as "1.0.0",
      request_binding: { path: parsed.realPath, digest: sha256(parsed.bytes) },
      mode: parsed.request.mode,
      base_commit: repository.head,
      repository_identity: repository.identity,
      time_zone: desired.manifest.time_zone,
      frozen_date: frozenDate,
      canonical_inputs: currentInputs,
      implementation_inputs: await pathDigests(
        deps.fileSystem,
        repository.root,
        implementation,
      ),
      support_files: await pathDigests(
        deps.fileSystem,
        candidateRepository,
        support,
      ),
      worktree: relevantWorktree,
      source_observations: desired.sourceObservations,
      materialized_changes: desired.materializedChanges,
      setup_effects: setupEffects,
      outputs,
      deletions,
      changed_paths: changedPaths,
      knowledge_digest: index.knowledge_digest,
      validation: { status: "passed" as const },
      preview,
    };
    const candidateDigest = sha256(
      canonicalizeJson(manifestWithoutDigest as never),
    );
    const manifest: CandidateManifest = {
      ...manifestWithoutDigest,
      candidate_digest: candidateDigest,
    };
    await validateCandidateManifestValue(repository.root, manifest);
    await requireCandidateLocation(
      candidateLocation,
      "before-candidate-write",
      deps.fileSystem,
    );
    await deps.fileSystem.writeFile(
      resolve(candidateRoot, "candidate-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await deps.fileSystem.writeFile(
      resolve(candidateRoot, "preview.json"),
      previewJsonBytes(manifest),
    );
    await deps.fileSystem.writeFile(
      resolve(candidateRoot, "preview.md"),
      previewMarkdownBytes(manifest),
    );
    return {
      candidateDigest,
      previewJson: resolve(candidateRoot, "preview.json"),
      previewMarkdown: resolve(candidateRoot, "preview.md"),
    };
  } catch (error) {
    const locationStable = await candidateLocationMatches(
      candidateLocation,
      deps.fileSystem,
    ).catch(() => false);
    if (locationStable && createdOutput)
      await deps.fileSystem.rm(candidateLocation.safe_root, {
        recursive: true,
        force: true,
      });
    else if (locationStable) {
      const candidateRoot = candidateLocation.root?.real_path as string;
      for (const path of [
        "candidate-manifest.json",
        "preview.json",
        "preview.md",
        "repository",
      ])
        await deps.fileSystem
          .rm(resolve(candidateRoot, path), { recursive: true, force: true })
          .catch(() => undefined);
    }
    throw error;
  }
}

function invalidated(candidateDigest: string, code: string): CandidateReceipt {
  return {
    schema_version: "1.0.0",
    candidate_digest: candidateDigest,
    status: "approval_invalidated",
    changed_paths: [],
    validation: { status: "not_run" },
    invalidation_code: code,
  };
}

async function readCandidateManifest(
  root: string,
  candidateDir: string,
  fileSystem: CandidateFileSystem,
): Promise<CandidateManifest> {
  let bytes: Buffer;
  try {
    bytes = await fileSystem.readFile(
      resolve(candidateDir, "candidate-manifest.json"),
    );
  } catch {
    throw unable(
      "candidate-unavailable",
      ".",
      "Materialized Candidate could not be read safely.",
    );
  }
  let value: unknown;
  try {
    value = parseStrictJson(
      decodeCanonicalText(bytes, "candidate-manifest.json"),
      "candidate-manifest.json",
    );
  } catch {
    throw validationFailure(
      "candidate-manifest-invalid",
      "./candidate-manifest.json",
      "Candidate manifest is invalid or damaged.",
    );
  }
  try {
    return await validateCandidateManifestValue(root, value);
  } catch {
    throw validationFailure(
      "candidate-manifest-invalid",
      "./candidate-manifest.json",
      "Candidate manifest is invalid or damaged.",
    );
  }
}

async function validateCandidateManifestValue(
  root: string,
  value: unknown,
): Promise<CandidateManifest> {
  const validateManifest = await schemaValidator(
    root,
    "candidate-manifest.schema.json",
  );
  if (!validateManifest(value)) throw new Error("manifest schema");
  const manifest = value as CandidateManifest;
  const validatePreview = await schemaValidator(root, "preview.schema.json");
  if (!validatePreview(previewObject(manifest)))
    throw new Error("preview schema");
  validateManifestSemantics(manifest);
  return manifest;
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalizeJson(left as never) === canonicalizeJson(right as never);
}

function exactSortedUnique(values: string[]): boolean {
  return (
    new Set(values).size === values.length &&
    sameJson(values, sortedStrings(values))
  );
}

function exactSortedUniqueDigests(values: PathDigest[]): boolean {
  return (
    exactSortedUnique(values.map((entry) => entry.path)) &&
    sameJson(
      values,
      sorted(values, (entry) => entry.path),
    )
  );
}

function validateManifestSemantics(manifest: CandidateManifest): void {
  const digestInventories = [
    manifest.canonical_inputs,
    manifest.implementation_inputs,
    manifest.support_files,
    manifest.outputs,
  ];
  if (
    digestInventories.some(
      (inventory) => !exactSortedUniqueDigests(inventory),
    ) ||
    !exactSortedUnique(manifest.deletions) ||
    !exactSortedUnique(manifest.changed_paths) ||
    !exactSortedUnique(manifest.worktree.paths)
  )
    throw new Error("manifest inventories must be sorted and unique");

  const inputs = new Map(
    manifest.canonical_inputs.map((entry) => [entry.path, entry.digest]),
  );
  const outputs = new Map(
    manifest.outputs.map((entry) => [entry.path, entry.digest]),
  );
  const deletions = [...inputs.keys()]
    .filter((path) => !outputs.has(path))
    .sort(compareCodePoints);
  const changedPaths = [
    ...new Set([
      ...manifest.outputs
        .filter((entry) => inputs.get(entry.path) !== entry.digest)
        .map((entry) => entry.path),
      ...deletions,
    ]),
  ].sort(compareCodePoints);
  const canonicalDiff: CanonicalDiff[] = changedPaths.map((path) => ({
    path,
    change: !inputs.has(path)
      ? "create"
      : !outputs.has(path)
        ? "delete"
        : "update",
    ...(inputs.has(path) ? { before_digest: inputs.get(path) } : {}),
    ...(outputs.has(path) ? { after_digest: outputs.get(path) } : {}),
  }));
  const preview = manifest.preview;
  if (
    !sameJson(manifest.deletions, deletions) ||
    !sameJson(manifest.changed_paths, changedPaths) ||
    !sameJson(preview.affected_paths, changedPaths) ||
    !sameJson(preview.output_hashes, manifest.outputs) ||
    !sameJson(preview.canonical_diff, canonicalDiff) ||
    preview.mode !== manifest.mode ||
    preview.base_commit !== manifest.base_commit ||
    preview.time_zone !== manifest.time_zone ||
    preview.frozen_date !== manifest.frozen_date ||
    preview.knowledge_digest !== manifest.knowledge_digest ||
    preview.worktree.fingerprint !== manifest.worktree.fingerprint ||
    preview.candidate_directory !== "." ||
    manifest.validation.status !== "passed" ||
    preview.validation.status !== "passed" ||
    !sameJson(preview.worktree.changes, manifest.worktree.changes) ||
    !sameJson(preview.source_observations, manifest.source_observations) ||
    !sameJson(preview.setup_effects, manifest.setup_effects) ||
    manifest.setup_effects.some(
      (effect) => effect.target_path !== effect.target_fingerprint.target_path,
    )
  )
    throw new Error("manifest cross-field mismatch");
}

function validateMaterializedRequestBinding(
  manifest: CandidateManifest,
  request: CandidateRequest,
  baseGraph: KnowledgeGraph,
): boolean {
  if (
    request.mode !== manifest.mode ||
    !sameJson(
      request.setup_effects,
      manifest.setup_effects.map((effect) => effect.effect),
    )
  )
    return false;
  const temporaryIds = new Map<string, string>();
  if (request.profile) {
    const profile = manifest.materialized_changes.profile;
    if (!profile || !sameJson(profile.value, request.profile.value))
      return false;
    temporaryIds.set(request.profile.temporary_key, profile.id);
  } else if (manifest.materialized_changes.profile) return false;

  if (
    request.entity_changes.length !==
    manifest.materialized_changes.entity_changes.length
  )
    return false;
  for (const [index, requested] of request.entity_changes.entries()) {
    const materialized = manifest.materialized_changes.entity_changes[index];
    if (requested.action === "create") {
      if (
        materialized.action !== "create" ||
        typeof materialized.id !== "string" ||
        !sameJson(materialized.value, requested.value)
      )
        return false;
      temporaryIds.set(requested.temporary_key, materialized.id);
    }
  }
  const knownEntityIds = new Set(baseGraph.entities.map((entity) => entity.id));
  for (const change of manifest.materialized_changes.entity_changes)
    if (change.action === "create") knownEntityIds.add(change.id);
  const resolveRequestedEntityIds = (refs: string[]): string[] | undefined => {
    try {
      return resolveEntityRefs(refs, temporaryIds, knownEntityIds);
    } catch {
      return undefined;
    }
  };
  for (const [index, requested] of request.entity_changes.entries()) {
    const materialized = manifest.materialized_changes.entity_changes[index];
    if (requested.action === "update") {
      if (
        materialized.action !== "update" ||
        materialized.target_id !== requested.target_id ||
        !sameJson(materialized.value, requested.value)
      )
        return false;
    } else if (requested.action === "retire") {
      const expectedRemaps = requested.note_remaps.map((remap) => ({
        target_id: remap.target_id,
        entity_ids: resolveRequestedEntityIds(remap.entity_refs),
      }));
      if (
        expectedRemaps.some((remap) => remap.entity_ids === undefined) ||
        materialized.action !== "retire" ||
        materialized.target_id !== requested.target_id ||
        !sameJson(materialized.note_remaps, expectedRemaps)
      )
        return false;
    }
  }
  if (
    request.note_changes.length !==
    manifest.materialized_changes.note_changes.length
  )
    return false;
  const expectedSourceObservations: SourceObservation[] = [];
  const expectedPrivacyWarnings: string[] = [];
  for (const [index, requested] of request.note_changes.entries()) {
    const materialized = manifest.materialized_changes.note_changes[index];
    if (requested.action === "create") {
      if (materialized.action !== "create") return false;
      temporaryIds.set(requested.temporary_key, materialized.id);
    }
    const expectedId =
      requested.action === "create"
        ? temporaryIds.get(requested.temporary_key)
        : requested.target_id;
    const existing = baseGraph.notes.find(
      (note) => note.frontmatter.id === expectedId,
    );
    if (requested.action === "correct" && !existing) return false;
    const priorSources = new Map(
      existing?.frontmatter.sources.map((source) => [source.url, source]) ?? [],
    );
    const expectedEntities = resolveRequestedEntityIds(
      requested.value.entity_refs,
    );
    if (!expectedId || expectedEntities === undefined) return false;
    const expectedValue: MaterializedNoteChange["value"] = {
      id: expectedId,
      title: requested.value.title,
      temporal_coverage: requested.value.temporal_coverage,
      recorded_on:
        requested.action === "correct"
          ? (existing as LoadedNote).frontmatter.recorded_on
          : manifest.frozen_date,
      sources: requested.value.sources.map((source) =>
        materializeCitation(
          source,
          manifest.frozen_date,
          priorSources.get(source.url),
        ),
      ),
      ...(expectedEntities.length > 0 ? { entities: expectedEntities } : {}),
      body: canonicalNoteBody(requested.value.body),
    };
    if (
      materialized.action !== requested.action ||
      materialized.id !== expectedId ||
      !sameJson(materialized.value, expectedValue)
    )
      return false;
    for (const source of requested.value.sources)
      expectedSourceObservations.push({
        note_id: expectedId,
        url: source.url,
        title: source.title,
        ...(source.published_on ? { published_on: source.published_on } : {}),
        ...(source.retrieval_status === "succeeded"
          ? {
              accessed_on:
                source.accessed_on ??
                priorSources.get(source.url)?.accessed_on ??
                manifest.frozen_date,
            }
          : {}),
        retrieval_status: source.retrieval_status,
        ...(source.access_limitation
          ? { access_limitation: source.access_limitation }
          : {}),
      });
    expectedPrivacyWarnings.push(
      ...(requested.value.public_content_warnings ?? []),
    );
  }
  const sortedSourceObservations = sorted(
    expectedSourceObservations,
    (source) => `${source.note_id}\u0000${source.url}`,
  );
  const expectedLimitations = sortedSourceObservations
    .flatMap((source) => source.access_limitation ?? [])
    .filter((value, index, values) => values.indexOf(value) === index);
  return (
    sameJson(manifest.source_observations, sortedSourceObservations) &&
    sameJson(
      manifest.preview.unresolved_source_limitations,
      expectedLimitations,
    ) &&
    sameJson(manifest.preview.privacy_warnings, [
      ...new Set(expectedPrivacyWarnings),
    ])
  );
}

function validateCandidateProjection(
  manifest: CandidateManifest,
  graph: KnowledgeGraph,
): boolean {
  const entityChanges = new Map<string, "create" | "update">();
  for (const change of manifest.materialized_changes.entity_changes) {
    if (change.action === "create") entityChanges.set(change.id, "create");
    if (change.action === "update")
      entityChanges.set(change.target_id, "update");
  }
  const previewEntities: PreviewEntity[] = sorted(
    graph.entities.map((entity) => ({
      ...entity,
      change: entityChanges.get(entity.id) ?? "unchanged",
    })),
    (entity) => entity.id,
  );
  if (!sameJson(previewEntities, manifest.preview.entities)) return false;

  const candidateNotes = new Map(
    graph.notes.map((note) => [note.frontmatter.id, note]),
  );
  const previewNotes: PreviewNote[] = [];
  for (const change of manifest.materialized_changes.note_changes) {
    const note = candidateNotes.get(change.id);
    const body = note ? loadedCanonicalNoteBody(note.body) : undefined;
    if (!note || !sameJson(change.value, { ...note.frontmatter, body }))
      return false;
    previewNotes.push({
      ...note.frontmatter,
      entities: note.frontmatter.entities ?? [],
      body: body as string,
      change: change.action,
    });
  }
  return sameJson(
    sorted(previewNotes, (note) => note.id),
    manifest.preview.notes,
  );
}

async function verifyCandidateInventory(
  candidateDir: string,
  manifest: CandidateManifest,
  fileSystem: CandidateFileSystem,
): Promise<boolean> {
  const expected = [
    "candidate-manifest.json",
    "preview.json",
    "preview.md",
    ...manifest.outputs.map((entry) => `repository/${logicalPath(entry.path)}`),
    ...manifest.support_files.map(
      (entry) => `repository/${logicalPath(entry.path)}`,
    ),
  ].sort(compareCodePoints);
  let actual: string[];
  try {
    actual = await walkFiles(fileSystem, candidateDir);
  } catch {
    return false;
  }
  if (!sameJson(expected, actual)) return false;
  try {
    for (const entry of [...manifest.outputs, ...manifest.support_files]) {
      if (
        sha256(
          await fileSystem.readFile(
            resolve(candidateDir, "repository", logicalPath(entry.path)),
          ),
        ) !== entry.digest
      )
        return false;
    }
    if (
      !(
        await fileSystem.readFile(resolve(candidateDir, "preview.json"))
      ).equals(previewJsonBytes(manifest))
    )
      return false;
    if (
      !(await fileSystem.readFile(resolve(candidateDir, "preview.md"))).equals(
        previewMarkdownBytes(manifest),
      )
    )
      return false;
  } catch {
    return false;
  }
  return true;
}

async function currentDigestsEqual(
  root: string,
  expected: PathDigest[],
  fileSystem: CandidateFileSystem,
): Promise<boolean> {
  try {
    const snapshot = await createSnapshot(root, "worktree");
    const validation = await validateKnowledge(snapshot, {
      validateIndex: false,
    });
    if (!validation.graph || validation.diagnostics.length > 0) return false;
    const paths = await repositoryStatePaths(
      root,
      validation.graph,
      fileSystem,
    );
    const actual = await pathDigests(fileSystem, root, paths);
    return sameJson(actual, expected);
  } catch {
    return false;
  }
}

async function implementationDigestsEqual(
  root: string,
  expected: PathDigest[],
  fileSystem: CandidateFileSystem,
): Promise<boolean> {
  try {
    const paths = await implementationPaths(root, fileSystem);
    return sameJson(await pathDigests(fileSystem, root, paths), expected);
  } catch {
    return false;
  }
}

type TransactionEntry = {
  path: string;
  target: string;
  expected?: Buffer;
  before?: Buffer;
  beforeMode?: number;
  temporary?: string;
  backup?: string;
  deletion: boolean;
  mutated: boolean;
};

function transactionJournalBytes(
  manifest: CandidateManifest,
  entries: TransactionEntry[],
): Buffer {
  return Buffer.from(
    `${JSON.stringify(
      {
        schema_version: "1.0.0",
        candidate_digest: manifest.candidate_digest,
        state: "prepared",
        entries: entries.map((entry) => ({
          path: entry.path,
          target_path: entry.target,
          original: entry.before
            ? {
                state: "file",
                digest: sha256(entry.before),
                mode: entry.beforeMode,
              }
            : { state: "absent" },
          ...(entry.expected
            ? { expected_digest: sha256(entry.expected) }
            : { deletion: true }),
          ...(entry.temporary ? { temporary_path: entry.temporary } : {}),
          ...(entry.backup ? { backup_path: entry.backup } : {}),
        })),
      },
      null,
      2,
    )}\n`,
  );
}

async function removeTransactionArtifacts(
  entries: TransactionEntry[],
  journalPath: string | undefined,
  fileSystem: CandidateFileSystem,
): Promise<void> {
  for (const entry of entries) {
    if (entry.temporary) await fileSystem.rm(entry.temporary, { force: true });
    if (entry.backup) await fileSystem.rm(entry.backup, { force: true });
  }
  if (journalPath) {
    await fileSystem.rm(journalPath, { force: true });
    await syncDirectory(fileSystem, dirname(journalPath));
  }
}

async function syncDirectory(
  fileSystem: CandidateFileSystem,
  path: string,
): Promise<void> {
  await fileSystem.checkpoint("directory-fsync", path);
  const handle = await fileSystem.open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function rollbackTransaction(
  entries: TransactionEntry[],
  journalPath: string | undefined,
  fileSystem: CandidateFileSystem,
): Promise<boolean> {
  try {
    for (const entry of [...entries].reverse()) {
      if (!entry.mutated) continue;
      if (entry.before) {
        await fileSystem.writeFile(entry.target, entry.before, {
          mode: entry.beforeMode ?? 0o644,
        });
        if (entry.beforeMode !== undefined)
          await fileSystem.chmod(entry.target, entry.beforeMode);
      } else await fileSystem.rm(entry.target, { force: true });
    }
    await fileSystem.checkpoint("rollback-verification", ".");
    for (const entry of entries) {
      if (!entry.mutated) continue;
      if (entry.before) {
        if (!(await fileSystem.readFile(entry.target)).equals(entry.before))
          return false;
      } else if (await pathExists(fileSystem, entry.target)) return false;
    }
    await removeTransactionArtifacts(entries, journalPath, fileSystem);
    return true;
  } catch {
    return false;
  }
}

async function applyTransaction(
  root: string,
  candidateDir: string,
  manifest: CandidateManifest,
  fileSystem: CandidateFileSystem,
  postApplyValidation: () => Promise<boolean>,
): Promise<void> {
  const outputMap = new Map(
    manifest.outputs.map((entry) => [entry.path, entry]),
  );
  const entries: TransactionEntry[] = [];
  let journalPath: string | undefined;
  let journalCreated = false;
  const suffix = manifest.candidate_digest.slice(
    "sha256:".length,
    "sha256:".length + 12,
  );
  const transactionRoot = dirname(candidateDir);
  for (const [index, path] of manifest.changed_paths.entries()) {
    const target = resolve(root, logicalPath(path));
    const output = outputMap.get(path);
    let before: Buffer | undefined;
    let beforeMode: number | undefined;
    try {
      const status = await fileSystem.lstat(target);
      if (status.isSymbolicLink() || !status.isFile())
        throw new Error("unsafe canonical target");
      before = await fileSystem.readFile(target);
      beforeMode = status.mode & 0o7777;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const entry: TransactionEntry = {
      path,
      target,
      ...(output
        ? {
            expected: await fileSystem.readFile(
              resolve(candidateDir, "repository", logicalPath(path)),
            ),
            temporary: `${target}.coffee-chat-${suffix}-${index}.tmp`,
          }
        : {}),
      ...(before ? { before, beforeMode } : {}),
      ...(before
        ? {
            backup: resolve(
              transactionRoot,
              `.coffee-chat-${suffix}-${index}.bak`,
            ),
          }
        : {}),
      deletion: !output,
      mutated: false,
    };
    entries.push(entry);
  }
  try {
    const journalName = `.coffee-chat-${manifest.candidate_digest.slice(
      "sha256:".length,
    )}.transaction.json`;
    journalPath = resolve(transactionRoot, journalName);
    const journal = await fileSystem.open(journalPath, "wx", 0o600);
    journalCreated = true;
    try {
      await journal.writeFile(transactionJournalBytes(manifest, entries));
      await journal.sync();
    } finally {
      await journal.close();
    }
    await syncDirectory(fileSystem, dirname(journalPath));
    for (const entry of entries) {
      await fileSystem.mkdir(dirname(entry.target), { recursive: true });
      if (entry.expected && entry.temporary) {
        await fileSystem.checkpoint("temp-write", entry.path);
        const handle = await fileSystem.open(
          entry.temporary,
          "wx",
          entry.beforeMode ?? 0o644,
        );
        try {
          await handle.writeFile(entry.expected);
          await fileSystem.checkpoint("temp-fsync", entry.path);
          await handle.sync();
        } finally {
          await handle.close();
        }
        await fileSystem.checkpoint("mode", entry.path);
        await fileSystem.chmod(entry.temporary, entry.beforeMode ?? 0o644);
        if (
          sha256(await fileSystem.readFile(entry.temporary)) !==
          sha256(entry.expected)
        )
          throw new Error("temporary hash mismatch");
      }
      if (entry.before && entry.backup) {
        await fileSystem.checkpoint("backup", entry.path);
        const handle = await fileSystem.open(
          entry.backup,
          "wx",
          entry.beforeMode ?? 0o644,
        );
        try {
          await handle.writeFile(entry.before);
          await fileSystem.checkpoint("backup-fsync", entry.path);
          await handle.sync();
        } finally {
          await handle.close();
        }
        await fileSystem.chmod(entry.backup, entry.beforeMode ?? 0o644);
      }
    }
    for (const entry of entries) {
      if (entry.deletion) {
        await fileSystem.checkpoint("delete", entry.path);
        await fileSystem.unlink(entry.target);
      } else {
        await fileSystem.checkpoint("swap", entry.path);
        await fileSystem.rename(entry.temporary as string, entry.target);
      }
      entry.mutated = true;
      await syncDirectory(fileSystem, dirname(entry.target));
    }
    await fileSystem.checkpoint("final-verification", ".");
    for (const entry of entries) {
      if (entry.expected) {
        if (!(await fileSystem.readFile(entry.target)).equals(entry.expected))
          throw new Error("final byte verification failed");
      } else if (await pathExists(fileSystem, entry.target))
        throw new Error("deleted target remains");
    }
    await fileSystem.checkpoint("before-applied-validation", ".");
    if (!(await postApplyValidation()))
      throw new Error("applied shared validation failed");
    await removeTransactionArtifacts(entries, journalPath, fileSystem);
  } catch {
    const rollbackVerified = journalCreated
      ? await rollbackTransaction(entries, journalPath, fileSystem)
      : true;
    throw new CandidateTransactionFailure(
      {
        code: rollbackVerified
          ? "candidate-transaction-failed"
          : "candidate-rollback-failed",
        path: ".",
        message: rollbackVerified
          ? "Candidate transaction failed and the original canonical bytes were restored."
          : "Candidate transaction failed and rollback could not be verified.",
      },
      rollbackVerified,
    );
  }
}

async function validateAppliedState(
  root: string,
  manifest: CandidateManifest,
): Promise<boolean> {
  const snapshot = await createSnapshot(root, "worktree");
  const validation = await validateKnowledge(snapshot);
  if (!validation.graph || validation.diagnostics.length > 0) return false;
  if ((await checkGeneratedIndex(snapshot, validation.graph)).length > 0)
    return false;
  if (
    (await deliveryProjectionPaths(snapshot, validation.graph)).length > 0 &&
    (await checkGeneratedProjections(snapshot, validation.graph)).length > 0
  )
    return false;
  const bytes = generatedIndexBytes(validation.graph);
  if (!bytes) return false;
  const index = parseStrictJson(
    decodeCanonicalText(bytes, "knowledge/index.json"),
    "knowledge/index.json",
  ) as { knowledge_digest: string };
  return index.knowledge_digest === manifest.knowledge_digest;
}

export async function applyCandidate(
  options: { root: string; candidateDir: string; approvedDigest: string },
  overrides: CandidateDependencies = {},
): Promise<CandidateReceipt> {
  const deps = dependencies(overrides);
  if (!DIGEST.test(options.approvedDigest))
    return invalidated(options.approvedDigest, "approved-digest-invalid");
  let repository: Awaited<ReturnType<typeof repositoryBinding>>;
  let candidateLocation: CandidateLocationBinding;
  try {
    repository = await repositoryBinding(
      options.root,
      deps.git,
      deps.fileSystem,
    );
  } catch {
    return invalidated(options.approvedDigest, "candidate-location-invalid");
  }
  try {
    candidateLocation = await bindExternalCandidateLocation(
      repository.root,
      options.candidateDir,
      deps.fileSystem,
      { requireExisting: false, requireEmpty: false },
    );
  } catch {
    return invalidated(options.approvedDigest, "candidate-location-invalid");
  }
  if (!candidateLocation.root)
    throw unable(
      "candidate-unavailable",
      ".",
      "Materialized Candidate could not be read safely.",
    );
  try {
    await requireCandidateLocation(
      candidateLocation,
      "before-candidate-manifest-read",
      deps.fileSystem,
    );
  } catch {
    return invalidated(options.approvedDigest, "candidate-location-drift");
  }
  const candidateRoot = candidateLocation.root?.real_path as string;
  let manifest: CandidateManifest;
  try {
    manifest = await readCandidateManifest(
      repository.root,
      candidateRoot,
      deps.fileSystem,
    );
  } catch (error) {
    if (error instanceof ValidationFailure)
      return invalidated(options.approvedDigest, "candidate-manifest-invalid");
    throw error;
  }
  if (manifest.candidate_digest !== options.approvedDigest)
    return invalidated(options.approvedDigest, "approved-digest-mismatch");
  try {
    if (
      !DIGEST.test(manifest.candidate_digest) ||
      sha256(canonicalizeJson(withoutCandidateDigest(manifest) as never)) !==
        manifest.candidate_digest
    )
      return invalidated(options.approvedDigest, "candidate-digest-mismatch");
    if (
      !(await requireCandidateLocation(
        candidateLocation,
        "before-candidate-inventory",
        deps.fileSystem,
      ).then(
        () => true,
        () => false,
      ))
    )
      return invalidated(options.approvedDigest, "candidate-location-drift");
    if (
      !(await verifyCandidateInventory(
        candidateRoot,
        manifest,
        deps.fileSystem,
      ))
    )
      return invalidated(options.approvedDigest, "candidate-artifact-drift");
    const parsedRequest = await parseRequest(
      repository.root,
      manifest.request_binding.path,
      deps.fileSystem,
    );
    if (sha256(parsedRequest.bytes) !== manifest.request_binding.digest)
      return invalidated(options.approvedDigest, "source-observation-drift");
    validateRequestSemantics(parsedRequest.request);
    if (
      repository.head !== manifest.base_commit ||
      !sameJson(repository.identity, manifest.repository_identity)
    )
      return invalidated(options.approvedDigest, "base-head-drift");
    if (
      !(await currentDigestsEqual(
        repository.root,
        manifest.canonical_inputs,
        deps.fileSystem,
      ))
    )
      return invalidated(options.approvedDigest, "canonical-input-drift");
    if (
      !(await implementationDigestsEqual(
        repository.root,
        manifest.implementation_inputs,
        deps.fileSystem,
      ))
    )
      return invalidated(options.approvedDigest, "implementation-drift");
    const currentWorktree = await worktreeBinding(
      repository.root,
      manifest.worktree.paths,
      deps.git,
    );
    if (!sameJson(currentWorktree, manifest.worktree))
      return invalidated(options.approvedDigest, "worktree-drift");
    const baseSnapshot = await createSnapshot(repository.root, "worktree");
    const baseValidation = await validateKnowledge(baseSnapshot, {
      validateIndex: false,
    });
    if (!baseValidation.graph || baseValidation.diagnostics.length > 0)
      return invalidated(options.approvedDigest, "candidate-base-drift");
    if (
      !validateMaterializedRequestBinding(
        manifest,
        parsedRequest.request,
        baseValidation.graph,
      )
    )
      return invalidated(options.approvedDigest, "candidate-manifest-invalid");
    const rootManifest = parseStrictJson(
      decodeCanonicalText(
        await deps.fileSystem.readFile(
          resolve(repository.root, "coffee-chat.json"),
        ),
        "coffee-chat.json",
      ),
      "coffee-chat.json",
    ) as Manifest;
    if (
      rootManifest.time_zone !== manifest.time_zone ||
      configuredDate(deps.clock.now(), rootManifest.time_zone) !==
        manifest.frozen_date
    )
      return invalidated(options.approvedDigest, "configured-date-drift");
    for (const effect of manifest.setup_effects) {
      const current = await inspectHook(repository.root, { git: deps.git });
      if (!sameJson(current, effect.target_fingerprint))
        return invalidated(options.approvedDigest, "hook-target-drift");
    }
    await deps.preflight.checkpoint("before-shared-validation");
    const materializedRoot = resolve(candidateRoot, "repository");
    const materializedSnapshot = await createSnapshot(
      materializedRoot,
      "worktree",
    );
    const validation = await validateKnowledge(materializedSnapshot);
    if (!validation.graph || validation.diagnostics.length > 0)
      return invalidated(options.approvedDigest, "candidate-validation-drift");
    if (!validateCandidateProjection(manifest, validation.graph))
      return invalidated(options.approvedDigest, "candidate-manifest-invalid");
    if (
      (await checkGeneratedIndex(materializedSnapshot, validation.graph))
        .length > 0
    )
      return invalidated(options.approvedDigest, "candidate-generation-drift");
    if (
      (await deliveryProjectionPaths(materializedSnapshot, validation.graph))
        .length > 0 &&
      (await checkGeneratedProjections(materializedSnapshot, validation.graph))
        .length > 0
    )
      return invalidated(options.approvedDigest, "candidate-generation-drift");
    const generated = generatedIndexBytes(validation.graph);
    if (!generated)
      return invalidated(options.approvedDigest, "candidate-generation-drift");
    const generatedValue = parseStrictJson(
      decodeCanonicalText(generated, "knowledge/index.json"),
      "knowledge/index.json",
    ) as { knowledge_digest: string };
    if (generatedValue.knowledge_digest !== manifest.knowledge_digest)
      return invalidated(options.approvedDigest, "candidate-generation-drift");

    try {
      await requireCandidateLocation(
        candidateLocation,
        "before-candidate-transaction",
        deps.fileSystem,
      );
    } catch {
      return invalidated(options.approvedDigest, "candidate-location-drift");
    }
    await applyTransaction(
      repository.root,
      candidateRoot,
      manifest,
      deps.fileSystem,
      () => validateAppliedState(repository.root, manifest),
    );
    if (manifest.setup_effects.length === 0) {
      return {
        schema_version: "1.0.0",
        candidate_digest: manifest.candidate_digest,
        status: "applied",
        changed_paths: manifest.changed_paths,
        validation: { status: "passed" },
      };
    }
    const effect = manifest.setup_effects[0] as SetupBinding;
    try {
      await installHook(repository.root, {
        git: deps.git,
        ...(deps.process ? { process: deps.process } : {}),
      });
      return {
        schema_version: "1.0.0",
        candidate_digest: manifest.candidate_digest,
        status: "applied",
        changed_paths: manifest.changed_paths,
        validation: { status: "passed" },
        setup_effects: [
          {
            effect: effect.effect,
            target_path: effect.target_path,
            status: "applied",
          },
        ],
      };
    } catch {
      return {
        schema_version: "1.0.0",
        candidate_digest: manifest.candidate_digest,
        status: "partial_local_result",
        changed_paths: manifest.changed_paths,
        validation: { status: "passed" },
        setup_effects: [
          {
            effect: effect.effect,
            target_path: effect.target_path,
            status: "failed",
          },
        ],
        setup_failure:
          "Approved local hook setup failed; process details are <redacted>.",
      };
    }
  } catch (error) {
    if (error instanceof CandidateTransactionFailure) throw error;
    return invalidated(options.approvedDigest, "preflight-unavailable");
  }
}
