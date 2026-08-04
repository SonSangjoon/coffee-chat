import { execFile } from "node:child_process";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  applyCandidate,
  prepareCandidate,
  type CandidateReceipt,
  type CandidateRequest,
} from "../tools/candidate.ts";
import { isInstanceGraph, validateKnowledge } from "../tools/knowledge.ts";
import { createSnapshot } from "../tools/snapshot.ts";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "..");
const sourceRequestPath = resolve(
  projectRoot,
  "tests/fixtures/example-input/first-note-request.json",
);
const uuidV4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type PrepareOutput = {
  candidate_digest: string;
  preview_json: string;
  preview_md: string;
};

type PreviewFile = {
  candidate_digest: string;
  validation: { status: string };
  notes: Array<{
    id: string;
    title: string;
    temporal_coverage: string;
    recorded_on: string;
    sources: Array<{
      url: string;
      title: string;
      published_on?: string;
      accessed_on?: string;
    }>;
    entities: string[];
    body: string;
  }>;
  entities: Array<{
    id: string;
    label: string;
    aliases?: string[];
    kind?: string;
    same_as?: string[];
    change?: string;
  }>;
  source_observations: Array<{
    note_id: string;
    url: string;
    title: string;
    published_on?: string;
    accessed_on?: string;
    retrieval_status: string;
    access_limitation?: string;
  }>;
};

async function command(
  executable: string,
  args: string[],
  cwd: string,
): Promise<string> {
  const result = await execFileAsync(executable, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return result.stdout;
}

async function git(root: string, ...args: string[]): Promise<string> {
  return (await command("git", args, root)).trim();
}

async function runCc(root: string, ...args: string[]): Promise<string> {
  return command(
    process.execPath,
    ["--experimental-strip-types", resolve(root, "tools/cc.ts"), ...args],
    root,
  );
}

async function runCcJson<T>(root: string, ...args: string[]): Promise<T> {
  return JSON.parse(await runCc(root, ...args)) as T;
}

async function listedPaths(
  root: string,
  options: string[] = ["--cached"],
): Promise<string[]> {
  return (await git(root, "ls-files", "-z", ...options))
    .split("\0")
    .filter(Boolean);
}

async function engineState(): Promise<{
  files: Map<string, Buffer>;
  status: string;
}> {
  const paths = await listedPaths(projectRoot);
  const files = new Map<string, Buffer>();
  for (const path of paths) {
    try {
      files.set(path, await readFile(resolve(projectRoot, ...path.split("/"))));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return {
    files,
    status: await git(
      projectRoot,
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
    ),
  };
}

async function copyEngineWorktree(target: string): Promise<void> {
  const paths = await listedPaths(projectRoot, [
    "--cached",
    "--others",
    "--exclude-standard",
  ]);
  for (const path of paths) {
    const source = resolve(projectRoot, ...path.split("/"));
    const destination = resolve(target, ...path.split("/"));
    await mkdir(dirname(destination), { recursive: true });
    let status: Awaited<ReturnType<typeof lstat>>;
    try {
      status = await lstat(source);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (status.isSymbolicLink())
      await symlink(await readlink(source), destination);
    else {
      await copyFile(source, destination);
      await chmod(destination, status.mode & 0o777);
    }
  }
}

function withoutRetrievalFields(
  source: CandidateRequest["note_changes"][number]["value"]["sources"][number],
) {
  const {
    retrieval_status: _retrievalStatus,
    access_limitation: _accessLimitation,
    ...citation
  } = source;
  return citation;
}

function sortByUrl<T extends { url: string }>(values: T[]): T[] {
  return [...values].sort((left, right) =>
    left.url < right.url ? -1 : left.url > right.url ? 1 : 0,
  );
}

describe("Task 5 disposable Make mine acceptance", () => {
  it("applies the exact input fixture without mutating the engine checkout", async () => {
    const before = await engineState();
    const temporaryRoot = await mkdtemp(
      resolve(tmpdir(), "coffee-chat-make-mine-"),
    );
    try {
      const downstream = resolve(temporaryRoot, "downstream");
      const requestCopy = resolve(temporaryRoot, "request/request.json");
      const candidate = resolve(temporaryRoot, "candidate");
      await mkdir(downstream);
      await copyEngineWorktree(downstream);
      await symlink(
        resolve(projectRoot, "node_modules"),
        resolve(downstream, "node_modules"),
        "dir",
      );
      const request = JSON.parse(
        await readFile(sourceRequestPath, "utf8"),
      ) as CandidateRequest;
      expect(request.mode).toBe("make-mine");
      expect(request.instance_configuration).toBeDefined();
      if (!request.instance_configuration) return;
      expect(request.entity_changes).toHaveLength(1);
      expect(request.note_changes).toHaveLength(1);
      const requestedNote = request.note_changes[0]!;
      expect(requestedNote.action).toBe("create");
      const requestedCitations = requestedNote.value.sources.map(
        withoutRetrievalFields,
      );

      await git(downstream, "init", "--initial-branch=main");
      await writeFile(
        resolve(downstream, ".git/info/exclude"),
        "node_modules\n",
      );
      await git(downstream, "config", "user.name", "Coffee Chat Test");
      await git(downstream, "config", "user.email", "test@example.com");
      await git(
        downstream,
        "remote",
        "add",
        "origin",
        request.instance_configuration.repository.url,
      );
      await git(downstream, "add", "--all");
      await git(downstream, "commit", "-m", "Initialize downstream engine");
      expect(await runCc(downstream, "generate", "--format", "json")).toBe(
        "[]\n",
      );
      await git(downstream, "add", "engine");
      await git(downstream, "commit", "--amend", "--no-edit");
      await mkdir(dirname(requestCopy), { recursive: true });
      const requestForCandidate = structuredClone(request);
      const release = JSON.parse(
        await readFile(resolve(downstream, "engine/release.json"), "utf8"),
      ) as { version: string; source_ref: string; release_digest: string };
      const surface = JSON.parse(
        await readFile(
          resolve(downstream, "engine/template-surface.json"),
          "utf8",
        ),
      ) as { surface_digest: string };
      const initialCommit = await git(
        downstream,
        "rev-list",
        "--max-parents=0",
        "HEAD",
      );
      const initialTree = await git(
        downstream,
        "rev-parse",
        `${initialCommit}^{tree}`,
      );
      const configuration = requestForCandidate.instance_configuration!;
      configuration.provenance.engine.version = release.version;
      configuration.provenance.engine.source_commit = initialCommit;
      configuration.provenance.engine.release_digest =
        release.release_digest as `sha256:${string}`;
      configuration.template_observation.source_default_commit = initialCommit;
      configuration.template_observation.source_default_tree = initialTree;
      configuration.template_observation.source_release_ref =
        release.source_ref;
      configuration.template_observation.source_release_commit = initialCommit;
      configuration.template_observation.source_release_tree = initialTree;
      configuration.template_observation.release_digest =
        release.release_digest as `sha256:${string}`;
      configuration.template_observation.template_surface_digest =
        surface.surface_digest as `sha256:${string}`;
      configuration.template_observation.target_initial_commit = initialCommit;
      configuration.template_observation.target_initial_tree = initialTree;
      await writeFile(
        requestCopy,
        `${JSON.stringify(requestForCandidate, null, 2)}\n`,
      );

      const candidateDependencies = {
        observeTemplate: async (
          expected: NonNullable<
            CandidateRequest["instance_configuration"]
          >["template_observation"],
        ) => expected,
      };
      const prepared = await prepareCandidate(
        { root: downstream, requestPath: requestCopy, out: candidate },
        candidateDependencies,
      );
      expect(prepared.candidateDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
      const preview = JSON.parse(
        await readFile(prepared.previewJson, "utf8"),
      ) as PreviewFile;
      expect(preview.candidate_digest).toBe(prepared.candidateDigest);
      expect(preview.validation).toEqual({ status: "passed" });
      expect(preview.notes).toHaveLength(1);
      expect(preview.notes[0]).toMatchObject({
        title: requestedNote.value.title,
        temporal_coverage: requestedNote.value.temporal_coverage,
        body: requestedNote.value.body,
        sources: requestedCitations,
      });
      expect(preview.notes[0]!.sources).toEqual(requestedCitations);

      const requestedEntities = request.entity_changes
        .filter((change) => change.action === "create")
        .map((change) => change.value)
        .sort((left, right) => left.label.localeCompare(right.label));
      const previewEntities = preview.entities
        .map(({ id: _id, change: _change, ...entity }) => entity)
        .sort((left, right) => left.label.localeCompare(right.label));
      expect(previewEntities).toEqual(requestedEntities);

      const expectedObservations = requestedNote.value.sources.map(
        (source) => ({ ...source }),
      );
      const previewObservations = preview.source_observations.map(
        ({ note_id: _noteId, ...source }) => source,
      );
      expect(sortByUrl(previewObservations)).toEqual(
        sortByUrl(expectedObservations),
      );

      const receipt = (await applyCandidate(
        {
          root: downstream,
          candidateDir: candidate,
          approvedDigest: prepared.candidateDigest,
        },
        candidateDependencies,
      )) as CandidateReceipt;
      expect(receipt).toMatchObject({
        candidate_digest: prepared.candidateDigest,
        status: "applied",
        validation: { status: "passed" },
      });
      expect(
        await runCc(
          downstream,
          "validate",
          "--snapshot",
          "worktree",
          "--format",
          "json",
        ),
      ).toBe("[]\n");
      expect(
        await runCc(
          downstream,
          "check",
          "--snapshot",
          "worktree",
          "--format",
          "json",
        ),
      ).toBe("[]\n");

      const snapshot = await createSnapshot(downstream, "worktree");
      const validation = await validateKnowledge(snapshot);
      expect(validation.diagnostics).toEqual([]);
      expect(validation.graph && isInstanceGraph(validation.graph)).toBe(true);
      if (!validation.graph || !isInstanceGraph(validation.graph)) return;
      const { temporary_key: _temporaryProfileKey, ...expectedProfile } =
        request.instance_configuration.profile;
      expect(validation.graph.manifest.profile).toMatchObject(expectedProfile);
      expect(validation.graph.notes).toHaveLength(1);
      expect(validation.graph.notes[0]!.frontmatter.sources).toEqual(
        requestedCitations,
      );
      expect(validation.graph.notes[0]!.body).toBe(
        `\n${requestedNote.value.body}\n`,
      );

      const identifiers = [
        validation.graph.manifest.profile.id,
        ...validation.graph.entities.map((entity) => entity.id),
        ...validation.graph.notes.map((note) => note.frontmatter.id),
      ];
      expect(identifiers).toHaveLength(
        1 + request.entity_changes.length + request.note_changes.length,
      );
      for (const id of identifiers) expect(id).toMatch(uuidV4);
      expect(new Set(identifiers).size).toBe(identifiers.length);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
      await expect(lstat(temporaryRoot)).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(await engineState()).toEqual(before);
    }
  }, 30_000);
});
