import { createHash } from "node:crypto";
import {
  lstat as fsLstat,
  mkdir,
  open as fsOpen,
  readFile as fsReadFile,
  rename,
  rm,
  writeFile as fsWriteFile,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, relative, resolve } from "node:path";
import { canonicalizeJson } from "./generate.ts";
import {
  normalizeGitHubRepositoryUrl,
  type EngineProvenance,
} from "./engine-provenance.ts";
import { decodeCanonicalText, parseStrictJson } from "./strict-input.ts";
import type {
  AppliedEngineUpdateReceipt,
  CommandResult,
  Sha256Digest,
} from "./engine-update.ts";

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const DOMAIN = "coffee-chat-engine-publication/v1";

export type EnginePublicationPreview = {
  schema_version: "1.0.0";
  publication_digest: Sha256Digest;
  repository: { id: string; origin_url: string; remote: "origin" };
  base: { branch: string; remote_sha: string };
  head: { branch: string; pre_commit_head_sha: string; push_refspec: string };
  worktree: {
    path: string;
    status: "matches-update-receipt";
    git_tree_sha: string;
    inventory_digest: Sha256Digest;
    base_index_tree_sha: string;
    unstaged_diff_digest: Sha256Digest;
    changed_paths: string[];
  };
  git_isolation: {
    existing_worktree: "created-and-materialized-by-task-8";
    empty_hooks_path: string;
    empty_hooks_path_digest: Sha256Digest;
    effective_config_digest: Sha256Digest;
    temporary_index: string;
    filters: "custom-filters-rejected";
  };
  update_receipt: { path: "./update-receipt.json"; digest: Sha256Digest };
  receipt_plan: { path: string; journal_path: string };
  commit: {
    parent_sha: string;
    message: string;
    author_name: string;
    author_email: string;
    committer_name: string;
    committer_email: string;
    authored_at: string;
    committed_at: string;
    signing: "none";
  };
  pull_request: { title: string; body: string; merge: false };
  workflow_effects: Array<{
    path: `./.github/workflows/${string}.${"yml" | "yaml"}`;
    event:
      | "push"
      | "pull_request"
      | "pull_request_target"
      | "workflow_run"
      | "workflow_call";
    source: "result-tree" | "remote-base";
    source_commit: string;
    workflow_digest: Sha256Digest;
    filters_digest: Sha256Digest;
    triggered_by: string[];
    jobs: string[];
    permissions_digest: Sha256Digest;
    referenced_secret_names: string[];
    environment_names: string[];
  }>;
};

export type PrepareEnginePublicationInput = {
  worktree_root: string;
  update_receipt_path: string;
  publication_receipt_path: string;
  out_dir: string;
};
export type ApplyEnginePublicationInput = {
  candidate_dir: string;
  approval_digest: Sha256Digest;
  receipt_path: string;
};
export type ObservedPullRequest = {
  url: string;
  repository_id: string;
  state: "open";
  base: string;
  head: string;
  title: string;
  body: string;
};
export type EnginePublicationCandidateManifest = {
  schema_version: "1.0.0";
  publication_digest: Sha256Digest;
  preview: Omit<EnginePublicationPreview, "publication_digest">;
  copied_update_receipt: {
    path: "./update-receipt.json";
    digest: Sha256Digest;
  };
  support_files: Array<{
    path: `./schemas/${string}.json`;
    digest: Sha256Digest;
  }>;
};
export type PublishedEnginePublicationReceipt = {
  schema_version: "1.0.0";
  publication_digest: Sha256Digest;
  status: "published";
  commit_sha: string;
  remote_head_sha: string;
  pull_request: ObservedPullRequest;
  completed_effects: ["commit", "push", "pull-request"];
};
export type InvalidatedEnginePublicationReceipt = {
  schema_version: "1.0.0";
  publication_digest: Sha256Digest;
  status: "invalidated";
  reason_codes: string[];
  completed_effects: [];
};
export type CommittedOnlyPublicationReceipt = {
  schema_version: "1.0.0";
  publication_digest: Sha256Digest;
  status: "partial_remote_result";
  commit_sha: string;
  completed_effects: ["commit"];
  recovery: string[];
};
export type PushedPublicationReceipt = {
  schema_version: "1.0.0";
  publication_digest: Sha256Digest;
  status: "partial_remote_result";
  commit_sha: string;
  remote_head_sha: string;
  completed_effects: ["commit", "push"];
  recovery: string[];
};
export type IndeterminatePublicationReceipt = {
  schema_version: "1.0.0";
  publication_digest: Sha256Digest;
  status: "partial_remote_result";
  known_completed_effects: [] | ["commit"] | ["commit", "push"];
  indeterminate_effect: "commit" | "push" | "pull-request";
  returned_identifiers: Record<string, string>;
  observed_identifiers: Record<string, string>;
  recovery: string[];
};
export type FinalizationPendingPublicationReceipt = {
  schema_version: "1.0.0";
  publication_digest: Sha256Digest;
  status: "partial_remote_result";
  commit_sha: string;
  remote_head_sha: string;
  pull_request: ObservedPullRequest;
  known_completed_effects: ["commit", "push", "pull-request"];
  indeterminate_effect: "receipt-finalization";
  returned_identifiers: Record<string, string>;
  observed_identifiers: Record<string, string>;
  recovery: string[];
};
export type EnginePublicationReceipt =
  | PublishedEnginePublicationReceipt
  | InvalidatedEnginePublicationReceipt
  | CommittedOnlyPublicationReceipt
  | PushedPublicationReceipt
  | IndeterminatePublicationReceipt
  | FinalizationPendingPublicationReceipt;

export type EnginePublicationDependencies = {
  run_git: (input: {
    cwd: string;
    args: string[];
    env?: Readonly<Record<string, string>>;
    stdin?: Buffer;
  }) => Promise<CommandResult>;
  observe_repository: (
    origin_url: string,
    head_branch?: string,
  ) => Promise<{
    id: string;
    default_branch: string;
    default_branch_sha: string;
    head_ref_sha?: string;
  }>;
  observe_pull_request: (input: {
    repository_id: string;
    origin_url?: string;
    base: string;
    head: string;
  }) => Promise<ObservedPullRequest | null>;
  create_pull_request: (input: {
    repository_id: string;
    origin_url?: string;
    base: string;
    head: string;
    title: string;
    body: string;
  }) => Promise<{ url: string }>;
  now?: () => Date;
};

function digest(bytes: Buffer): Sha256Digest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function stable(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}
function canonicalDigest(value: Record<string, unknown>): Sha256Digest {
  return digest(
    Buffer.from(
      canonicalizeJson({ domain: DOMAIN, ...value } as never),
      "utf8",
    ),
  );
}
function pathInside(root: string, value: string): string {
  const absolute = resolve(value);
  const base = resolve(root);
  if (absolute !== base && !absolute.startsWith(`${base}/`))
    throw new Error("publication-path-escape");
  return absolute;
}
function outside(value: string, roots: string[]): boolean {
  const absolute = resolve(value);
  return roots.every((root) => {
    const base = resolve(root);
    return absolute !== base && !absolute.startsWith(`${base}/`);
  });
}
async function git(
  runtime: EnginePublicationDependencies,
  cwd: string,
  args: string[],
  env?: Readonly<Record<string, string>>,
): Promise<Buffer> {
  const result = await runtime.run_git({ cwd, args, env });
  if (result.exit_code !== 0) throw new Error(`git-${args[0]}-failed`);
  return Buffer.from(result.stdout);
}
async function gitText(
  runtime: EnginePublicationDependencies,
  cwd: string,
  args: string[],
  env?: Readonly<Record<string, string>>,
): Promise<string> {
  return (await git(runtime, cwd, args, env)).toString("utf8").trim();
}
function jsonObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("object-required");
  return value as Record<string, unknown>;
}
async function readJson(path: string): Promise<Record<string, unknown>> {
  return jsonObject(
    parseStrictJson(decodeCanonicalText(await fsReadFile(path), path), path),
  );
}
async function writeAtomic(path: string, bytes: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${digest(bytes).slice(-16)}`;
  const handle = await fsOpen(temporary, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

const PUBLICATION_SCHEMA_NAMES = [
  "engine-update-publication-candidate.schema.json",
  "engine-update-publication-preview.schema.json",
  "engine-update-publication-receipt.schema.json",
  "engine-update-publication-journal.schema.json",
] as const;

async function publicationSupportFiles(
  root: string,
): Promise<EnginePublicationCandidateManifest["support_files"]> {
  const files: EnginePublicationCandidateManifest["support_files"] = [];
  for (const name of PUBLICATION_SCHEMA_NAMES) {
    const bytes = await fsReadFile(resolve(root, "schemas", name));
    files.push({
      path: `./schemas/${name}`,
      digest: digest(bytes),
    });
  }
  return files;
}
async function requireNewExternal(
  path: string,
  roots: string[],
): Promise<void> {
  if (!outside(path, roots)) throw new Error("publication-path-invalid");
  try {
    const status = await fsLstat(path);
    if (status.isSymbolicLink() || status.isFile())
      throw new Error("publication-receipt-exists");
    throw new Error("publication-path-invalid");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
function appliedReceipt(value: unknown): AppliedEngineUpdateReceipt {
  const item = jsonObject(value);
  if (item.status !== "applied" || item.schema_version !== "1.0.0")
    throw new Error("update-receipt-not-applied");
  return item as unknown as AppliedEngineUpdateReceipt;
}
function commandResult(result: CommandResult, argv: string[]): string {
  return `${argv.join(" ")} (${result.exit_code})`;
}

function githubApiRepositoryPath(originUrl: string): string {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/.exec(originUrl);
  if (!match) throw new Error("github-origin-invalid");
  return `repos/${match[1]}/${match[2]}`;
}

async function workflowEffects(
  root: string,
  commit: string,
): Promise<EnginePublicationPreview["workflow_effects"]> {
  const output: EnginePublicationPreview["workflow_effects"] = [];
  const workflowRoot = resolve(root, ".github/workflows");
  let names: string[] = [];
  try {
    names = (await (await import("node:fs/promises")).readdir(workflowRoot))
      .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
      .sort();
  } catch {
    return output;
  }
  for (const name of names) {
    const bytes = await fsReadFile(resolve(workflowRoot, name));
    const text = bytes.toString("utf8");
    const events: EnginePublicationPreview["workflow_effects"][number]["event"][] =
      [];
    if (/^\s*push\s*:/m.test(text)) events.push("push");
    if (/^\s*pull_request\s*:/m.test(text)) events.push("pull_request");
    if (/^\s*pull_request_target\s*:/m.test(text))
      events.push("pull_request_target");
    if (/^\s*workflow_run\s*:/m.test(text)) events.push("workflow_run");
    if (/^\s*workflow_call\s*:/m.test(text)) events.push("workflow_call");
    const jobs = [...text.matchAll(/^\s{2}([A-Za-z0-9_-]+):\s*$/gm)]
      .map((m) => m[1]!)
      .filter((value) => value !== "on");
    for (const event of events) {
      output.push({
        path: `./.github/workflows/${name}` as `./.github/workflows/${string}.${"yml" | "yaml"}`,
        event,
        source: "result-tree",
        source_commit: commit,
        workflow_digest: digest(bytes),
        filters_digest: digest(
          Buffer.from(
            text.match(/^\s*(?:branches|paths|types):.*$/gm)?.join("\n") ?? "",
            "utf8",
          ),
        ),
        triggered_by: [event],
        jobs,
        permissions_digest: digest(
          Buffer.from(
            text.match(/^permissions:[\s\S]*?(?=^\S|$)/m)?.[0] ?? "",
            "utf8",
          ),
        ),
        referenced_secret_names: [
          ...new Set(
            [...text.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]!),
          ),
        ].sort(),
        environment_names: [
          ...new Set(
            [...text.matchAll(/environment:\s*([A-Za-z0-9_-]+)/g)].map(
              (m) => m[1]!,
            ),
          ),
        ].sort(),
      });
    }
  }
  return output.sort((a, b) =>
    `${a.path}\0${a.event}`.localeCompare(`${b.path}\0${b.event}`),
  );
}

function previewMarkdown(preview: EnginePublicationPreview): Buffer {
  return Buffer.from(
    [
      "# Coffee Chat engine publication",
      "",
      `Publication digest: ${preview.publication_digest}`,
      `Branch: ${preview.head.branch}`,
      `PR: ${preview.pull_request.title}`,
      "",
      "This preview binds one commit, one push, and one pull request. It never authorizes merge.",
      "",
    ].join("\n"),
    "utf8",
  );
}

export async function prepareEnginePublication(
  input: PrepareEnginePublicationInput,
  dependencies: EnginePublicationDependencies,
): Promise<EnginePublicationPreview> {
  const update = appliedReceipt(await readJson(input.update_receipt_path));
  const targetRoot = resolve(input.worktree_root);
  await requireNewExternal(input.publication_receipt_path, [
    targetRoot,
    input.out_dir,
  ]);
  if (!outside(input.out_dir, [targetRoot]))
    throw new Error("publication-output-invalid");
  try {
    const outputStat = await fsLstat(input.out_dir);
    if (outputStat.isSymbolicLink() || !outputStat.isDirectory())
      throw new Error("publication-output-invalid");
    if (
      (await (await import("node:fs/promises")).readdir(input.out_dir)).length
    )
      throw new Error("publication-output-not-empty");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const origin = normalizeGitHubRepositoryUrl(
    await gitText(dependencies, targetRoot, [
      "config",
      "--get",
      "remote.origin.url",
    ]),
  );
  const repository = await dependencies.observe_repository(origin);
  const branch = await gitText(dependencies, targetRoot, [
    "symbolic-ref",
    "--short",
    "HEAD",
  ]);
  const head = await gitText(dependencies, targetRoot, ["rev-parse", "HEAD"]);
  if (head !== update.base_commit || branch !== update.branch_name)
    throw new Error("update-receipt-worktree-drift");
  if (repository.default_branch_sha !== head)
    throw new Error("publication-remote-base-drift");
  const diff = await git(dependencies, targetRoot, [
    "diff",
    "--binary",
    "--no-ext-diff",
  ]);
  const status = await git(dependencies, targetRoot, [
    "status",
    "--porcelain=v1",
    "-z",
  ]);
  const changedPaths = [
    ...new Set(
      status
        .toString("utf8")
        .split("\0")
        .filter(Boolean)
        .map((value) => value.slice(3)),
    ),
  ].sort();
  const receiptChangedPaths = [...update.result_tree.changed_paths].sort();
  const observedChangedPaths = [...changedPaths].sort();
  if (
    observedChangedPaths.length !== receiptChangedPaths.length ||
    observedChangedPaths.some(
      (path, index) =>
        `./${path.replace(/^\.\//, "")}` !== receiptChangedPaths[index],
    )
  )
    throw new Error("update-receipt-path-drift");
  const worktree = {
    path: targetRoot,
    status: "matches-update-receipt" as const,
    git_tree_sha: update.result_tree.git_tree_sha,
    inventory_digest: update.result_tree.inventory_digest,
    base_index_tree_sha: update.result_tree.base_index_tree_sha,
    unstaged_diff_digest: digest(diff),
    changed_paths: observedChangedPaths.map((value) =>
      value.startsWith("./") ? value : `./${value}`,
    ),
  };
  if (worktree.unstaged_diff_digest !== update.result_tree.unstaged_diff_digest)
    throw new Error("update-receipt-diff-drift");
  const authorName = await gitText(dependencies, targetRoot, [
    "config",
    "--get",
    "user.name",
  ]);
  const authorEmail = await gitText(dependencies, targetRoot, [
    "config",
    "--get",
    "user.email",
  ]);
  const now = (dependencies.now ?? (() => new Date()))().toISOString();
  const message = `feat: update Coffee Chat engine to ${update.target_engine.version}`;
  const prTitle = `Update Coffee Chat engine to ${update.target_engine.version}`;
  const prBody = `This PR applies the approved Coffee Chat engine update ${update.update_digest}.\n\nthe update was verified in an isolated worktree; merge remains a human decision.`;
  const workflows = await workflowEffects(targetRoot, head);
  const noDigest: Omit<EnginePublicationPreview, "publication_digest"> = {
    schema_version: "1.0.0",
    repository: { id: repository.id, origin_url: origin, remote: "origin" },
    base: {
      branch: repository.default_branch,
      remote_sha: repository.default_branch_sha,
    },
    head: {
      branch,
      pre_commit_head_sha: head,
      push_refspec: `refs/heads/${branch}:refs/heads/${branch}`,
    },
    worktree,
    git_isolation: {
      existing_worktree: "created-and-materialized-by-task-8",
      empty_hooks_path: resolve(targetRoot, ".empty-hooks"),
      empty_hooks_path_digest: digest(Buffer.alloc(0)),
      effective_config_digest: digest(
        Buffer.from(
          JSON.stringify({
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_CONFIG_GLOBAL: "/dev/null",
          }),
          "utf8",
        ),
      ),
      temporary_index: resolve(input.out_dir, ".publication-index"),
      filters: "custom-filters-rejected",
    },
    update_receipt: {
      path: "./update-receipt.json",
      digest: digest(await fsReadFile(input.update_receipt_path)),
    },
    receipt_plan: {
      path: input.publication_receipt_path,
      journal_path: `${input.publication_receipt_path}.journal.json`,
    },
    commit: {
      parent_sha: head,
      message,
      author_name: authorName,
      author_email: authorEmail,
      committer_name: authorName,
      committer_email: authorEmail,
      authored_at: now,
      committed_at: now,
      signing: "none",
    },
    pull_request: { title: prTitle, body: prBody, merge: false },
    workflow_effects: workflows,
  };
  const supportFiles = await publicationSupportFiles(targetRoot);
  const digestFreeCandidate = {
    schema_version: "1.0.0",
    preview: noDigest,
    copied_update_receipt: noDigest.update_receipt,
    support_files: supportFiles,
  } satisfies Omit<EnginePublicationCandidateManifest, "publication_digest">;
  const publicationDigest = canonicalDigest(digestFreeCandidate);
  const preview = {
    ...noDigest,
    publication_digest: publicationDigest,
  } as EnginePublicationPreview;
  const candidate: EnginePublicationCandidateManifest = {
    ...digestFreeCandidate,
    publication_digest: publicationDigest,
  };
  await mkdir(resolve(input.out_dir, "schemas"), { recursive: true });
  for (const support of supportFiles) {
    const name = support.path.slice("./schemas/".length);
    await fsWriteFile(
      resolve(input.out_dir, "schemas", name),
      await fsReadFile(resolve(targetRoot, "schemas", name)),
    );
  }
  await fsWriteFile(
    resolve(input.out_dir, "publication-candidate.json"),
    stable(candidate),
  );
  await fsWriteFile(resolve(input.out_dir, "preview.json"), stable(preview));
  await fsWriteFile(
    resolve(input.out_dir, "preview.md"),
    previewMarkdown(preview),
  );
  await fsWriteFile(
    resolve(input.out_dir, "update-receipt.json"),
    await fsReadFile(input.update_receipt_path),
  );
  return preview;
}

async function loadPublicationCandidate(
  input: ApplyEnginePublicationInput,
): Promise<EnginePublicationCandidateManifest> {
  const bytes = await fsReadFile(
    resolve(input.candidate_dir, "publication-candidate.json"),
  );
  const candidate = jsonObject(
    parseStrictJson(
      decodeCanonicalText(bytes, "publication-candidate.json"),
      "publication-candidate.json",
    ),
  ) as unknown as EnginePublicationCandidateManifest;
  if (
    candidate.schema_version !== "1.0.0" ||
    !DIGEST.test(candidate.publication_digest) ||
    candidate.publication_digest !== input.approval_digest
  )
    throw new Error("publication-digest-mismatch");
  const copy = {
    ...candidate,
    publication_digest: undefined,
  } as unknown as Record<string, unknown>;
  delete copy.publication_digest;
  if (canonicalDigest(copy) !== candidate.publication_digest)
    throw new Error("publication-digest-mismatch");
  const preview = {
    ...candidate.preview,
    publication_digest: candidate.publication_digest,
  };
  if (
    !(await fsReadFile(resolve(input.candidate_dir, "preview.json"))).equals(
      stable(preview),
    )
  )
    throw new Error("publication-preview-drift");
  if (
    !(await fsReadFile(resolve(input.candidate_dir, "preview.md"))).equals(
      previewMarkdown(preview),
    )
  )
    throw new Error("publication-preview-drift");
  if (candidate.preview.receipt_plan.path !== input.receipt_path)
    throw new Error("publication-receipt-path-mismatch");
  const copiedReceipt = await fsReadFile(
    resolve(input.candidate_dir, "update-receipt.json"),
  );
  if (digest(copiedReceipt) !== candidate.copied_update_receipt.digest)
    throw new Error("publication-update-receipt-drift");
  const update = appliedReceipt(
    parseStrictJson(
      decodeCanonicalText(copiedReceipt, "update-receipt.json"),
      "update-receipt.json",
    ),
  );
  if (
    update.base_commit !== candidate.preview.head.pre_commit_head_sha ||
    update.result_tree.git_tree_sha !==
      candidate.preview.worktree.git_tree_sha ||
    update.result_tree.inventory_digest !==
      candidate.preview.worktree.inventory_digest ||
    update.result_tree.unstaged_diff_digest !==
      candidate.preview.worktree.unstaged_diff_digest
  )
    throw new Error("publication-update-receipt-drift");
  for (const support of candidate.support_files) {
    if (!/^\.\/schemas\/[A-Za-z0-9._-]+\.json$/.test(support.path))
      throw new Error("publication-support-file-invalid");
    const bytes = await fsReadFile(
      resolve(input.candidate_dir, support.path.slice(2)),
    );
    if (digest(bytes) !== support.digest)
      throw new Error("publication-support-file-drift");
  }
  return candidate;
}

async function assertPublicationPreflight(
  preview: EnginePublicationCandidateManifest["preview"],
  dependencies: EnginePublicationDependencies,
  phase: "before-commit" | "before-push" | "before-pull-request",
  expected: {
    head?: string;
    tree?: string;
    diff?: Sha256Digest;
    changed_paths?: string[];
    env?: Readonly<Record<string, string>>;
  } = {},
): Promise<void> {
  const worktree = preview.worktree.path;
  const env = expected.env;
  const branch = await gitText(
    dependencies,
    worktree,
    ["symbolic-ref", "--short", "HEAD"],
    env,
  );
  const head = await gitText(
    dependencies,
    worktree,
    ["rev-parse", "HEAD"],
    env,
  );
  if (
    branch !== preview.head.branch ||
    head !== (expected.head ?? preview.head.pre_commit_head_sha)
  )
    throw new Error(`publication-${phase}-head-drift`);
  const tree = await gitText(
    dependencies,
    worktree,
    ["rev-parse", "HEAD^{tree}"],
    env,
  );
  if (tree !== (expected.tree ?? preview.worktree.base_index_tree_sha))
    throw new Error(`publication-${phase}-base-tree-drift`);
  const diff = await git(
    dependencies,
    worktree,
    ["diff", "--binary", "--no-ext-diff"],
    env,
  );
  if (digest(diff) !== (expected.diff ?? preview.worktree.unstaged_diff_digest))
    throw new Error(`publication-${phase}-diff-drift`);
  const status = await git(
    dependencies,
    worktree,
    ["status", "--porcelain=v1", "-z"],
    env,
  );
  const changed = status
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((value) => `./${value.slice(3).replace(/^\.\//, "")}`)
    .sort();
  if (
    changed.length !==
      (expected.changed_paths ?? preview.worktree.changed_paths).length ||
    changed.some(
      (value, index) =>
        value !==
        (expected.changed_paths ?? preview.worktree.changed_paths)[index],
    )
  )
    throw new Error(`publication-${phase}-paths-drift`);
  const repository = await dependencies.observe_repository(
    preview.repository.origin_url,
    preview.head.branch,
  );
  if (
    repository.id !== preview.repository.id ||
    repository.default_branch !== preview.base.branch ||
    repository.default_branch_sha !== preview.base.remote_sha
  )
    throw new Error(`publication-${phase}-remote-drift`);
  const hooks = await fsLstat(preview.git_isolation.empty_hooks_path);
  if (!hooks.isDirectory() || hooks.isSymbolicLink())
    throw new Error(`publication-${phase}-hooks-drift`);
  const hookEntries = await (
    await import("node:fs/promises")
  ).readdir(preview.git_isolation.empty_hooks_path);
  if (hookEntries.length !== 0)
    throw new Error(`publication-${phase}-hooks-drift`);
  const configuredResult = await dependencies.run_git({
    cwd: worktree,
    args: ["config", "--get-regexp", "^filter\\..*\\.(clean|smudge|process)$"],
    env: {
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      ...(env ?? {}),
    },
  });
  if (configuredResult.exit_code !== 0 && configuredResult.exit_code !== 1)
    throw new Error(`publication-${phase}-filters-drift`);
  if (configuredResult.stdout.length > 0)
    throw new Error(`publication-${phase}-filters-drift`);
  if (phase === "before-commit") {
    const existing = await dependencies.observe_pull_request({
      repository_id: preview.repository.id,
      origin_url: preview.repository.origin_url,
      base: preview.base.branch,
      head: preview.head.branch,
    });
    if (existing) throw new Error("publication-pull-request-already-exists");
  }
}

async function writePublicationJournal(
  path: string,
  value: Record<string, unknown>,
): Promise<void> {
  await writeAtomic(path, stable(value));
}

export function createEnginePublicationDependencies(): EnginePublicationDependencies {
  const execute = promisify(execFile);
  const run_git = async ({
    cwd,
    args,
    env,
  }: {
    cwd: string;
    args: string[];
    env?: Readonly<Record<string, string>>;
  }): Promise<CommandResult> => {
    try {
      const result = await execute("git", args, {
        cwd,
        env: { ...process.env, ...(env ?? {}) },
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
  };
  const gh = async (args: string[], cwd: string): Promise<Buffer> => {
    try {
      const result = await execute("gh", args, { cwd, encoding: "buffer" });
      return Buffer.from(result.stdout);
    } catch {
      throw new Error("github-observation-failed");
    }
  };
  return {
    run_git,
    observe_repository: async (origin_url, head_branch) => {
      const repositoryPath = githubApiRepositoryPath(origin_url);
      const value = jsonObject(
        JSON.parse(
          (await gh(["api", repositoryPath], process.cwd())).toString("utf8"),
        ),
      );
      const defaultBranch = String(value.default_branch ?? "");
      const ref = jsonObject(
        JSON.parse(
          (
            await gh(
              ["api", `${repositoryPath}/git/ref/heads/${defaultBranch}`],
              process.cwd(),
            )
          ).toString("utf8"),
        ),
      );
      return {
        id: String(value.id),
        default_branch: defaultBranch,
        default_branch_sha: String(jsonObject(ref.object).sha ?? ""),
        ...(head_branch
          ? {
              head_ref_sha: String(
                jsonObject(
                  JSON.parse(
                    (
                      await gh(
                        [
                          "api",
                          `${repositoryPath}/git/ref/heads/${head_branch}`,
                        ],
                        process.cwd(),
                      )
                    ).toString("utf8"),
                  ).object,
                ).sha ?? "",
              ),
            }
          : {}),
      };
    },
    observe_pull_request: async (input) => {
      if (!input.origin_url) return null;
      const repositoryPath = githubApiRepositoryPath(input.origin_url);
      const encodedHead = encodeURIComponent(input.head);
      const encodedBase = encodeURIComponent(input.base);
      const value = JSON.parse(
        (
          await gh(
            [
              "api",
              `${repositoryPath}/pulls?state=open&head=${encodedHead}&base=${encodedBase}`,
            ],
            process.cwd(),
          )
        ).toString("utf8"),
      );
      if (!Array.isArray(value) || value.length === 0) return null;
      const pr = jsonObject(value[0]);
      const base = jsonObject(pr.base);
      const head = jsonObject(pr.head);
      return {
        url: String(pr.html_url ?? ""),
        repository_id: input.repository_id,
        state: "open",
        base: String(base.ref ?? ""),
        head: String(head.ref ?? ""),
        title: String(pr.title ?? ""),
        body: String(pr.body ?? ""),
      };
    },
    create_pull_request: async (input) => ({
      url: String(
        jsonObject(
          JSON.parse(
            (
              await gh(
                [
                  "api",
                  "--method",
                  "POST",
                  `${githubApiRepositoryPath(input.origin_url ?? "")}/pulls`,
                  "-f",
                  `base=${input.base}`,
                  "-f",
                  `head=${input.head}`,
                  "-f",
                  `title=${input.title}`,
                  "-f",
                  `body=${input.body}`,
                ],
                process.cwd(),
              )
            ).toString("utf8"),
          ),
        ).html_url ?? "",
      ),
    }),
  };
}

export async function applyEnginePublication(
  input: ApplyEnginePublicationInput,
  dependencies: EnginePublicationDependencies,
): Promise<EnginePublicationReceipt> {
  const candidate = await loadPublicationCandidate(input);
  const preview = candidate.preview;
  const journalPath = preview.receipt_plan.journal_path;
  try {
    const existing = await fsLstat(input.receipt_path);
    if (existing.isSymbolicLink() || !existing.isFile())
      throw new Error("publication-receipt-path-invalid");
    const value = await readJson(input.receipt_path);
    if (value.publication_digest !== candidate.publication_digest)
      throw new Error("publication-receipt-digest-mismatch");
    return value as unknown as EnginePublicationReceipt;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await requireNewExternal(input.receipt_path, [
    input.candidate_dir,
    preview.worktree.path,
  ]);
  if (!outside(journalPath, [input.candidate_dir, preview.worktree.path]))
    throw new Error("publication-journal-path-invalid");
  const candidateBytes = await fsReadFile(
    resolve(input.candidate_dir, "publication-candidate.json"),
  );
  const intent = {
    schema_version: "1.0.0",
    publication_digest: candidate.publication_digest,
    candidate_bytes_digest: digest(candidateBytes),
    receipt_path: input.receipt_path,
    journal_path: journalPath,
    state: { phase: "intent", known_completed_effects: [] },
  };
  await writePublicationJournal(journalPath, intent);
  const env = {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_INDEX_FILE: preview.git_isolation.temporary_index,
  };
  const worktree = preview.worktree.path;
  const invalidated = async (
    reason: string,
  ): Promise<EnginePublicationReceipt> => {
    const receipt: InvalidatedEnginePublicationReceipt = {
      schema_version: "1.0.0",
      publication_digest: candidate.publication_digest,
      status: "invalidated",
      reason_codes: [reason],
      completed_effects: [],
    };
    await writePublicationJournal(journalPath, {
      ...intent,
      state: {
        phase: "invalidated",
        known_completed_effects: [],
        reason_codes: [reason],
      },
    });
    await writeAtomic(input.receipt_path, stable(receipt));
    return receipt;
  };
  const partial = async (
    receipt: EnginePublicationReceipt,
    phase: string,
    known: string[],
  ): Promise<EnginePublicationReceipt> => {
    await writePublicationJournal(journalPath, {
      ...intent,
      state: { phase, known_completed_effects: known },
    });
    await writeAtomic(input.receipt_path, stable(receipt));
    return receipt;
  };
  try {
    await assertPublicationPreflight(preview, dependencies, "before-commit");
  } catch (error) {
    return invalidated(
      error instanceof Error ? error.message : "preflight-failed",
    );
  }
  await writePublicationJournal(journalPath, {
    ...intent,
    state: {
      phase: "attempting",
      known_completed_effects: [],
      attempted_effect: "commit",
    },
  });
  const readTree = await dependencies.run_git({
    cwd: worktree,
    args: ["read-tree", preview.commit.parent_sha],
    env,
  });
  if (readTree.exit_code !== 0)
    return invalidated(commandResult(readTree, ["git", "read-tree"]));
  const committed = await dependencies.run_git({
    cwd: worktree,
    args: ["add", "-A"],
    env,
  });
  if (committed.exit_code !== 0)
    return invalidated(commandResult(committed, ["git", "add", "-A"]));
  const treeResult = await dependencies.run_git({
    cwd: worktree,
    args: ["write-tree"],
    env,
  });
  if (treeResult.exit_code !== 0)
    return partial(
      {
        schema_version: "1.0.0",
        publication_digest: candidate.publication_digest,
        status: "partial_remote_result",
        known_completed_effects: [],
        indeterminate_effect: "commit",
        returned_identifiers: {},
        observed_identifiers: {},
        recovery: ["Review the publication journal before retrying."],
      },
      "indeterminate",
      [],
    );
  const tree = treeResult.stdout.toString("utf8").trim();
  if (tree !== preview.worktree.git_tree_sha)
    return invalidated("publication-result-tree-drift");
  const commitResult = await dependencies.run_git({
    cwd: worktree,
    args: [
      "commit-tree",
      treeResult.stdout.toString("utf8").trim(),
      "-p",
      preview.commit.parent_sha,
      "-m",
      preview.commit.message,
    ],
    env: {
      ...env,
      GIT_AUTHOR_NAME: preview.commit.author_name,
      GIT_AUTHOR_EMAIL: preview.commit.author_email,
      GIT_COMMITTER_NAME: preview.commit.committer_name,
      GIT_COMMITTER_EMAIL: preview.commit.committer_email,
      GIT_AUTHOR_DATE: preview.commit.authored_at,
      GIT_COMMITTER_DATE: preview.commit.committed_at,
    },
  });
  if (commitResult.exit_code !== 0)
    return partial(
      {
        schema_version: "1.0.0",
        publication_digest: candidate.publication_digest,
        status: "partial_remote_result",
        known_completed_effects: [],
        indeterminate_effect: "commit",
        returned_identifiers: {},
        observed_identifiers: {},
        recovery: ["Review the publication journal before retrying."],
      },
      "indeterminate",
      [],
    );
  const commitSha = commitResult.stdout.toString("utf8").trim();
  const updateRef = await dependencies.run_git({
    cwd: worktree,
    args: [
      "update-ref",
      `refs/heads/${preview.head.branch}`,
      commitSha,
      preview.commit.parent_sha,
    ],
    env,
  });
  if (updateRef.exit_code !== 0)
    return partial(
      {
        schema_version: "1.0.0",
        publication_digest: candidate.publication_digest,
        status: "partial_remote_result",
        known_completed_effects: [],
        indeterminate_effect: "commit",
        returned_identifiers: { commit_sha: commitSha },
        observed_identifiers: {},
        recovery: [
          "The child commit exists; inspect the journal and branch before retrying.",
        ],
      },
      "indeterminate",
      [],
    );
  await writePublicationJournal(journalPath, {
    ...intent,
    state: { phase: "committed", known_completed_effects: ["commit"] },
  });
  try {
    await assertPublicationPreflight(preview, dependencies, "before-push", {
      head: commitSha,
      tree: preview.worktree.git_tree_sha,
      diff: digest(Buffer.alloc(0)),
      changed_paths: [],
      env,
    });
  } catch (error) {
    return partial(
      {
        schema_version: "1.0.0",
        publication_digest: candidate.publication_digest,
        status: "partial_remote_result",
        commit_sha: commitSha,
        completed_effects: ["commit"],
        recovery: [error instanceof Error ? error.message : "preflight-failed"],
      },
      "committed",
      ["commit"],
    );
  }
  await writePublicationJournal(journalPath, {
    ...intent,
    state: {
      phase: "attempting",
      known_completed_effects: ["commit"],
      attempted_effect: "push",
    },
  });
  const push = await dependencies.run_git({
    cwd: worktree,
    args: [
      "-c",
      `core.hooksPath=${preview.git_isolation.empty_hooks_path}`,
      "push",
      "origin",
      preview.head.push_refspec,
    ],
    env,
  });
  const observed = await dependencies.observe_repository(
    preview.repository.origin_url,
    preview.head.branch,
  );
  if (push.exit_code !== 0 || observed.head_ref_sha !== commitSha)
    return partial(
      {
        schema_version: "1.0.0",
        publication_digest: candidate.publication_digest,
        status: "partial_remote_result",
        commit_sha: commitSha,
        completed_effects: ["commit"],
        recovery: ["Reconcile the remote head before retrying the push."],
      },
      "committed",
      ["commit"],
    );
  await writePublicationJournal(journalPath, {
    ...intent,
    state: { phase: "pushed", known_completed_effects: ["commit", "push"] },
  });
  try {
    await assertPublicationPreflight(
      preview,
      dependencies,
      "before-pull-request",
      {
        head: commitSha,
        tree: preview.worktree.git_tree_sha,
        diff: digest(Buffer.alloc(0)),
        changed_paths: [],
        env,
      },
    );
  } catch (error) {
    return partial(
      {
        schema_version: "1.0.0",
        publication_digest: candidate.publication_digest,
        status: "partial_remote_result",
        commit_sha: commitSha,
        remote_head_sha: commitSha,
        completed_effects: ["commit", "push"],
        recovery: [error instanceof Error ? error.message : "preflight-failed"],
      },
      "pushed",
      ["commit", "push"],
    );
  }
  const existingPr = await dependencies.observe_pull_request({
    repository_id: preview.repository.id,
    origin_url: preview.repository.origin_url,
    base: preview.base.branch,
    head: preview.head.branch,
  });
  let pr = existingPr ? { url: existingPr.url } : undefined;
  if (!pr) {
    await writePublicationJournal(journalPath, {
      ...intent,
      state: {
        phase: "attempting",
        known_completed_effects: ["commit", "push"],
        attempted_effect: "pull-request",
      },
    });
    pr = await dependencies.create_pull_request({
      repository_id: preview.repository.id,
      origin_url: preview.repository.origin_url,
      base: preview.base.branch,
      head: preview.head.branch,
      title: preview.pull_request.title,
      body: preview.pull_request.body,
    });
  }
  const observedPr = await dependencies.observe_pull_request({
    repository_id: preview.repository.id,
    origin_url: preview.repository.origin_url,
    base: preview.base.branch,
    head: preview.head.branch,
  });
  if (
    !observedPr ||
    observedPr.url !== pr.url ||
    observedPr.base !== preview.base.branch ||
    observedPr.head !== preview.head.branch ||
    observedPr.title !== preview.pull_request.title ||
    observedPr.body !== preview.pull_request.body
  )
    return partial(
      {
        schema_version: "1.0.0",
        publication_digest: candidate.publication_digest,
        status: "partial_remote_result",
        commit_sha: commitSha,
        remote_head_sha: commitSha,
        known_completed_effects: ["commit", "push"],
        indeterminate_effect: "pull-request",
        returned_identifiers: { url: pr.url },
        observed_identifiers: observedPr ? { url: observedPr.url } : {},
        recovery: ["Inspect the open pull request before retrying."],
      },
      "indeterminate",
      ["commit", "push"],
    );
  await writePublicationJournal(journalPath, {
    ...intent,
    state: {
      phase: "pull-request-created",
      known_completed_effects: ["commit", "push", "pull-request"],
    },
  });
  const receipt: PublishedEnginePublicationReceipt = {
    schema_version: "1.0.0",
    publication_digest: candidate.publication_digest,
    status: "published",
    commit_sha: commitSha,
    remote_head_sha: observed.head_ref_sha,
    pull_request: observedPr,
    completed_effects: ["commit", "push", "pull-request"],
  };
  try {
    await writeAtomic(input.receipt_path, stable(receipt));
  } catch {
    return {
      schema_version: "1.0.0",
      publication_digest: candidate.publication_digest,
      status: "partial_remote_result",
      commit_sha: commitSha,
      remote_head_sha: observed.head_ref_sha,
      pull_request: observedPr,
      known_completed_effects: ["commit", "push", "pull-request"],
      indeterminate_effect: "receipt-finalization",
      returned_identifiers: { url: observedPr.url },
      observed_identifiers: { url: observedPr.url },
      recovery: [
        "The remote publication is complete; write the final receipt before continuing.",
      ],
    };
  }
  await writePublicationJournal(journalPath, {
    ...intent,
    state: {
      phase: "finalized",
      known_completed_effects: ["commit", "push", "pull-request"],
    },
  });
  return receipt;
}
