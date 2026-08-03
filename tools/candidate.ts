import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { BigIntStats, Dirent, Stats } from "node:fs";
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
import type {
  EngineReleaseManifest,
  EngineTemplateSurfaceManifest,
} from "./engine-contracts.ts";
import {
  adoptEngineSourceFiles,
  engineLockFiles,
  observeTemplateFromGitHub,
  readEngineAdoptionInputs,
  sameTemplateObservation,
  validateTemplateObservation,
  type TemplateObservation,
} from "./template-adoption.ts";
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
  isInstanceGraph,
  isInstanceManifest,
  type Citation,
  type Entity,
  type InstanceManifest,
  type KnowledgeGraph,
  type LoadedNote,
  type Manifest,
  type NoteFrontmatter,
  sha256,
  validateKnowledge,
} from "./knowledge.ts";
import type { InstanceProvenance } from "./engine-provenance.ts";
import { createSnapshot } from "./snapshot.ts";
import { decodeCanonicalText, parseStrictJson } from "./strict-input.ts";
import { renderRoleWorkflows } from "./workflow-projections.ts";

export type { TemplateObservation } from "./template-adoption.ts";

const require = createRequire(import.meta.url);
const addFormats = require("ajv-formats").default as FormatsPlugin;
const execFileAsync = promisify(execFile);
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const CANDIDATE_FORMAT_VERSION = "1.0.0";

export function normalizeGitHubRepositoryUrl(raw: string): string {
  if (raw.length === 0 || raw !== raw.trim())
    throw new Error("GitHub repository URL must be unambiguous.");

  let owner: string;
  let repository: string;
  const scp = /^git@github\.com:([^/]+)\/([^/]+)\/?$/i.exec(raw);
  if (scp) {
    owner = scp[1] as string;
    repository = scp[2] as string;
  } else {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error("GitHub repository URL must be unambiguous.");
    }
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname.toLowerCase() !== "github.com" ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.port !== "" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      parsed.pathname.includes("%")
    )
      throw new Error("GitHub repository URL must be unambiguous.");
    const match = /^\/([^/]+)\/([^/]+)\/?$/.exec(parsed.pathname);
    if (!match) throw new Error("GitHub repository URL must be unambiguous.");
    owner = match[1] as string;
    repository = match[2] as string;
  }
  repository = repository.replace(/\.git$/i, "");
  if (
    !/^[A-Za-z0-9.-]+$/.test(owner) ||
    !/^[A-Za-z0-9._-]+$/.test(repository) ||
    owner === "." ||
    owner === ".." ||
    repository === "." ||
    repository === ".."
  )
    throw new Error("GitHub repository URL must be unambiguous.");
  return `https://github.com/${owner.toLowerCase()}/${repository.toLowerCase()}`;
}

export type ProfileValue = {
  display_name: string;
  short_name: string;
};

export type RepositoryValue = {
  url: string;
  default_branch: string;
};

export type PluginValue = {
  name: string;
  version: string;
  description: string;
};

export type MakeMineConfiguration = {
  profile: {
    temporary_key: string;
    display_name: string;
    short_name: string;
  };
  time_zone: string;
  repository: RepositoryValue;
  pages_url: string;
  plugin: PluginValue;
  content_notice: string;
  provenance: InstanceProvenance;
  template_observation: TemplateObservation;
};

export type InstanceConfiguration = {
  profile: {
    temporary_key: string;
    display_name: string;
    short_name: string;
  };
  time_zone: string;
  repository: RepositoryValue;
  pages_url: string;
  plugin: PluginValue;
  content_notice: string;
  provenance: InstanceProvenance;
  template_observation: TemplateObservation;
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
export type CandidateRequest = {
  schema_version: string;
  mode: "make-mine" | "contribute" | "update";
  instance_configuration?: InstanceConfiguration;
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
export type TargetFingerprint = {
  git_common_dir: {
    real_path: string;
    device: string;
    inode: string;
  };
  origin_url: string;
  base_commit: string;
  pre_conversion_manifest_digest: string;
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
  target_fingerprint: TargetFingerprint;
  current_repository_role: "engine" | "instance";
  proposed_repository_role: "instance";
  actual_origin_url: string;
  proposed_time_zone: string;
  marketplace_name: string;
  content_notice?: string;
  provenance?: InstanceProvenance;
  template_observation?: TemplateObservation;
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
  target_fingerprint: TargetFingerprint;
  time_zone: string;
  frozen_date: string;
  canonical_inputs: PathDigest[];
  implementation_inputs: PathDigest[];
  support_files: PathDigest[];
  worktree: WorktreeBinding;
  source_observations: SourceObservation[];
  materialized_changes: {
    instance_configuration?: {
      profile: { id: string; value: ProfileValue };
      time_zone: string;
      repository: InstanceConfiguration["repository"];
      pages_url: string;
      plugin: InstanceConfiguration["plugin"];
      marketplace_name: string;
      content_notice: string;
      provenance: InstanceProvenance;
      template_observation: TemplateObservation;
    };
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
  provenance?: InstanceProvenance;
  template_observation?: TemplateObservation;
};

export type CandidateReceipt = {
  schema_version: "1.0.0";
  candidate_digest: string;
  status: "applied" | "partial_local_result" | "approval_invalidated";
  changed_paths: string[];
  validation: { status: "passed" | "not_run" };
  invalidation_code?: string;
  target_fingerprint: TargetFingerprint;
  provenance?: InstanceProvenance;
  template_observation?: TemplateObservation;
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
  | "before-transaction-journal"
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
  lstatBigInt(path: string): Promise<BigIntStats>;
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
  lstatBigInt: async (path) => lstat(path, { bigint: true }),
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
    checkpoint(
      point: "before-shared-validation" | "before-candidate-transaction",
    ): Promise<void>;
  };
  observeTemplate?: (
    expected: TemplateObservation,
  ) => Promise<TemplateObservation>;
};

type RequiredDependencies = {
  clock: { now(): Date };
  uuid: { next(): string };
  fileSystem: CandidateFileSystem;
  git: GitExecutor;
  process?: ProcessExecutor;
  preflight: {
    checkpoint(
      point: "before-shared-validation" | "before-candidate-transaction",
    ): Promise<void>;
  };
  observeTemplate?: (
    expected: TemplateObservation,
  ) => Promise<TemplateObservation>;
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
    ...(overrides.observeTemplate
      ? { observeTemplate: overrides.observeTemplate }
      : {}),
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
  repositoryPrefix = "",
): Promise<string[]> {
  const files: string[] = [];
  let rootStatus: Stats;
  try {
    rootStatus = await fileSystem.lstat(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const rootPath = repositoryPrefix ? repositoryPath(repositoryPrefix) : ".";
  if (rootStatus.isSymbolicLink())
    throw validationFailure(
      "candidate-symlink-unsafe",
      rootPath,
      "Candidate paths must not contain symbolic links.",
    );
  if (!rootStatus.isDirectory())
    throw validationFailure(
      "candidate-path-unsafe",
      rootPath,
      "Candidate paths must be directories.",
    );
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
  await walk(root, repositoryPrefix);
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
  if (name === "candidate-manifest.schema.json") {
    const previewPath = resolve(root, "schemas", "preview.schema.json");
    const previewBytes = await readFile(previewPath);
    const previewText = decodeCanonicalText(
      previewBytes,
      "schemas/preview.schema.json",
    );
    ajv.addSchema(
      parseStrictJson(previewText, "schemas/preview.schema.json") as object,
    );
  }
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
  const observedPath = resolve(requestPath);
  const insideRepository = () =>
    validationFailure(
      "candidate-request-inside-repository",
      ".",
      "Candidate request must stay outside the authoritative repository.",
    );
  if (pathWithin(root, observedPath)) throw insideRepository();
  let before: Stats;
  let realPath: string;
  try {
    before = await fileSystem.lstat(observedPath);
    realPath = await fileSystem.realpath(observedPath);
    if (!before.isFile() || before.isSymbolicLink()) throw new Error("unsafe");
  } catch {
    throw unable(
      "candidate-request-unavailable",
      ".",
      "Candidate request could not be read safely.",
    );
  }
  if (pathWithin(root, realPath)) throw insideRepository();
  let bytes: Buffer;
  let afterRealPath: string;
  let after: Stats;
  try {
    bytes = await fileSystem.readFile(observedPath);
    [afterRealPath, after] = await Promise.all([
      fileSystem.realpath(observedPath),
      fileSystem.lstat(observedPath),
    ]);
  } catch {
    throw unable(
      "candidate-request-unavailable",
      ".",
      "Candidate request could not be read safely.",
    );
  }
  if (pathWithin(root, afterRealPath)) throw insideRepository();
  if (
    afterRealPath !== realPath ||
    !after.isFile() ||
    after.isSymbolicLink() ||
    before.dev !== after.dev ||
    before.ino !== after.ino
  )
    throw unable(
      "candidate-request-unavailable",
      ".",
      "Candidate request could not be read safely.",
    );
  let value: unknown;
  try {
    value = parseStrictJson(
      decodeCanonicalText(bytes, observedPath),
      observedPath,
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
  if (request.instance_configuration)
    temporaryKeys.push(request.instance_configuration.profile.temporary_key);
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

/** Resolve the lossless local target binding used by Prepare, Apply, and the
 * final transaction checkpoint. Device/inode values intentionally remain
 * bigint-derived decimal strings so large filesystems cannot be truncated. */
export async function resolveTargetFingerprint(
  root: string,
  dependencies: Pick<CandidateDependencies, "git" | "fileSystem"> = {},
): Promise<TargetFingerprint> {
  const fileSystem = dependencies.fileSystem ?? nodeFileSystem;
  const git = dependencies.git ?? defaultGit;
  const [commonRaw, head, originResult, manifestBytes] = await Promise.all([
    requiredGit(git, root, ["rev-parse", "--git-common-dir"]),
    requiredGit(git, root, ["rev-parse", "--verify", "HEAD^{commit}"]),
    git.execute(root, ["config", "--get-all", "remote.origin.url"]),
    fileSystem.readFile(resolve(root, "coffee-chat.json")),
  ]);
  const commonDir = await fileSystem.realpath(resolve(root, commonRaw));
  const commonBefore = await fileSystem.lstatBigInt(commonDir);
  const commonAfterPath = await fileSystem.realpath(resolve(root, commonRaw));
  const commonAfter = await fileSystem.lstatBigInt(commonAfterPath);
  if (
    commonDir !== commonAfterPath ||
    !commonBefore.isDirectory() ||
    !commonAfter.isDirectory() ||
    commonBefore.dev !== commonAfter.dev ||
    commonBefore.ino !== commonAfter.ino
  )
    throw unable(
      "candidate-git-unavailable",
      ".",
      "Required Git repository state could not be resolved.",
    );
  if (originResult.exitCode !== 0)
    throw validationFailure(
      "candidate-origin-invalid",
      ".",
      "The Git origin must name exactly one GitHub repository identity.",
    );
  const originValues = originResult.stdout
    .split(/\r?\n/)
    .filter((value) => value.length > 0);
  let normalizedOrigins: string[];
  try {
    normalizedOrigins = originValues.map(normalizeGitHubRepositoryUrl);
  } catch {
    throw validationFailure(
      "candidate-origin-invalid",
      ".",
      "The Git origin must name exactly one GitHub repository identity.",
    );
  }
  if (normalizedOrigins.length === 0 || new Set(normalizedOrigins).size !== 1)
    throw validationFailure(
      "candidate-origin-invalid",
      ".",
      "The Git origin must name exactly one GitHub repository identity.",
    );
  return {
    git_common_dir: {
      real_path: commonDir,
      device: commonAfter.dev.toString(10),
      inode: commonAfter.ino.toString(10),
    },
    origin_url: normalizedOrigins[0] as string,
    base_commit: head,
    pre_conversion_manifest_digest: sha256(manifestBytes),
  };
}

async function repositoryBinding(
  root: string,
  git: GitExecutor,
  fileSystem: CandidateFileSystem,
): Promise<{
  root: string;
  head: string;
  identity: RepositoryIdentity;
  targetFingerprint: TargetFingerprint;
}> {
  const [realRoot, topRaw, head, branch, targetFingerprint] = await Promise.all(
    [
      fileSystem.realpath(root),
      requiredGit(git, root, ["rev-parse", "--show-toplevel"]),
      requiredGit(git, root, ["rev-parse", "--verify", "HEAD^{commit}"]),
      requiredGit(git, root, ["rev-parse", "--abbrev-ref", "HEAD"]),
      resolveTargetFingerprint(root, { git, fileSystem }),
    ],
  );
  const topLevel = await fileSystem.realpath(resolve(root, topRaw));
  if (topLevel !== realRoot)
    throw unable(
      "candidate-repository-mismatch",
      ".",
      "Candidate commands must run at the authoritative repository root.",
    );
  return {
    root: realRoot,
    head,
    identity: {
      top_level: topLevel,
      git_common_dir: targetFingerprint.git_common_dir.real_path,
      branch,
    },
    targetFingerprint,
  };
}

async function authoritativeRepositoryRoot(
  root: string,
  git: GitExecutor,
  fileSystem: CandidateFileSystem,
): Promise<string> {
  const [realRoot, topRaw] = await Promise.all([
    fileSystem.realpath(root),
    requiredGit(git, root, ["rev-parse", "--show-toplevel"]),
  ]);
  const topLevel = await fileSystem.realpath(resolve(root, topRaw));
  if (topLevel !== realRoot)
    throw unable(
      "candidate-repository-mismatch",
      ".",
      "Candidate commands must run at the authoritative repository root.",
    );
  return realRoot;
}

function validateRepositoryTarget(
  request: CandidateRequest,
  baseManifest: Manifest,
  target: TargetFingerprint,
): void {
  if (request.mode === "make-mine") {
    if (isInstanceManifest(baseManifest))
      throw validationFailure(
        "make-mine-engine-required",
        "./coffee-chat.json",
        "Make mine requires an engine base.",
      );
    const configuration =
      request.instance_configuration as InstanceConfiguration;
    let engineUrl: string;
    let proposedUrl: string;
    try {
      engineUrl = normalizeGitHubRepositoryUrl(baseManifest.repository.url);
      proposedUrl = normalizeGitHubRepositoryUrl(configuration.repository.url);
    } catch {
      throw validationFailure(
        "candidate-instance-repository-invalid",
        ".",
        "The proposed instance repository must be an unambiguous GitHub repository URL.",
      );
    }
    if (target.origin_url === engineUrl)
      throw validationFailure(
        "make-mine-target-not-downstream",
        ".",
        "Make mine may convert only a downstream checkout, never the engine repository itself.",
      );
    if (target.origin_url !== proposedUrl)
      throw validationFailure(
        "make-mine-target-mismatch",
        ".",
        "The actual Git origin must equal the proposed instance repository.",
      );
    return;
  }
  if (!isInstanceManifest(baseManifest))
    throw validationFailure(
      "initialized-mode-required",
      "./coffee-chat.json",
      "Contribute and update require an initialized graph.",
    );
  let expected: string;
  try {
    expected = normalizeGitHubRepositoryUrl(baseManifest.repository.url);
  } catch {
    throw validationFailure(
      "candidate-base-invalid",
      "./coffee-chat.json",
      "The instance repository identity must be an unambiguous GitHub repository URL.",
    );
  }
  if (target.origin_url !== expected)
    throw validationFailure(
      "candidate-target-mismatch",
      ".",
      "The actual Git origin must equal the instance manifest repository.",
    );
}

function validateMakeMineConfiguration(
  request: CandidateRequest,
  baseManifest: Manifest,
  observation: TemplateObservation,
  release: EngineReleaseManifest,
  surface: EngineTemplateSurfaceManifest,
): void {
  if (request.mode !== "make-mine") return;
  const configuration = request.instance_configuration as InstanceConfiguration;
  try {
    validateTemplateObservation(observation);
  } catch {
    throw validationFailure(
      "make-mine-template-observation-invalid",
      ".",
      "Make mine requires a valid native GitHub Template observation.",
    );
  }
  let sourceRepository: string;
  let targetRepository: string;
  try {
    sourceRepository = normalizeGitHubRepositoryUrl(
      baseManifest.repository.url,
    );
    targetRepository = normalizeGitHubRepositoryUrl(
      configuration.repository.url,
    );
  } catch {
    throw validationFailure(
      "make-mine-template-observation-mismatch",
      ".",
      "Template observation repositories must use the canonical engine and target identities.",
    );
  }
  if (
    observation.source_repository !== sourceRepository ||
    observation.template_repository !== sourceRepository ||
    observation.target_repository !== targetRepository ||
    observation.source_default_branch !==
      baseManifest.repository.default_branch ||
    observation.target_default_branch !==
      configuration.repository.default_branch ||
    observation.source_release_ref !== release.source_ref ||
    observation.release_digest !== release.release_digest ||
    observation.template_surface_digest !== surface.surface_digest ||
    observation.source_default_tree !== observation.target_initial_tree
  )
    throw validationFailure(
      "make-mine-template-observation-mismatch",
      ".",
      "Native Template observation does not match the engine release, surface, and target configuration.",
    );
  const expectedProvenance: InstanceProvenance = {
    engine: {
      repository: observation.source_repository,
      version: release.version,
      source_commit: observation.source_default_commit,
      release_digest: observation.release_digest,
    },
    created_from: {
      method: "github-template",
      template_repository: observation.template_repository,
    },
  };
  if (!sameJson(configuration.provenance, expectedProvenance))
    throw validationFailure(
      "make-mine-template-observation-mismatch",
      ".",
      "Instance provenance must name the observed Template source, release, and default commit.",
    );
  if (
    !observation.source_is_template ||
    observation.source_visibility !== "public" ||
    observation.target_visibility !== "public"
  )
    throw validationFailure(
      "make-mine-template-observation-mismatch",
      ".",
      "The source must remain a public Template and the target must remain public.",
    );
}

async function observeMakeMine(
  request: CandidateRequest,
  baseManifest: Manifest,
  root: string,
  deps: RequiredDependencies,
): Promise<{
  observation: TemplateObservation;
  release: EngineReleaseManifest;
  surface: EngineTemplateSurfaceManifest;
}> {
  if (request.mode !== "make-mine")
    throw new Error("observeMakeMine called for non-make-mine request");
  const configuration = request.instance_configuration as InstanceConfiguration;
  const { release, surface } = await readEngineAdoptionInputs(root);
  if (!deps.observeTemplate)
    throw validationFailure(
      "make-mine-template-observation-required",
      ".",
      "Make mine requires an injected read-only native GitHub Template observer.",
    );
  let observed: TemplateObservation;
  try {
    observed = validateTemplateObservation(
      await deps.observeTemplate(configuration.template_observation),
    );
  } catch (error) {
    if (error instanceof ValidationFailure) throw error;
    throw unable(
      "template-observation-unavailable",
      ".",
      "Native GitHub Template observation failed without mutation.",
    );
  }
  if (!sameTemplateObservation(observed, configuration.template_observation))
    throw validationFailure(
      "make-mine-template-observation-drift",
      ".",
      "Native GitHub Template observation differs from the request binding.",
    );
  validateMakeMineConfiguration(
    request,
    baseManifest,
    observed,
    release,
    surface,
  );
  return { observation: observed, release, surface };
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
  const manifestPath = resolve(root, "coffee-chat.json");
  const manifestStatus = await fileSystem.lstat(manifestPath);
  if (manifestStatus.isSymbolicLink())
    throw validationFailure(
      "candidate-symlink-unsafe",
      "./coffee-chat.json",
      "Candidate paths must not contain symbolic links.",
    );
  if (!manifestStatus.isFile())
    throw validationFailure(
      "candidate-path-unsafe",
      "./coffee-chat.json",
      "Candidate paths must be regular files.",
    );
  const knowledge = await walkFiles(
    fileSystem,
    resolve(root, "knowledge"),
    "knowledge",
  );
  const method = await walkFiles(fileSystem, resolve(root, "method"), "method");
  const contentNotice = (await pathExists(
    fileSystem,
    resolve(root, "CONTENT_LICENSE.md"),
  ))
    ? ["CONTENT_LICENSE.md"]
    : [];
  const engineLock = (await pathExists(
    fileSystem,
    resolve(root, ".coffee-chat/engine-lock.json"),
  ))
    ? [".coffee-chat/engine-lock.json"]
    : [];
  return sortedStrings([
    "coffee-chat.json",
    ...contentNotice,
    ...engineLock,
    ...knowledge.filter(
      (path) =>
        path === "knowledge/entities.yml" ||
        path === "knowledge/index.json" ||
        /^knowledge\/notes\/[^/]+\.md$/.test(path),
    ),
    ...method,
  ]);
}

async function deliveryProjectionPaths(
  snapshot: Awaited<ReturnType<typeof createSnapshot>>,
  graph: KnowledgeGraph,
  ownershipTarget?: {
    repositoryRole: "engine" | "instance";
    packageName: string;
  },
): Promise<string[]> {
  if (!(await hasDeliveryProjectionInputs(snapshot))) return [];
  return generatedProjectionStatePaths(snapshot, graph, ownershipTarget);
}

async function repositoryStatePaths(
  root: string,
  graph: KnowledgeGraph,
  fileSystem: CandidateFileSystem,
  ownershipTarget?: {
    repositoryRole: "engine" | "instance";
    packageName: string;
  },
): Promise<string[]> {
  const snapshot = await createSnapshot(root, "worktree");
  return sortedStrings([
    ...new Set([
      ...(await canonicalPaths(root, fileSystem)),
      ...(await deliveryProjectionPaths(snapshot, graph, ownershipTarget)),
    ]),
  ]);
}

async function supportPaths(
  root: string,
  fileSystem: CandidateFileSystem,
): Promise<string[]> {
  const schemas = await walkFiles(
    fileSystem,
    resolve(root, "schemas"),
    "schemas",
  );
  const readmeAssets = await walkFiles(
    fileSystem,
    resolve(root, "docs/assets/readme"),
    "docs/assets/readme",
  );
  const optional = [
    "LICENSE",
    "docs/testing.md",
    "skills/coffee-chat/SKILL.md",
    "skills/apply-perspective/SKILL.md",
    "skills/build-kg/SKILL.md",
  ];
  const found: string[] = [];
  for (const path of optional)
    if (await pathExists(fileSystem, resolve(root, path))) found.push(path);
  return sortedStrings([...schemas, ...readmeAssets, ...found]);
}

async function implementationPaths(
  root: string,
  fileSystem: CandidateFileSystem,
): Promise<string[]> {
  const schemas = await supportPaths(root, fileSystem);
  const tools = await walkFiles(fileSystem, resolve(root, "tools"), "tools");
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
  if (request.instance_configuration)
    keys.push(request.instance_configuration.profile.temporary_key);
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
  manifest: InstanceManifest;
  entities: Entity[];
  notes: LoadedNote[];
  sourceObservations: SourceObservation[];
  materializedChanges: CandidateManifest["materialized_changes"];
  changedNoteIds: Map<string, "create" | "correct">;
  changedEntityIds: Map<string, "create" | "update">;
  privacyWarnings: string[];
  makeMine?: {
    observation: TemplateObservation;
    release: EngineReleaseManifest;
    surface: EngineTemplateSurfaceManifest;
    adoptionFiles: Map<string, Buffer>;
  };
};

type MakeMineBinding = NonNullable<DesiredState["makeMine"]>;

function buildDesiredState(
  request: CandidateRequest,
  baseManifest: Manifest,
  baseEntities: Entity[],
  baseNotes: LoadedNote[],
  minted: Map<string, string>,
  frozenDate: string,
  makeMine?: MakeMineBinding,
): DesiredState {
  if (request.mode !== "make-mine" && !isInstanceManifest(baseManifest))
    throw validationFailure(
      "initialized-mode-required",
      "./coffee-chat.json",
      "Contribute and update require an initialized graph.",
    );
  const configuration = request.instance_configuration;
  const manifest: InstanceManifest = isInstanceManifest(baseManifest)
    ? structuredClone(baseManifest)
    : {
        schema_url: baseManifest.schema_url,
        schema_version: "1.1.0",
        repository_role: "instance",
        time_zone: (configuration as InstanceConfiguration).time_zone,
        profile: {
          id: "00000000-0000-4000-8000-000000000000",
          display_name: "",
          short_name: "",
        },
        repository: structuredClone(baseManifest.repository),
        pages_url: baseManifest.pages_url,
        plugin: {
          name: "coffee-chat-instance",
          version: baseManifest.plugin.version,
          description: baseManifest.plugin.description,
        },
        marketplace_name: "coffee-chat-instance-marketplace",
        paths: {
          knowledge_index: "./knowledge/index.json",
          skills: baseManifest.paths.skills,
          method: baseManifest.paths.method,
        },
        ...(makeMine
          ? {
              provenance: {
                engine: {
                  repository: makeMine.observation.source_repository,
                  version: makeMine.release.version,
                  source_commit: makeMine.observation.source_default_commit,
                  release_digest: makeMine.observation.release_digest,
                },
                created_from: {
                  method: "github-template" as const,
                  template_repository: makeMine.observation.template_repository,
                },
              },
            }
          : {}),
      };
  const materializedChanges: CandidateManifest["materialized_changes"] = {
    entity_changes: [],
    note_changes: [],
  };
  if (request.mode === "make-mine") {
    const instance = configuration as InstanceConfiguration;
    const id = minted.get(instance.profile.temporary_key) as string;
    manifest.profile = {
      id,
      display_name: instance.profile.display_name,
      short_name: instance.profile.short_name,
    };
    manifest.time_zone = instance.time_zone;
    manifest.repository = structuredClone(instance.repository);
    manifest.pages_url = instance.pages_url;
    manifest.plugin = structuredClone(instance.plugin);
    manifest.marketplace_name = `${instance.plugin.name}-marketplace`;
    if (!makeMine)
      throw validationFailure(
        "make-mine-template-observation-required",
        ".",
        "Make mine requires native Template provenance.",
      );
    manifest.schema_version = "1.1.0";
    manifest.provenance = {
      engine: {
        repository: makeMine.observation.source_repository,
        version: makeMine.release.version,
        source_commit: makeMine.observation.source_default_commit,
        release_digest: makeMine.observation.release_digest,
      },
      created_from: {
        method: "github-template",
        template_repository: makeMine.observation.template_repository,
      },
    };
    materializedChanges.instance_configuration = {
      profile: {
        id,
        value: {
          display_name: instance.profile.display_name,
          short_name: instance.profile.short_name,
        },
      },
      time_zone: instance.time_zone,
      repository: structuredClone(instance.repository),
      pages_url: instance.pages_url,
      plugin: structuredClone(instance.plugin),
      marketplace_name: `${instance.plugin.name}-marketplace`,
      content_notice: instance.content_notice,
      provenance: manifest.provenance,
      template_observation: makeMine.observation,
    };
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
    ...(makeMine ? { makeMine } : {}),
  };
}

async function writeMaterializedRepository(
  candidateRepository: string,
  root: string,
  state: DesiredState,
  currentCanonical: string[],
  support: string[],
  makeMine: MakeMineBinding | undefined,
  fileSystem: CandidateFileSystem,
): Promise<void> {
  await fileSystem.mkdir(candidateRepository, { recursive: true });
  if (makeMine) {
    for (const [path, bytes] of makeMine.adoptionFiles.entries()) {
      const target = resolve(candidateRepository, path);
      await fileSystem.mkdir(dirname(target), { recursive: true });
      const sourceStatus = await fileSystem.lstat(resolve(root, path));
      await fileSystem.writeFile(target, bytes, {
        mode: sourceStatus.mode & 0o111 ? 0o755 : 0o644,
      });
    }
    for (const output of renderRoleWorkflows("instance").outputs) {
      const target = resolve(candidateRepository, output.path);
      await fileSystem.mkdir(dirname(target), { recursive: true });
      await fileSystem.writeFile(target, output.bytes, {
        mode: output.mode === "100755" ? 0o755 : 0o644,
      });
    }
  } else {
    for (const path of support) {
      const target = resolve(candidateRepository, path);
      await fileSystem.mkdir(dirname(target), { recursive: true });
      await fileSystem.writeFile(
        target,
        await fileSystem.readFile(resolve(root, path)),
      );
    }
    for (const path of currentCanonical.filter(
      (path) =>
        path.startsWith("method/") ||
        path === "CONTENT_LICENSE.md" ||
        path === ".coffee-chat/engine-lock.json",
    )) {
      const target = resolve(candidateRepository, path);
      await fileSystem.mkdir(dirname(target), { recursive: true });
      await fileSystem.writeFile(
        target,
        await fileSystem.readFile(resolve(root, path)),
      );
    }
  }
  await fileSystem.writeFile(
    resolve(candidateRepository, "coffee-chat.json"),
    manifestBytes(state.manifest),
  );
  if (state.materializedChanges.instance_configuration)
    await fileSystem.writeFile(
      resolve(candidateRepository, "CONTENT_LICENSE.md"),
      Buffer.from(
        state.materializedChanges.instance_configuration.content_notice,
        "utf8",
      ),
    );
  if (makeMine) {
    const lockPath = resolve(
      candidateRepository,
      ".coffee-chat/engine-lock.json",
    );
    await fileSystem.mkdir(dirname(lockPath), { recursive: true });
    await fileSystem.writeFile(
      lockPath,
      Buffer.from(
        `${JSON.stringify(
          {
            schema_version: "1.0.0",
            engine: state.manifest.provenance?.engine,
            managed_files: engineLockFiles(makeMine.release),
          },
          null,
          2,
        )}\n`,
      ),
    );
  }
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
    `Target origin: \`${preview.actual_origin_url}\``,
    `Repository role: \`${preview.current_repository_role}\` → \`${preview.proposed_repository_role}\``,
    `Proposed time zone: \`${preview.proposed_time_zone}\``,
    `Marketplace: \`${preview.marketplace_name}\``,
    `Git common dir: \`${preview.target_fingerprint.git_common_dir.real_path}\` (device \`${preview.target_fingerprint.git_common_dir.device}\`, inode \`${preview.target_fingerprint.git_common_dir.inode}\`)`,
    `Pre-conversion manifest: \`${preview.target_fingerprint.pre_conversion_manifest_digest}\``,
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
  if (preview.content_notice !== undefined)
    lines.push("## Approved content notice", "", preview.content_notice, "");
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

function candidateManifestBytes(manifest: CandidateManifest): Buffer {
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
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
  if (
    !baseValidation.graph ||
    baseValidation.diagnostics.length > 0 ||
    (parsed.request.mode !== "make-mine" &&
      !isInstanceGraph(baseValidation.graph))
  )
    throw validationFailure(
      "candidate-base-invalid",
      ".",
      "Existing canonical graph must pass the shared validator before preparation.",
    );
  validateRepositoryTarget(
    parsed.request,
    baseValidation.graph.manifest,
    repository.targetFingerprint,
  );
  let makeMine: MakeMineBinding | undefined;
  if (parsed.request.mode === "make-mine") {
    try {
      const observed = await observeMakeMine(
        parsed.request,
        baseValidation.graph.manifest,
        repository.root,
        deps,
      );
      makeMine = {
        ...observed,
        adoptionFiles: await adoptEngineSourceFiles(
          repository.root,
          observed.surface,
        ),
      };
    } catch (error) {
      if (error instanceof ValidationFailure) throw error;
      throw unable(
        "template-observation-unavailable",
        ".",
        "Native GitHub Template observation failed without mutation.",
      );
    }
  }
  const projectionOwnershipTarget = {
    repositoryRole: "instance" as const,
    packageName:
      parsed.request.instance_configuration?.plugin.name ??
      baseValidation.graph.manifest.plugin.name,
  };
  const baseProjectionPaths = await deliveryProjectionPaths(
    snapshot,
    baseValidation.graph,
    projectionOwnershipTarget,
  );
  if (baseProjectionPaths.length > 0) {
    const inspection = await inspectGeneratedProjections(
      snapshot,
      baseValidation.graph,
      projectionOwnershipTarget,
    );
    const ownedStale = new Set(inspection.ownedStalePaths.map(repositoryPath));
    const transitionOnlyPath = (path: string): boolean =>
      parsed.request.mode === "make-mine" &&
      (path === "./.coffee-chat/generated-files.json" ||
        path.startsWith("./plugins/coffee-chat/") ||
        path.startsWith("./skills/create-coffee-chat/"));
    if (
      inspection.blockingDiagnostics.length > 0 ||
      inspection.diagnostics.some(
        (diagnostic) =>
          !ownedStale.has(diagnostic.path) &&
          !transitionOnlyPath(diagnostic.path),
      )
    ) {
      throw validationFailure(
        "candidate-base-invalid",
        ".",
        "Existing generated delivery projections must match canonical inputs; only marker-owned stale package files may be bound for deletion.",
      );
    }
  }
  const graphIds = new Set([
    ...(isInstanceGraph(baseValidation.graph)
      ? [baseValidation.graph.manifest.profile.id]
      : []),
    ...baseValidation.graph.entities.map((entity) => entity.id),
    ...baseValidation.graph.notes.map((note) => note.frontmatter.id),
  ]);
  const minted = mintIds(parsed.request, graphIds, deps.uuid);
  const frozenDate = configuredDate(
    deps.clock.now(),
    parsed.request.instance_configuration?.time_zone ??
      (isInstanceGraph(baseValidation.graph)
        ? baseValidation.graph.manifest.time_zone
        : "UTC"),
  );
  const desired = buildDesiredState(
    parsed.request,
    baseValidation.graph.manifest,
    baseValidation.graph.entities,
    baseValidation.graph.notes,
    minted,
    frozenDate,
    makeMine,
  );
  const currentCanonical = await canonicalPaths(
    repository.root,
    deps.fileSystem,
  );
  const currentState = sortedStrings([
    ...new Set([
      ...currentCanonical,
      ...baseProjectionPaths,
      ...(makeMine
        ? makeMine.surface.files.map((file) => logicalPath(file.path))
        : []),
    ]),
  ]);
  const support = await supportPaths(repository.root, deps.fileSystem);
  // Make mine's adopted engine surface is already part of `outputs`; engine-
  // only verification material is intentionally absent from the downstream
  // package. There are therefore no additional support files to materialize.
  const materializedSupport = makeMine ? [] : support;
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
      materializedSupport,
      makeMine,
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
      materializedValidation.diagnostics.length > 0 ||
      !isInstanceGraph(materializedValidation.graph)
    ) {
      throw validationFailure(
        "candidate-validation-failed",
        ".",
        "Materialized Candidate failed the shared validator.",
      );
    }
    const indexBytes = generatedIndexBytes(materializedValidation.graph);
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
      materializedValidation.diagnostics.length > 0 ||
      !isInstanceGraph(materializedValidation.graph)
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
      materializedValidation.diagnostics.length > 0 ||
      !isInstanceGraph(materializedValidation.graph)
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
    if (makeMine) {
      materializedCanonical.push(
        ...makeMine.adoptionFiles.keys(),
        ...renderRoleWorkflows("instance").outputs.map((output) => output.path),
      );
      materializedCanonical.splice(
        0,
        materializedCanonical.length,
        ...sortedStrings([...new Set(materializedCanonical)]),
      );
    }
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
      target_fingerprint: repository.targetFingerprint,
      current_repository_role: baseValidation.graph.manifest.repository_role,
      proposed_repository_role: "instance",
      actual_origin_url: repository.targetFingerprint.origin_url,
      proposed_time_zone: desired.manifest.time_zone,
      marketplace_name: desired.manifest.marketplace_name,
      ...(parsed.request.instance_configuration
        ? {
            content_notice:
              parsed.request.instance_configuration.content_notice,
            ...(makeMine
              ? {
                  provenance: desired.manifest.provenance,
                  template_observation: makeMine.observation,
                }
              : {}),
          }
        : {}),
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
      target_fingerprint: repository.targetFingerprint,
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
        materializedSupport,
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
      ...(makeMine
        ? {
            provenance: desired.manifest.provenance,
            template_observation: makeMine.observation,
          }
        : {}),
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
      candidateManifestBytes(manifest),
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

function invalidated(
  candidateDigest: string,
  code: string,
  targetFingerprint: TargetFingerprint,
  provenance?: InstanceProvenance,
  templateObservation?: TemplateObservation,
): CandidateReceipt {
  return {
    schema_version: "1.0.0",
    candidate_digest: candidateDigest,
    status: "approval_invalidated",
    changed_paths: [],
    validation: { status: "not_run" },
    invalidation_code: code,
    target_fingerprint: targetFingerprint,
    ...(provenance ? { provenance } : {}),
    ...(templateObservation
      ? { template_observation: templateObservation }
      : {}),
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
    manifest.target_fingerprint.base_commit !== manifest.base_commit ||
    !sameJson(preview.target_fingerprint, manifest.target_fingerprint) ||
    preview.actual_origin_url !== manifest.target_fingerprint.origin_url ||
    preview.proposed_time_zone !== manifest.time_zone ||
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
  if (
    manifest.target_fingerprint.pre_conversion_manifest_digest !==
    inputs.get("./coffee-chat.json")
  )
    throw new Error("target manifest digest mismatch");
  const configuration = manifest.materialized_changes.instance_configuration;
  if (manifest.mode === "make-mine") {
    if (
      !configuration ||
      preview.current_repository_role !== "engine" ||
      preview.proposed_repository_role !== "instance" ||
      preview.content_notice !== configuration.content_notice ||
      preview.marketplace_name !== configuration.marketplace_name ||
      configuration.marketplace_name !==
        `${configuration.plugin.name}-marketplace` ||
      manifest.time_zone !== configuration.time_zone
    )
      throw new Error("instance configuration mismatch");
    if (!manifest.provenance || !manifest.template_observation)
      throw new Error("make-mine provenance mismatch");
    if (
      !sameJson(manifest.provenance, configuration.provenance) ||
      !sameJson(
        manifest.template_observation,
        configuration.template_observation,
      ) ||
      !sameJson(preview.provenance, manifest.provenance) ||
      !sameJson(preview.template_observation, manifest.template_observation)
    )
      throw new Error("make-mine provenance mismatch");
    try {
      validateTemplateObservation(manifest.template_observation);
    } catch {
      throw new Error("make-mine template observation invalid");
    }
    let proposedRepository: string;
    try {
      proposedRepository = normalizeGitHubRepositoryUrl(
        configuration.repository.url,
      );
    } catch {
      throw new Error("instance repository mismatch");
    }
    if (proposedRepository !== manifest.target_fingerprint.origin_url)
      throw new Error("instance repository mismatch");
  } else if (
    configuration ||
    preview.current_repository_role !== "instance" ||
    preview.proposed_repository_role !== "instance" ||
    preview.content_notice !== undefined ||
    manifest.provenance !== undefined ||
    manifest.template_observation !== undefined
  )
    throw new Error("unexpected instance configuration");
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
  if (request.instance_configuration) {
    const configuration = manifest.materialized_changes.instance_configuration;
    const requested = request.instance_configuration;
    if (
      !configuration ||
      !sameJson(configuration.profile.value, {
        display_name: requested.profile.display_name,
        short_name: requested.profile.short_name,
      }) ||
      configuration.time_zone !== requested.time_zone ||
      !sameJson(configuration.repository, requested.repository) ||
      configuration.pages_url !== requested.pages_url ||
      !sameJson(configuration.plugin, requested.plugin) ||
      configuration.marketplace_name !==
        `${requested.plugin.name}-marketplace` ||
      configuration.content_notice !== requested.content_notice ||
      !sameJson(configuration.provenance, requested.provenance) ||
      !sameJson(
        configuration.template_observation,
        requested.template_observation,
      )
    )
      return false;
    temporaryIds.set(requested.profile.temporary_key, configuration.profile.id);
  } else if (manifest.materialized_changes.instance_configuration) return false;

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
    if (
      !(
        await fileSystem.readFile(
          resolve(candidateDir, "candidate-manifest.json"),
        )
      ).equals(candidateManifestBytes(manifest))
    )
      return false;
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
  manifest: CandidateManifest,
): Promise<boolean> {
  try {
    if (manifest.mode === "make-mine") {
      const actual = await pathDigests(
        fileSystem,
        root,
        expected.map((entry) => logicalPath(entry.path)),
      );
      return sameJson(actual, expected);
    }
    const snapshot = await createSnapshot(root, "worktree");
    const validation = await validateKnowledge(snapshot, {
      validateIndex: false,
    });
    if (!validation.graph || validation.diagnostics.length > 0) return false;
    const paths = await repositoryStatePaths(
      root,
      validation.graph,
      fileSystem,
      {
        repositoryRole: "instance",
        packageName:
          manifest.materialized_changes.instance_configuration?.plugin.name ??
          validation.graph.manifest.plugin.name,
      },
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

type FinalApprovalBinding =
  | { invalidationCode: string }
  | { transaction: TransactionBinding };

async function finalApprovalBinding(
  root: string,
  candidateRoot: string,
  manifest: CandidateManifest,
  baseGraph: KnowledgeGraph,
  deps: RequiredDependencies,
): Promise<FinalApprovalBinding> {
  if (
    !(await verifyCandidateInventory(candidateRoot, manifest, deps.fileSystem))
  )
    return { invalidationCode: "candidate-artifact-drift" };

  let parsedRequest: Awaited<ReturnType<typeof parseRequest>>;
  try {
    parsedRequest = await parseRequest(
      root,
      manifest.request_binding.path,
      deps.fileSystem,
    );
    validateRequestSemantics(parsedRequest.request);
  } catch {
    return { invalidationCode: "source-observation-drift" };
  }
  if (sha256(parsedRequest.bytes) !== manifest.request_binding.digest)
    return { invalidationCode: "source-observation-drift" };

  let repository: Awaited<ReturnType<typeof repositoryBinding>>;
  try {
    repository = await repositoryBinding(root, deps.git, deps.fileSystem);
  } catch {
    return { invalidationCode: "target-fingerprint-drift" };
  }
  if (
    repository.head !== manifest.base_commit ||
    !sameJson(repository.identity, manifest.repository_identity)
  )
    return { invalidationCode: "base-head-drift" };
  if (!sameJson(repository.targetFingerprint, manifest.target_fingerprint))
    return { invalidationCode: "target-fingerprint-drift" };
  if (
    !(await currentDigestsEqual(
      root,
      manifest.canonical_inputs,
      deps.fileSystem,
      manifest,
    ))
  )
    return { invalidationCode: "canonical-input-drift" };
  if (
    !(await implementationDigestsEqual(
      root,
      manifest.implementation_inputs,
      deps.fileSystem,
    ))
  )
    return { invalidationCode: "implementation-drift" };

  const currentWorktree = await worktreeBinding(
    root,
    manifest.worktree.paths,
    deps.git,
  );
  if (!sameJson(currentWorktree, manifest.worktree))
    return { invalidationCode: "worktree-drift" };
  try {
    validateRepositoryTarget(
      parsedRequest.request,
      baseGraph.manifest,
      repository.targetFingerprint,
    );
  } catch {
    return { invalidationCode: "target-fingerprint-drift" };
  }
  if (
    !validateMaterializedRequestBinding(
      manifest,
      parsedRequest.request,
      baseGraph,
    )
  )
    return { invalidationCode: "candidate-manifest-invalid" };
  if (
    configuredDate(deps.clock.now(), manifest.time_zone) !==
    manifest.frozen_date
  )
    return { invalidationCode: "configured-date-drift" };
  for (const effect of manifest.setup_effects) {
    const current = await inspectHook(root, { git: deps.git });
    if (!sameJson(current, effect.target_fingerprint))
      return { invalidationCode: "hook-target-drift" };
  }
  if (manifest.mode === "make-mine") {
    try {
      const observed = await observeMakeMine(
        parsedRequest.request,
        baseGraph.manifest,
        root,
        deps,
      );
      if (
        !manifest.template_observation ||
        !manifest.provenance ||
        !sameTemplateObservation(
          observed.observation,
          manifest.template_observation,
        ) ||
        !sameJson(manifest.provenance, {
          engine: {
            repository: observed.observation.source_repository,
            version: observed.release.version,
            source_commit: observed.observation.source_default_commit,
            release_digest: observed.observation.release_digest,
          },
          created_from: {
            method: "github-template",
            template_repository: observed.observation.template_repository,
          },
        })
      )
        return { invalidationCode: "template-observation-drift" };
      await adoptEngineSourceFiles(root, observed.surface);
    } catch {
      return { invalidationCode: "template-observation-drift" };
    }
  }
  return bindTransaction(root, candidateRoot, manifest, deps.fileSystem);
}

type TransactionEntry = {
  path: string;
  target: string;
  expected?: Buffer;
  before?: Buffer;
  beforeMode?: number;
  beforeDevice?: number;
  beforeInode?: number;
  beforeSize?: number;
  beforeChangeTimeMs?: number;
  temporary?: string;
  backup?: string;
  deletion: boolean;
  mutated: boolean;
};

type TransactionBinding = {
  transactionRoot: string;
  entries: TransactionEntry[];
};

class TransactionApprovalInvalidated extends Error {
  readonly invalidationCode: string;

  constructor(invalidationCode: string) {
    super(invalidationCode);
    this.invalidationCode = invalidationCode;
  }
}

async function readStableRegularFile(
  path: string,
  fileSystem: CandidateFileSystem,
): Promise<{ bytes: Buffer; status: Stats }> {
  const before = await fileSystem.lstat(path);
  if (before.isSymbolicLink() || !before.isFile())
    throw new Error("unsafe file");
  const bytes = await fileSystem.readFile(path);
  const after = await fileSystem.lstat(path);
  if (
    after.isSymbolicLink() ||
    !after.isFile() ||
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.mode !== after.mode ||
    before.size !== after.size ||
    before.ctimeMs !== after.ctimeMs ||
    after.size !== bytes.byteLength
  )
    throw new Error("file changed");
  return { bytes: Buffer.from(bytes), status: after };
}

async function bindTransaction(
  root: string,
  candidateDir: string,
  manifest: CandidateManifest,
  fileSystem: CandidateFileSystem,
): Promise<FinalApprovalBinding> {
  const inputs = new Map(
    manifest.canonical_inputs.map((entry) => [entry.path, entry.digest]),
  );
  const outputs = new Map(
    manifest.outputs.map((entry) => [entry.path, entry.digest]),
  );
  const entries: TransactionEntry[] = [];
  const suffix = manifest.candidate_digest.slice(
    "sha256:".length,
    "sha256:".length + 12,
  );
  const transactionRoot = dirname(candidateDir);
  for (const [index, path] of manifest.changed_paths.entries()) {
    const target = resolve(root, logicalPath(path));
    const inputDigest = inputs.get(path);
    const outputDigest = outputs.get(path);
    let before: Buffer | undefined;
    let beforeStatus: Stats | undefined;
    if (inputDigest) {
      try {
        const bound = await readStableRegularFile(target, fileSystem);
        before = bound.bytes;
        beforeStatus = bound.status;
      } catch {
        return { invalidationCode: "canonical-input-drift" };
      }
      if (sha256(before) !== inputDigest)
        return { invalidationCode: "canonical-input-drift" };
    } else if (await pathExists(fileSystem, target))
      return { invalidationCode: "canonical-input-drift" };

    let expected: Buffer | undefined;
    if (outputDigest) {
      try {
        expected = (
          await readStableRegularFile(
            resolve(candidateDir, "repository", logicalPath(path)),
            fileSystem,
          )
        ).bytes;
      } catch {
        return { invalidationCode: "candidate-artifact-drift" };
      }
      if (sha256(expected) !== outputDigest)
        return { invalidationCode: "candidate-artifact-drift" };
    }
    entries.push({
      path,
      target,
      ...(expected
        ? {
            expected,
            temporary: `${target}.coffee-chat-${suffix}-${index}.tmp`,
          }
        : {}),
      ...(before && beforeStatus
        ? {
            before,
            beforeMode: beforeStatus.mode & 0o7777,
            beforeDevice: beforeStatus.dev,
            beforeInode: beforeStatus.ino,
            beforeSize: beforeStatus.size,
            beforeChangeTimeMs: beforeStatus.ctimeMs,
            backup: resolve(
              transactionRoot,
              `.coffee-chat-${suffix}-${index}.bak`,
            ),
          }
        : {}),
      deletion: !outputDigest,
      mutated: false,
    });
  }
  return { transaction: { transactionRoot, entries } };
}

function transactionBindingMatchesManifest(
  binding: TransactionBinding,
  manifest: CandidateManifest,
): boolean {
  if (
    !sameJson(
      binding.entries.map((entry) => entry.path),
      manifest.changed_paths,
    )
  )
    return false;
  const inputs = new Map(
    manifest.canonical_inputs.map((entry) => [entry.path, entry.digest]),
  );
  const outputs = new Map(
    manifest.outputs.map((entry) => [entry.path, entry.digest]),
  );
  return binding.entries.every((entry) => {
    const inputDigest = inputs.get(entry.path);
    const outputDigest = outputs.get(entry.path);
    return (
      (entry.before
        ? inputDigest === sha256(entry.before) &&
          entry.beforeMode !== undefined &&
          entry.beforeDevice !== undefined &&
          entry.beforeInode !== undefined &&
          entry.beforeSize === entry.before.byteLength &&
          entry.beforeChangeTimeMs !== undefined
        : inputDigest === undefined) &&
      (entry.expected
        ? outputDigest === sha256(entry.expected) && !entry.deletion
        : outputDigest === undefined && entry.deletion)
    );
  });
}

async function targetMatchesPreimage(
  entry: TransactionEntry,
  fileSystem: CandidateFileSystem,
): Promise<boolean> {
  if (!entry.before) return !(await pathExists(fileSystem, entry.target));
  try {
    const current = await readStableRegularFile(entry.target, fileSystem);
    return (
      current.bytes.equals(entry.before) &&
      (current.status.mode & 0o7777) === entry.beforeMode &&
      current.status.dev === entry.beforeDevice &&
      current.status.ino === entry.beforeInode &&
      current.status.size === entry.beforeSize &&
      current.status.ctimeMs === entry.beforeChangeTimeMs
    );
  } catch {
    return false;
  }
}

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
  binding: TransactionBinding,
  manifest: CandidateManifest,
  fileSystem: CandidateFileSystem,
  postApplyValidation: () => Promise<boolean>,
): Promise<void> {
  const entries = binding.entries;
  let journalPath: string | undefined;
  let journalCreated = false;
  try {
    if (!transactionBindingMatchesManifest(binding, manifest))
      throw new TransactionApprovalInvalidated("candidate-artifact-drift");
    for (const entry of entries)
      if (!(await targetMatchesPreimage(entry, fileSystem)))
        throw new TransactionApprovalInvalidated("canonical-input-drift");
    const journalName = `.coffee-chat-${manifest.candidate_digest.slice(
      "sha256:".length,
    )}.transaction.json`;
    journalPath = resolve(binding.transactionRoot, journalName);
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
        if (!(await targetMatchesPreimage(entry, fileSystem)))
          throw new TransactionApprovalInvalidated("canonical-input-drift");
        await fileSystem.unlink(entry.target);
      } else {
        await fileSystem.checkpoint("swap", entry.path);
        if (!(await targetMatchesPreimage(entry, fileSystem)))
          throw new TransactionApprovalInvalidated("canonical-input-drift");
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
  } catch (error) {
    const rollbackVerified = journalCreated
      ? await rollbackTransaction(entries, journalPath, fileSystem)
      : true;
    if (error instanceof TransactionApprovalInvalidated && rollbackVerified)
      throw error;
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
  if (
    !validation.graph ||
    validation.diagnostics.length > 0 ||
    !isInstanceGraph(validation.graph)
  )
    return false;
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
    throw validationFailure(
      "approved-digest-invalid",
      ".",
      "The approved Candidate digest must be a canonical SHA-256 digest.",
    );
  let root: string;
  try {
    root = await authoritativeRepositoryRoot(
      options.root,
      deps.git,
      deps.fileSystem,
    );
  } catch {
    throw unable(
      "candidate-git-unavailable",
      ".",
      "Required Git repository state could not be resolved.",
    );
  }
  let repository: Awaited<ReturnType<typeof repositoryBinding>>;
  let candidateLocation: CandidateLocationBinding;
  const invalidateCurrentRepository = async (code: string) => {
    try {
      repository = await repositoryBinding(root, deps.git, deps.fileSystem);
    } catch {
      throw unable(
        "candidate-git-unavailable",
        ".",
        "Required Git repository state could not be resolved.",
      );
    }
    return invalidated(
      options.approvedDigest,
      code,
      repository.targetFingerprint,
    );
  };
  try {
    candidateLocation = await bindExternalCandidateLocation(
      root,
      options.candidateDir,
      deps.fileSystem,
      { requireExisting: false, requireEmpty: false },
    );
  } catch {
    return invalidateCurrentRepository("candidate-location-invalid");
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
    return invalidateCurrentRepository("candidate-location-drift");
  }
  const candidateRoot = candidateLocation.root?.real_path as string;
  let manifest: CandidateManifest;
  try {
    manifest = await readCandidateManifest(
      root,
      candidateRoot,
      deps.fileSystem,
    );
  } catch (error) {
    if (error instanceof ValidationFailure)
      return invalidateCurrentRepository("candidate-manifest-invalid");
    throw error;
  }
  if (
    sha256(canonicalizeJson(withoutCandidateDigest(manifest) as never)) !==
    manifest.candidate_digest
  )
    return invalidateCurrentRepository("candidate-digest-mismatch");
  if (manifest.candidate_digest !== options.approvedDigest)
    return invalidateCurrentRepository("approved-digest-mismatch");
  const invalidate = (code: string) =>
    invalidated(
      options.approvedDigest,
      code,
      manifest.target_fingerprint,
      manifest.provenance,
      manifest.template_observation,
    );
  try {
    try {
      repository = await repositoryBinding(root, deps.git, deps.fileSystem);
    } catch {
      return invalidate("target-fingerprint-drift");
    }
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
      return invalidate("candidate-location-drift");
    if (
      !(await verifyCandidateInventory(
        candidateRoot,
        manifest,
        deps.fileSystem,
      ))
    )
      return invalidate("candidate-artifact-drift");
    const parsedRequest = await parseRequest(
      repository.root,
      manifest.request_binding.path,
      deps.fileSystem,
    );
    if (sha256(parsedRequest.bytes) !== manifest.request_binding.digest)
      return invalidate("source-observation-drift");
    validateRequestSemantics(parsedRequest.request);
    if (
      repository.head !== manifest.base_commit ||
      !sameJson(repository.identity, manifest.repository_identity)
    )
      return invalidate("base-head-drift");
    if (!sameJson(repository.targetFingerprint, manifest.target_fingerprint))
      return invalidate("target-fingerprint-drift");
    if (
      !(await currentDigestsEqual(
        repository.root,
        manifest.canonical_inputs,
        deps.fileSystem,
        manifest,
      ))
    )
      return invalidate("canonical-input-drift");
    if (
      !(await implementationDigestsEqual(
        repository.root,
        manifest.implementation_inputs,
        deps.fileSystem,
      ))
    )
      return invalidate("implementation-drift");
    const currentWorktree = await worktreeBinding(
      repository.root,
      manifest.worktree.paths,
      deps.git,
    );
    if (!sameJson(currentWorktree, manifest.worktree))
      return invalidate("worktree-drift");
    const baseSnapshot = await createSnapshot(repository.root, "worktree");
    const baseValidation = await validateKnowledge(baseSnapshot, {
      validateIndex: false,
    });
    if (!baseValidation.graph || baseValidation.diagnostics.length > 0)
      return invalidate("candidate-base-drift");
    try {
      validateRepositoryTarget(
        parsedRequest.request,
        baseValidation.graph.manifest,
        repository.targetFingerprint,
      );
    } catch {
      return invalidate("target-fingerprint-drift");
    }
    if (
      !validateMaterializedRequestBinding(
        manifest,
        parsedRequest.request,
        baseValidation.graph,
      )
    )
      return invalidate("candidate-manifest-invalid");
    if (manifest.mode === "make-mine") {
      try {
        const observed = await observeMakeMine(
          parsedRequest.request,
          baseValidation.graph.manifest,
          repository.root,
          deps,
        );
        if (
          !manifest.template_observation ||
          !manifest.provenance ||
          !sameTemplateObservation(
            observed.observation,
            manifest.template_observation,
          ) ||
          !sameJson(manifest.provenance, {
            engine: {
              repository: observed.observation.source_repository,
              version: observed.release.version,
              source_commit: observed.observation.source_default_commit,
              release_digest: observed.observation.release_digest,
            },
            created_from: {
              method: "github-template",
              template_repository: observed.observation.template_repository,
            },
          })
        )
          return invalidate("template-observation-drift");
      } catch {
        return invalidate("template-observation-drift");
      }
    }
    const rootManifest = parseStrictJson(
      decodeCanonicalText(
        await deps.fileSystem.readFile(
          resolve(repository.root, "coffee-chat.json"),
        ),
        "coffee-chat.json",
      ),
      "coffee-chat.json",
    ) as Manifest;
    const rootTimeZone =
      parsedRequest.request.instance_configuration?.time_zone ??
      (isInstanceManifest(rootManifest) ? rootManifest.time_zone : "UTC");
    if (
      rootTimeZone !== manifest.time_zone ||
      configuredDate(deps.clock.now(), rootTimeZone) !== manifest.frozen_date
    )
      return invalidate("configured-date-drift");
    for (const effect of manifest.setup_effects) {
      const current = await inspectHook(repository.root, { git: deps.git });
      if (!sameJson(current, effect.target_fingerprint))
        return invalidate("hook-target-drift");
    }
    await deps.preflight.checkpoint("before-shared-validation");
    const materializedRoot = resolve(candidateRoot, "repository");
    const materializedSnapshot = await createSnapshot(
      materializedRoot,
      "worktree",
    );
    const validation = await validateKnowledge(materializedSnapshot);
    if (
      !validation.graph ||
      validation.diagnostics.length > 0 ||
      !isInstanceGraph(validation.graph)
    )
      return invalidate("candidate-validation-drift");
    if (!validateCandidateProjection(manifest, validation.graph))
      return invalidate("candidate-manifest-invalid");
    if (
      (await checkGeneratedIndex(materializedSnapshot, validation.graph))
        .length > 0
    )
      return invalidate("candidate-generation-drift");
    if (
      (await deliveryProjectionPaths(materializedSnapshot, validation.graph))
        .length > 0 &&
      (await checkGeneratedProjections(materializedSnapshot, validation.graph))
        .length > 0
    )
      return invalidate("candidate-generation-drift");
    const generated = generatedIndexBytes(validation.graph);
    const generatedValue = parseStrictJson(
      decodeCanonicalText(generated, "knowledge/index.json"),
      "knowledge/index.json",
    ) as { knowledge_digest: string };
    if (generatedValue.knowledge_digest !== manifest.knowledge_digest)
      return invalidate("candidate-generation-drift");

    try {
      await requireCandidateLocation(
        candidateLocation,
        "before-candidate-transaction",
        deps.fileSystem,
      );
    } catch {
      return invalidate("candidate-location-drift");
    }
    const finalApproval = await finalApprovalBinding(
      repository.root,
      candidateRoot,
      manifest,
      baseValidation.graph,
      deps,
    );
    if ("invalidationCode" in finalApproval)
      return invalidate(finalApproval.invalidationCode);
    try {
      await requireCandidateLocation(
        candidateLocation,
        "before-transaction-journal",
        deps.fileSystem,
      );
    } catch {
      return invalidate("candidate-location-drift");
    }
    if (
      !(await verifyCandidateInventory(
        candidateRoot,
        manifest,
        deps.fileSystem,
      ))
    )
      return invalidate("candidate-artifact-drift");
    for (const entry of finalApproval.transaction.entries)
      if (!(await targetMatchesPreimage(entry, deps.fileSystem)))
        return invalidate("canonical-input-drift");
    try {
      await applyTransaction(
        finalApproval.transaction,
        manifest,
        deps.fileSystem,
        () => validateAppliedState(repository.root, manifest),
      );
    } catch (error) {
      if (error instanceof TransactionApprovalInvalidated)
        return invalidate(error.invalidationCode);
      throw error;
    }
    if (manifest.setup_effects.length === 0) {
      return {
        schema_version: "1.0.0",
        candidate_digest: manifest.candidate_digest,
        status: "applied",
        changed_paths: manifest.changed_paths,
        validation: { status: "passed" },
        target_fingerprint: manifest.target_fingerprint,
        ...(manifest.provenance ? { provenance: manifest.provenance } : {}),
        ...(manifest.template_observation
          ? { template_observation: manifest.template_observation }
          : {}),
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
        target_fingerprint: manifest.target_fingerprint,
        ...(manifest.provenance ? { provenance: manifest.provenance } : {}),
        ...(manifest.template_observation
          ? { template_observation: manifest.template_observation }
          : {}),
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
        target_fingerprint: manifest.target_fingerprint,
        ...(manifest.provenance ? { provenance: manifest.provenance } : {}),
        ...(manifest.template_observation
          ? { template_observation: manifest.template_observation }
          : {}),
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
    return invalidate("preflight-unavailable");
  }
}
