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
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import type { CandidateReceipt, CandidateRequest } from "../tools/candidate.ts";
import { isInstanceGraph, validateKnowledge } from "../tools/knowledge.ts";
import { createSnapshot } from "../tools/snapshot.ts";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "..");
const sourceRequestPath = resolve(
  projectRoot,
  "tests/fixtures/son-input/first-note-request.json",
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
  return command("git", args, root);
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
  for (const path of paths)
    files.set(path, await readFile(resolve(projectRoot, ...path.split("/"))));
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
    const status = await lstat(source);
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
      expect(await runCc(downstream, "generate", "--format", "json")).toBe(
        "[]\n",
      );

      const request = JSON.parse(
        await readFile(sourceRequestPath, "utf8"),
      ) as CandidateRequest;
      expect(request.mode).toBe("make-mine");
      expect(request.instance_configuration).toBeDefined();
      if (!request.instance_configuration) return;
      expect(request.entity_changes).toHaveLength(3);
      expect(request.note_changes).toHaveLength(1);
      const requestedNote = request.note_changes[0]!;
      expect(requestedNote.action).toBe("create");
      const requestedCitations = requestedNote.value.sources.map(
        withoutRetrievalFields,
      );

      await git(downstream, "init", "--initial-branch=main");
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
      await mkdir(dirname(requestCopy), { recursive: true });
      await copyFile(sourceRequestPath, requestCopy);

      const prepared = await runCcJson<PrepareOutput>(
        downstream,
        "candidate",
        "prepare",
        "--request",
        requestCopy,
        "--out",
        candidate,
      );
      expect(prepared.candidate_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      const preview = JSON.parse(
        await readFile(prepared.preview_json, "utf8"),
      ) as PreviewFile;
      expect(preview.candidate_digest).toBe(prepared.candidate_digest);
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

      const receipt = await runCcJson<CandidateReceipt>(
        downstream,
        "candidate",
        "apply",
        "--dir",
        candidate,
        "--approve",
        prepared.candidate_digest,
      );
      expect(receipt).toMatchObject({
        candidate_digest: prepared.candidate_digest,
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
  }, 15_000);
});
