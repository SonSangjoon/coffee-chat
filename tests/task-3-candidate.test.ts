import { execFile } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyCandidate,
  nodeFileSystem,
  prepareCandidate,
  type CandidateDependencies,
  type CandidateFileSystem,
  type CandidateManifest,
  type MutationPoint,
} from "../tools/candidate.ts";
import {
  canonicalizeJson,
  checkGeneratedIndex,
  generatedIndexBytes,
} from "../tools/generate.ts";
import {
  isInstanceGraph,
  sha256,
  validateKnowledge,
} from "../tools/knowledge.ts";
import { createSnapshot } from "../tools/snapshot.ts";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "..");
const fixtureRoot = resolve(import.meta.dirname, "fixtures/initialized-valid");
const temporaryRoots: string[] = [];
const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const ENTITY_ID = "22222222-2222-4222-8222-222222222222";
const NOTE_ID = "33333333-3333-4333-8333-333333333333";
const SECOND_ENTITY_ID = "44444444-4444-4444-8444-444444444444";
const THIRD_ENTITY_ID = "55555555-5555-4555-8555-555555555555";
const EXISTING_ENTITY_ID = "48d1c840-5d38-48d0-8e74-7187d9f0c2fd";
const EXISTING_NOTE_ID = "a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61";
const OTHER_NOTE_ID = "b52d8b79-8247-4dce-96e8-35beb40137bc";

type RepositoryFixture = {
  base: string;
  root: string;
  requestPath: string;
  out: string;
};

async function git(root: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd: root,
    encoding: "utf8",
  });
  return result.stdout.trim();
}

async function makeRepository(
  state: "pending" | "initialized" = "pending",
): Promise<RepositoryFixture> {
  const base = await mkdtemp(resolve(tmpdir(), "coffee-chat-task-3-"));
  temporaryRoots.push(base);
  const root = resolve(base, "repository");
  await mkdir(root);
  await symlink(
    resolve(projectRoot, "node_modules"),
    resolve(root, "node_modules"),
    "dir",
  );
  if (state === "initialized") {
    await cp(fixtureRoot, root, { recursive: true });
  } else {
    await cp(
      resolve(projectRoot, "coffee-chat.json"),
      resolve(root, "coffee-chat.json"),
    );
    await mkdir(resolve(root, "knowledge/notes"), { recursive: true });
  }
  await mkdir(resolve(root, "docs"), { recursive: true });
  // Both engine and instance README projections expose the content terms link.
  await cp(
    resolve(projectRoot, "CONTENT_LICENSE.md"),
    resolve(root, "CONTENT_LICENSE.md"),
  );
  await Promise.all([
    cp(resolve(projectRoot, "schemas"), resolve(root, "schemas"), {
      recursive: true,
    }),
    cp(resolve(projectRoot, "tools"), resolve(root, "tools"), {
      recursive: true,
    }),
    cp(resolve(projectRoot, "engine"), resolve(root, "engine"), {
      recursive: true,
    }),
    cp(
      resolve(projectRoot, "docs/testing.md"),
      resolve(root, "docs/testing.md"),
    ),
  ]);
  if (state === "pending") {
    const surface = JSON.parse(
      await readFile(
        resolve(projectRoot, "engine/template-surface.json"),
        "utf8",
      ),
    ) as { files: Array<{ path: string; disposition: string }> };
    for (const file of surface.files.filter(
      (entry) => entry.disposition === "adopt-engine-source",
    )) {
      const relativePath = file.path.replace(/^\.\//, "");
      const source = resolve(projectRoot, relativePath);
      const destination = resolve(root, relativePath);
      await mkdir(dirname(destination), { recursive: true });
      await cp(source, destination, { recursive: true });
    }
  }
  await git(root, "init", "-q");
  await writeFile(resolve(root, ".git/info/exclude"), "node_modules\n");
  await git(root, "config", "user.email", "candidate@example.com");
  await git(root, "config", "user.name", "Candidate Test");
  await git(
    root,
    "remote",
    "add",
    "origin",
    state === "initialized"
      ? "https://github.com/example/coffee-chat.git"
      : "git@github.com:example/candidate.git",
  );
  await git(root, "add", ".");
  await git(root, "commit", "-qm", "fixture");
  if (state === "pending")
    try {
      await execFileAsync(
        process.execPath,
        [
          "--experimental-strip-types",
          resolve(root, "tools/cc.ts"),
          "generate",
          "--format",
          "json",
        ],
        { cwd: root, encoding: "utf8" },
      );
    } catch {
      throw new Error("Fixture engine generation failed.");
    }
  if (state === "pending") await git(root, "add", ".");
  await git(root, "commit", "--amend", "--no-edit", "-q");
  return {
    base,
    root,
    requestPath: resolve(base, "request.json"),
    out: resolve(base, "candidate"),
  };
}

function makeMineRequest(setupEffects: string[] = []): Record<string, unknown> {
  return {
    schema_version: "1.0.0",
    mode: "make-mine",
    instance_configuration: {
      profile: {
        temporary_key: "owner_profile",
        display_name: "Candidate Owner",
        short_name: "Candidate",
      },
      time_zone: "Asia/Seoul",
      repository: {
        url: "https://github.com/example/candidate",
        default_branch: "main",
      },
      pages_url: "https://example.github.io/candidate/",
      plugin: {
        name: "coffee-chat-candidate",
        version: "1.0.0",
        description: "Candidate fixture.",
      },
      content_notice:
        "# Candidate Content Notice\n\nCandidate Owner retains ownership of the authored public Notes.\n",
      provenance: {
        engine: {
          repository: "https://github.com/sonsangjoon/coffee-chat",
          version: "1.1.0",
          source_commit: "a".repeat(40),
          release_digest: `sha256:${"b".repeat(64)}`,
        },
        created_from: {
          method: "github-template",
          template_repository: "https://github.com/sonsangjoon/coffee-chat",
        },
      },
      template_observation: {
        source_repository_id: "1",
        source_repository: "https://github.com/sonsangjoon/coffee-chat",
        source_is_template: true,
        source_visibility: "public",
        source_default_branch: "main",
        source_default_commit: "a".repeat(40),
        source_default_tree: "c".repeat(40),
        source_release_ref: "refs/tags/v1.1.0",
        source_release_commit: "a".repeat(40),
        source_release_tree: "c".repeat(40),
        release_digest: `sha256:${"b".repeat(64)}`,
        template_surface_digest: `sha256:${"d".repeat(64)}`,
        target_repository_id: "2",
        target_repository: "https://github.com/example/candidate",
        target_description: "A downstream Coffee Chat instance.",
        template_repository: "https://github.com/sonsangjoon/coffee-chat",
        target_visibility: "public",
        target_default_branch: "main",
        target_initial_commit: "a".repeat(40),
        target_initial_tree: "c".repeat(40),
      },
    },
    entity_changes: [
      {
        action: "create",
        temporary_key: "taste",
        value: { label: "Taste", kind: "concept" },
      },
    ],
    note_changes: [
      {
        action: "create",
        temporary_key: "first_note",
        value: {
          title: "First public Note",
          temporal_coverage: "2026-02/2026-07",
          sources: [
            {
              url: "https://example.com/public-source",
              title: "Public source",
              published_on: "2026-07",
              accessed_on: "2026-07-31",
              retrieval_status: "succeeded",
            },
            {
              url: "https://example.com/unavailable-source",
              title: "Unavailable source",
              retrieval_status: "unavailable",
              access_limitation: "The public page did not respond.",
            },
          ],
          entity_refs: ["taste"],
          body: "A complete public body with a [declared source](https://example.com/public-source).",
        },
      },
    ],
    setup_effects: setupEffects,
  };
}

function updateRequest(): Record<string, unknown> {
  return {
    schema_version: "1.0.0",
    mode: "update",
    entity_changes: [
      {
        action: "update",
        target_id: EXISTING_ENTITY_ID,
        value: {
          label: "Iteration corrected",
          aliases: ["Iteration loop", "Loop"],
          kind: "process",
          same_as: [
            "https://example.com/iteration",
            "https://example.com/iterate",
          ],
        },
      },
    ],
    note_changes: [],
    setup_effects: [],
  };
}

function fixedDependencies(
  ids: string[] = [PROFILE_ID, ENTITY_ID, NOTE_ID],
  date = "2026-08-01T03:00:00.000Z",
): CandidateDependencies {
  const remaining = [...ids];
  return {
    clock: { now: () => new Date(date) },
    uuid: { next: () => remaining.shift() ?? NOTE_ID },
    observeTemplate: async (expected) => expected,
  };
}

async function bindTemplateRequest(
  fixture: RepositoryFixture,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (request.mode !== "make-mine") return request;
  const release = JSON.parse(
    await readFile(resolve(fixture.root, "engine/release.json"), "utf8"),
  ) as { version: string; source_ref: string; release_digest: string };
  const surface = JSON.parse(
    await readFile(
      resolve(fixture.root, "engine/template-surface.json"),
      "utf8",
    ),
  ) as { surface_digest: string };
  const initialCommit = await git(
    fixture.root,
    "rev-list",
    "--max-parents=0",
    "HEAD",
  );
  const initialTree = await git(
    fixture.root,
    "rev-parse",
    `${initialCommit}^{tree}`,
  );
  const configuration = request.instance_configuration as Record<
    string,
    unknown
  >;
  const provenance = configuration.provenance as Record<string, unknown>;
  const engine = provenance.engine as Record<string, unknown>;
  const observation = configuration.template_observation as Record<
    string,
    unknown
  >;
  engine.version = release.version;
  engine.source_commit = initialCommit;
  engine.release_digest = release.release_digest;
  observation.source_default_commit = initialCommit;
  observation.source_default_tree = initialTree;
  observation.source_release_ref = release.source_ref;
  observation.source_release_commit = initialCommit;
  observation.source_release_tree = initialTree;
  observation.release_digest = release.release_digest;
  observation.template_surface_digest = surface.surface_digest;
  observation.target_initial_commit = initialCommit;
  observation.target_initial_tree = initialTree;
  return request;
}

async function writeRequest(
  fixture: RepositoryFixture,
  request: Record<string, unknown>,
): Promise<void> {
  await writeFile(
    fixture.requestPath,
    `${JSON.stringify(await bindTemplateRequest(fixture, request), null, 2)}\n`,
  );
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function resignCandidateManifest(
  fixture: RepositoryFixture,
  mutate: (manifest: Record<string, unknown>) => void,
): Promise<CandidateManifest> {
  const manifest = await readJson<Record<string, unknown>>(
    resolve(fixture.out, "candidate-manifest.json"),
  );
  const oldDigest = manifest.candidate_digest as string;
  mutate(manifest);
  delete manifest.candidate_digest;
  const candidateDigest = sha256(canonicalizeJson(manifest as never));
  manifest.candidate_digest = candidateDigest;
  await writeFile(
    resolve(fixture.out, "candidate-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(
    resolve(fixture.out, "preview.json"),
    `${JSON.stringify(
      {
        schema_version: manifest.schema_version,
        candidate_digest: candidateDigest,
        ...(manifest.preview as Record<string, unknown>),
      },
      null,
      2,
    )}\n`,
  );
  const previewMarkdown = await readFile(
    resolve(fixture.out, "preview.md"),
    "utf8",
  );
  await writeFile(
    resolve(fixture.out, "preview.md"),
    previewMarkdown.replace(oldDigest, candidateDigest),
  );
  return manifest as unknown as CandidateManifest;
}

async function recursiveFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else found.push(relative(root, absolute).replaceAll("\\", "/"));
    }
  }
  await walk(root);
  return found.sort();
}

async function bytesByPath(root: string): Promise<Record<string, string>> {
  return Object.fromEntries(
    await Promise.all(
      (await recursiveFiles(root)).map(async (path) => [
        path,
        (await readFile(resolve(root, path))).toString("base64"),
      ]),
    ),
  );
}

async function canonicalBytes(root: string): Promise<Record<string, string>> {
  const paths = (await recursiveFiles(root)).filter(
    (path) =>
      path === "coffee-chat.json" ||
      path === "CONTENT_LICENSE.md" ||
      path.startsWith("knowledge/") ||
      path.startsWith("method/"),
  );
  return Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => [
        path,
        (await readFile(resolve(root, path))).toString("base64"),
      ]),
    ),
  );
}

function mutationSpyingFileSystem(
  repositoryRoot: string,
  mutations: string[],
  checkpoint: CandidateFileSystem["checkpoint"],
): CandidateFileSystem {
  const record = (operation: string, path: string): void => {
    const pathFromRoot = relative(repositoryRoot, resolve(path));
    if (
      pathFromRoot === "" ||
      (pathFromRoot !== ".." && !pathFromRoot.startsWith("../"))
    )
      mutations.push(`${operation}:${pathFromRoot || "."}`);
  };
  return {
    ...nodeFileSystem,
    checkpoint,
    writeFile: async (path, bytes, options) => {
      record("writeFile", path);
      await nodeFileSystem.writeFile(path, bytes, options);
    },
    open: async (path, flags, mode) => {
      record("open", path);
      return nodeFileSystem.open(path, flags, mode);
    },
    mkdir: async (path, options) => {
      record("mkdir", path);
      return nodeFileSystem.mkdir(path, options);
    },
    rename: async (from, to) => {
      record("rename-from", from);
      record("rename-to", to);
      await nodeFileSystem.rename(from, to);
    },
    unlink: async (path) => {
      record("unlink", path);
      await nodeFileSystem.unlink(path);
    },
    rm: async (path, options) => {
      record("rm", path);
      await nodeFileSystem.rm(path, options);
    },
    chmod: async (path, mode) => {
      record("chmod", path);
      await nodeFileSystem.chmod(path, mode);
    },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Candidate request, mode, action, and temporary-key contracts", () => {
  it("rejects two Entity retirements that both remap the same Note", async () => {
    const fixture = await makeRepository("initialized");
    await writeFile(
      resolve(fixture.root, "knowledge/entities.yml"),
      `${await readFile(resolve(fixture.root, "knowledge/entities.yml"), "utf8")}- id: "${SECOND_ENTITY_ID}"\n  label: "Second retirement target"\n  kind: "concept"\n`,
    );
    const notePath = resolve(
      fixture.root,
      `knowledge/notes/${EXISTING_NOTE_ID}.md`,
    );
    await writeFile(
      notePath,
      (await readFile(notePath, "utf8")).replace(
        `  - "${EXISTING_ENTITY_ID}"`,
        `  - "${EXISTING_ENTITY_ID}"\n  - "${SECOND_ENTITY_ID}"`,
      ),
    );
    const snapshot = await createSnapshot(fixture.root, "worktree");
    const validation = await validateKnowledge(snapshot);
    expect(validation.diagnostics).toEqual([]);
    expect(validation.graph && isInstanceGraph(validation.graph)).toBe(true);
    await writeFile(
      resolve(fixture.root, "knowledge/index.json"),
      generatedIndexBytes(
        validation.graph as Parameters<typeof generatedIndexBytes>[0],
      ),
    );
    await git(fixture.root, "add", ".");
    await git(fixture.root, "commit", "-qm", "add second retirement target");
    await writeRequest(fixture, {
      schema_version: "1.0.0",
      mode: "update",
      entity_changes: [EXISTING_ENTITY_ID, SECOND_ENTITY_ID].map(
        (target_id) => ({
          action: "retire",
          target_id,
          note_remaps: [{ target_id: EXISTING_NOTE_ID, entity_refs: [] }],
        }),
      ),
      note_changes: [],
      setup_effects: [],
    });

    await expect(
      prepareCandidate(
        {
          root: fixture.root,
          requestPath: fixture.requestPath,
          out: fixture.out,
        },
        fixedDependencies([]),
      ),
    ).rejects.toMatchObject({
      diagnostic: { code: "conflicting-entity-retirement-remap" },
    });
    await expect(lstat(resolve(fixture.out, "preview.json"))).rejects.toThrow();
  });

  it.each([
    [
      "no-op",
      {
        schema_version: "1.0.0",
        mode: "update",
        entity_changes: [],
        note_changes: [],
        setup_effects: [],
      },
      "candidate-no-op",
    ],
    [
      "duplicate temporary key",
      {
        ...makeMineRequest(),
        note_changes: [
          ...(makeMineRequest().note_changes as unknown[]),
          {
            action: "create",
            temporary_key: "taste",
            value: {
              title: "Duplicate key",
              temporal_coverage: "2026",
              sources: [
                {
                  url: "https://example.com/duplicate",
                  title: "Duplicate",
                  retrieval_status: "succeeded",
                },
              ],
              entity_refs: [],
              body: "Duplicate key body.",
            },
          },
        ],
      },
      "duplicate-temporary-key",
    ],
    [
      "unresolved temporary reference",
      {
        ...makeMineRequest(),
        note_changes: [
          {
            ...(makeMineRequest().note_changes as Record<string, unknown>[])[0],
            value: {
              ...((
                makeMineRequest().note_changes as Record<string, unknown>[]
              )[0]?.value as Record<string, unknown>),
              entity_refs: ["missing_entity"],
            },
          },
        ],
      },
      "unknown-entity-reference",
    ],
    [
      "duplicate target",
      {
        ...updateRequest(),
        entity_changes: [
          ...(updateRequest().entity_changes as unknown[]),
          ...(updateRequest().entity_changes as unknown[]),
        ],
      },
      "conflicting-candidate-change",
    ],
    [
      "make mine without a first Note",
      { ...makeMineRequest(), note_changes: [] },
      "make-mine-first-note-required",
    ],
  ])("rejects %s before Preview", async (_name, request, code) => {
    const fixture = await makeRepository(
      (request as Record<string, unknown>).mode === "make-mine"
        ? "pending"
        : "initialized",
    );
    await writeRequest(fixture, request as Record<string, unknown>);
    await expect(
      prepareCandidate(
        {
          root: fixture.root,
          requestPath: fixture.requestPath,
          out: fixture.out,
        },
        fixedDependencies(),
      ),
    ).rejects.toMatchObject({ diagnostic: { code } });
    await expect(lstat(resolve(fixture.out, "preview.json"))).rejects.toThrow();
    expect(await git(fixture.root, "status", "--short")).toBe("");
  });

  it.each([
    ["invalid UUID", ["not-a-uuid"], "invalid-generated-uuid"],
    [
      "uppercase UUID",
      ["AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"],
      "invalid-generated-uuid",
    ],
    [
      "duplicate UUID",
      [PROFILE_ID, PROFILE_ID, NOTE_ID],
      "duplicate-generated-uuid",
    ],
  ])("rejects %s without a Preview", async (_name, ids, code) => {
    const fixture = await makeRepository();
    await writeRequest(fixture, makeMineRequest());
    await expect(
      prepareCandidate(
        {
          root: fixture.root,
          requestPath: fixture.requestPath,
          out: fixture.out,
        },
        fixedDependencies(ids),
      ),
    ).rejects.toMatchObject({ diagnostic: { code } });
    await expect(lstat(resolve(fixture.out, "preview.json"))).rejects.toThrow();
  });

  it("rejects carriage returns in Note bodies instead of repairing them", async () => {
    const fixture = await makeRepository();
    const request = makeMineRequest();
    const note = (request.note_changes as Record<string, unknown>[])[0];
    const value = note.value as Record<string, unknown>;
    value.body = "First line\r\nSecond line";
    await writeRequest(fixture, request);

    await expect(
      prepareCandidate(
        {
          root: fixture.root,
          requestPath: fixture.requestPath,
          out: fixture.out,
        },
        fixedDependencies(),
      ),
    ).rejects.toMatchObject({
      diagnostic: { code: "candidate-body-noncanonical" },
    });
    await expect(lstat(resolve(fixture.out, "preview.json"))).rejects.toThrow();
  });
});

describe("external-only complete Candidate materialization", () => {
  it.each(["direct", "symlink-parent"] as const)(
    "rejects a %s request inside the authoritative repository without creating Candidate output",
    async (kind) => {
      const fixture = await makeRepository();
      const requestDirectory = resolve(fixture.root, "authoring");
      const requestInsideRepository = resolve(requestDirectory, "request.json");
      await mkdir(requestDirectory);
      await writeFile(
        requestInsideRepository,
        `${JSON.stringify(makeMineRequest(), null, 2)}\n`,
      );
      let observedRequestPath = requestInsideRepository;
      if (kind === "symlink-parent") {
        const linkedParent = resolve(fixture.base, "linked-authoring");
        await symlink(requestDirectory, linkedParent);
        observedRequestPath = resolve(linkedParent, "request.json");
      }

      await expect(
        prepareCandidate(
          {
            root: fixture.root,
            requestPath: observedRequestPath,
            out: fixture.out,
          },
          fixedDependencies(),
        ),
      ).rejects.toMatchObject({
        diagnostic: { code: "candidate-request-inside-repository" },
      });
      await expect(lstat(fixture.out)).rejects.toThrow();
    },
  );

  it("preserves the inside-repository diagnostic when the request realpath moves inside after its read", async () => {
    const fixture = await makeRepository();
    await writeRequest(fixture, makeMineRequest());
    const authoritativeRoot = await nodeFileSystem.realpath(fixture.root);
    let requestRealpathCalls = 0;

    await expect(
      prepareCandidate(
        {
          root: fixture.root,
          requestPath: fixture.requestPath,
          out: fixture.out,
        },
        {
          ...fixedDependencies(),
          fileSystem: {
            ...nodeFileSystem,
            realpath: async (path) => {
              const actual = await nodeFileSystem.realpath(path);
              if (resolve(path) !== fixture.requestPath) return actual;
              requestRealpathCalls += 1;
              return requestRealpathCalls === 2
                ? resolve(authoritativeRoot, "raced-request.json")
                : actual;
            },
          },
        },
      ),
    ).rejects.toMatchObject({
      diagnostic: { code: "candidate-request-inside-repository" },
    });
    expect(requestRealpathCalls).toBe(2);
    await expect(lstat(fixture.out)).rejects.toThrow();
  });

  it("rejects external-parent substitution before root creation without writing or unsafe cleanup", async () => {
    const fixture = await makeRepository();
    const parent = resolve(fixture.base, "candidate-parent");
    const movedParent = resolve(fixture.base, "candidate-parent-original");
    const attacker = resolve(fixture.base, "attacker-parent");
    await Promise.all([mkdir(parent), mkdir(attacker)]);
    fixture.out = resolve(parent, "candidate");
    await writeRequest(fixture, makeMineRequest());
    let substituted = false;

    await expect(
      prepareCandidate(
        {
          root: fixture.root,
          requestPath: fixture.requestPath,
          out: fixture.out,
        },
        {
          ...fixedDependencies(),
          fileSystem: {
            ...nodeFileSystem,
            checkpoint: async (point, path) => {
              await nodeFileSystem.checkpoint(point, path);
              if (!substituted && point === "before-candidate-root-create") {
                substituted = true;
                await rename(parent, movedParent);
                await symlink(attacker, parent);
              }
            },
          },
        },
      ),
    ).rejects.toMatchObject({
      diagnostic: { code: "candidate-output-drift" },
    });
    expect(substituted).toBe(true);
    await expect(lstat(resolve(attacker, "candidate"))).rejects.toThrow();
    await expect(lstat(resolve(movedParent, "candidate"))).rejects.toThrow();
  });

  it("reports only the public-content warnings supplied by the request", async () => {
    const fixture = await makeRepository();
    const request = makeMineRequest();
    const note = (request.note_changes as Record<string, unknown>[])[0];
    const value = note.value as Record<string, unknown>;
    value.body =
      "Public contact words such as email, phone, private, and secret remain ordinary content.";
    value.public_content_warnings = [
      "The requester marked this contact detail for human privacy review.",
    ];
    await writeRequest(fixture, request);

    await prepareCandidate(
      {
        root: fixture.root,
        requestPath: fixture.requestPath,
        out: fixture.out,
      },
      fixedDependencies(),
    );

    const preview = await readJson<{ privacy_warnings: string[] }>(
      resolve(fixture.out, "preview.json"),
    );
    expect(preview.privacy_warnings).toEqual([
      "The requester marked this contact detail for human privacy review.",
    ]);
  });

  it("materializes complete deterministic state, public Preview, bindings, and RFC 8785 digest outside the repository", async () => {
    const fixture = await makeRepository();
    await writeRequest(fixture, makeMineRequest());
    const before = await git(fixture.root, "status", "--porcelain=v1");

    const prepared = await prepareCandidate(
      {
        root: fixture.root,
        requestPath: fixture.requestPath,
        out: fixture.out,
      },
      fixedDependencies(),
    );

    expect(await git(fixture.root, "status", "--porcelain=v1")).toBe(before);
    const manifest = await readJson<CandidateManifest>(
      resolve(fixture.out, "candidate-manifest.json"),
    );
    const preview = await readJson<Record<string, unknown>>(
      resolve(fixture.out, "preview.json"),
    );
    expect(prepared.candidateDigest).toBe(manifest.candidate_digest);
    const materializedManifest = await readJson<Record<string, unknown>>(
      resolve(fixture.out, "repository/coffee-chat.json"),
    );
    expect(materializedManifest).toMatchObject({
      schema_version: "1.1.0",
      provenance: expect.objectContaining({
        created_from: expect.objectContaining({ method: "github-template" }),
      }),
    });
    expect(manifest).toMatchObject({
      schema_version: "1.0.0",
      candidate_format_version: "1.0.0",
      mode: "make-mine",
      time_zone: "Asia/Seoul",
      frozen_date: "2026-08-01",
      validation: { status: "passed" },
      source_observations: expect.arrayContaining([
        expect.objectContaining({
          url: "https://example.com/public-source",
          accessed_on: "2026-07-31",
          retrieval_status: "succeeded",
        }),
        expect.objectContaining({
          retrieval_status: "unavailable",
          access_limitation: "The public page did not respond.",
        }),
      ]),
    });
    const digestInput = structuredClone(manifest) as Record<string, unknown>;
    delete digestInput.candidate_digest;
    expect(manifest.candidate_digest).toBe(
      sha256(canonicalizeJson(digestInput as never)),
    );
    expect(manifest.outputs.map((entry) => entry.path)).toEqual(
      [...manifest.outputs.map((entry) => entry.path)].sort(),
    );
    for (const output of manifest.outputs) {
      expect(
        sha256(await readFile(resolve(fixture.out, "repository", output.path))),
      ).toBe(output.digest);
    }
    expect(preview).toMatchObject({
      candidate_digest: manifest.candidate_digest,
      candidate_directory: ".",
      base_commit: manifest.base_commit,
      frozen_date: "2026-08-01",
      time_zone: "Asia/Seoul",
      knowledge_digest: manifest.knowledge_digest,
      validation: { status: "passed" },
      notes: [
        expect.objectContaining({
          id: NOTE_ID,
          recorded_on: "2026-08-01",
          body: expect.stringContaining("complete public body"),
        }),
      ],
      entities: [expect.objectContaining({ id: ENTITY_ID, label: "Taste" })],
      unresolved_source_limitations: ["The public page did not respond."],
      setup_effects: [],
    });
    expect(
      await readFile(resolve(fixture.out, "preview.md"), "utf8"),
    ).toContain("A complete public body");
    expect(
      await readFile(
        resolve(fixture.out, `repository/knowledge/notes/${NOTE_ID}.md`),
        "utf8",
      ),
    ).toContain('accessed_on: "2026-07-31"');
    const candidateFiles = await bytesByPath(fixture.out);
    const adoptedEnginePaths = new Set(
      manifest.outputs
        .map((entry) => entry.path)
        .filter((path) => path.startsWith("./"))
        .map((path) => `repository/${path.slice(2)}`),
    );
    const allCandidateText = Object.entries(candidateFiles)
      .filter(([path]) => !adoptedEnginePaths.has(path))
      .map(([, bytes]) => Buffer.from(bytes, "base64").toString("utf8"))
      .join("\n");
    for (const key of ["owner_profile", "taste", "first_note"])
      expect(allCandidateText).not.toContain(key);

    const snapshot = await createSnapshot(
      resolve(fixture.out, "repository"),
      "worktree",
    );
    const validation = await validateKnowledge(snapshot);
    expect(validation.diagnostics).toEqual([]);
    expect(validation.graph).toBeDefined();
    expect(validation.graph && isInstanceGraph(validation.graph)).toBe(true);
    expect(
      await checkGeneratedIndex(
        snapshot,
        validation.graph as Parameters<typeof checkGeneratedIndex>[1],
      ),
    ).toEqual([]);

    const secondOut = resolve(fixture.base, "candidate-second");
    await prepareCandidate(
      {
        root: fixture.root,
        requestPath: fixture.requestPath,
        out: secondOut,
      },
      fixedDependencies(),
    );
    expect(await bytesByPath(secondOut)).toEqual(
      await bytesByPath(fixture.out),
    );
  });

  it.each(["inside", "symlink"])(
    "rejects an %s materialization target before any canonical write",
    async (kind) => {
      const fixture = await makeRepository();
      await writeRequest(fixture, makeMineRequest());
      const out = resolve(fixture.root, "candidate-output");
      if (kind === "symlink") {
        await mkdir(resolve(fixture.root, "candidate-real"));
        await symlink(resolve(fixture.root, "candidate-real"), fixture.out);
      }
      await expect(
        prepareCandidate(
          {
            root: fixture.root,
            requestPath: fixture.requestPath,
            out: kind === "inside" ? out : fixture.out,
          },
          fixedDependencies(),
        ),
      ).rejects.toMatchObject({
        diagnostic: { code: "candidate-output-must-be-external" },
      });
      expect(await git(fixture.root, "status", "--short")).toBe("");
    },
  );

  it("make-mine requires an engine while contribute preserves instance identity and graph", async () => {
    const initialized = await makeRepository("initialized");
    await writeRequest(initialized, makeMineRequest());
    await expect(
      prepareCandidate(
        {
          root: initialized.root,
          requestPath: initialized.requestPath,
          out: initialized.out,
        },
        fixedDependencies(),
      ),
    ).rejects.toMatchObject({
      diagnostic: { code: "make-mine-engine-required" },
    });

    const makeMine = await makeRepository();
    await writeRequest(makeMine, makeMineRequest());
    await prepareCandidate(
      {
        root: makeMine.root,
        requestPath: makeMine.requestPath,
        out: makeMine.out,
      },
      fixedDependencies(),
    );
    const makeMineText = Object.values(
      await canonicalBytes(resolve(makeMine.out, "repository")),
    )
      .map((value) => Buffer.from(value, "base64").toString("utf8"))
      .join("\n");
    expect(makeMineText).not.toContain(EXISTING_NOTE_ID);
    expect(makeMineText).not.toContain(OTHER_NOTE_ID);
    expect(makeMineText).not.toContain(EXISTING_ENTITY_ID);
    expect(makeMineText).not.toContain("Fixture Owner");

    const contribute = await makeRepository("initialized");
    const request = {
      schema_version: "1.0.0",
      mode: "contribute",
      entity_changes: [],
      note_changes: [
        {
          action: "create",
          temporary_key: "contributed_note",
          value: {
            title: "Contributed Note",
            temporal_coverage: "2026",
            sources: [
              {
                url: "https://example.com/contribution",
                title: "Contribution",
                retrieval_status: "succeeded",
              },
            ],
            entity_refs: [EXISTING_ENTITY_ID],
            body: "Contributed body.",
          },
        },
      ],
      setup_effects: [],
    };
    await writeRequest(contribute, request);
    await prepareCandidate(
      {
        root: contribute.root,
        requestPath: contribute.requestPath,
        out: contribute.out,
      },
      fixedDependencies([NOTE_ID], "2026-08-02T15:30:00.000Z"),
    );
    const manifest = await readJson<Record<string, unknown>>(
      resolve(contribute.out, "repository/coffee-chat.json"),
    );
    expect((manifest.profile as { id: string }).id).toBe(
      "69d249c9-3c4f-4e0d-b622-74b292f87e9d",
    );
    expect(
      await lstat(
        resolve(
          contribute.out,
          `repository/knowledge/notes/${EXISTING_NOTE_ID}.md`,
        ),
      ),
    ).toBeDefined();
    expect(
      await lstat(
        resolve(
          contribute.out,
          `repository/knowledge/notes/${OTHER_NOTE_ID}.md`,
        ),
      ),
    ).toBeDefined();
  });

  it("preserves Note identity/recorded_on for correction and existing Notes for evolution/coexistence creates", async () => {
    const fixture = await makeRepository("initialized");
    const correction = {
      schema_version: "1.0.0",
      mode: "update",
      entity_changes: [],
      note_changes: [
        {
          action: "correct",
          target_id: EXISTING_NOTE_ID,
          value: {
            title: "Corrected title",
            temporal_coverage: "2024-02/2024-03-01",
            sources: [
              {
                url: "https://example.com/shared",
                title: "Corrected observation",
                retrieval_status: "succeeded",
              },
            ],
            entity_refs: [EXISTING_ENTITY_ID],
            body: "Corrected complete body.",
          },
        },
        {
          action: "create",
          temporary_key: "evolved_view",
          value: {
            title: "Evolved or contextual view",
            temporal_coverage: "2026",
            sources: [
              {
                url: "https://example.com/evolution",
                title: "Evolution source",
                retrieval_status: "succeeded",
              },
            ],
            entity_refs: [],
            body: `The earlier view remains at [its Note](./${EXISTING_NOTE_ID}.md).`,
          },
        },
      ],
      setup_effects: [],
    };
    await writeRequest(fixture, correction);
    await prepareCandidate(
      {
        root: fixture.root,
        requestPath: fixture.requestPath,
        out: fixture.out,
      },
      fixedDependencies([NOTE_ID], "2026-08-02T15:30:00.000Z"),
    );
    const corrected = await readFile(
      resolve(fixture.out, `repository/knowledge/notes/${EXISTING_NOTE_ID}.md`),
      "utf8",
    );
    expect(corrected).toContain(`id: "${EXISTING_NOTE_ID}"`);
    expect(corrected).toContain('recorded_on: "2026-08-01"');
    expect(corrected).toContain('accessed_on: "2026-08-01"');
    expect(corrected).toContain("Corrected complete body.");
    expect(
      await readFile(
        resolve(fixture.out, `repository/knowledge/notes/${NOTE_ID}.md`),
        "utf8",
      ),
    ).toContain('accessed_on: "2026-08-03"');
    expect(
      await lstat(
        resolve(fixture.out, `repository/knowledge/notes/${OTHER_NOTE_ID}.md`),
      ),
    ).toBeDefined();
    expect(
      await lstat(
        resolve(fixture.out, `repository/knowledge/notes/${NOTE_ID}.md`),
      ),
    ).toBeDefined();
    const manifest = await readJson<CandidateManifest>(
      resolve(fixture.out, "candidate-manifest.json"),
    );
    const receipt = await applyCandidate(
      {
        root: fixture.root,
        candidateDir: fixture.out,
        approvedDigest: manifest.candidate_digest,
      },
      fixedDependencies([NOTE_ID], "2026-08-02T15:30:00.000Z"),
    );
    expect(receipt.status).toBe("applied");
    expect(
      await readFile(
        resolve(fixture.root, `knowledge/notes/${EXISTING_NOTE_ID}.md`),
        "utf8",
      ),
    ).toContain('accessed_on: "2026-08-01"');
  });

  it("preserves a prior approved accessed_on when correction retrieval is unavailable", async () => {
    const fixture = await makeRepository("initialized");
    await writeRequest(fixture, {
      schema_version: "1.0.0",
      mode: "update",
      entity_changes: [],
      note_changes: [
        {
          action: "correct",
          target_id: EXISTING_NOTE_ID,
          value: {
            title: "Unavailable correction observation",
            temporal_coverage: "2024-02/2024-03-01",
            sources: [
              {
                url: "https://example.com/shared",
                title: "Shared title is temporarily unavailable",
                retrieval_status: "unavailable",
                access_limitation: "The source timed out during correction.",
              },
            ],
            entity_refs: [EXISTING_ENTITY_ID],
            body: "The correction retains the approved citation history.",
          },
        },
      ],
      setup_effects: [],
    });

    await prepareCandidate(
      {
        root: fixture.root,
        requestPath: fixture.requestPath,
        out: fixture.out,
      },
      fixedDependencies([], "2026-08-02T15:30:00.000Z"),
    );

    const corrected = await readFile(
      resolve(fixture.out, `repository/knowledge/notes/${EXISTING_NOTE_ID}.md`),
      "utf8",
    );
    expect(corrected).toContain('accessed_on: "2026-08-01"');
    const preview = await readJson<{
      source_observations: Array<Record<string, unknown>>;
    }>(resolve(fixture.out, "preview.json"));
    expect(preview.source_observations).toEqual([
      expect.objectContaining({
        retrieval_status: "unavailable",
        access_limitation: "The source timed out during correction.",
      }),
    ]);
    expect(preview.source_observations[0]).not.toHaveProperty("accessed_on");
  });

  it("materializes explicit Entity split/retire remaps without dangling or redirect records", async () => {
    const fixture = await makeRepository("initialized");
    const split = {
      schema_version: "1.0.0",
      mode: "update",
      entity_changes: [
        {
          action: "create",
          temporary_key: "split_a",
          value: { label: "Iteration practice", kind: "process" },
        },
        {
          action: "create",
          temporary_key: "split_b",
          value: { label: "Iteration cycle", kind: "concept" },
        },
        {
          action: "retire",
          target_id: EXISTING_ENTITY_ID,
          note_remaps: [
            {
              target_id: EXISTING_NOTE_ID,
              entity_refs: ["split_a", "split_b"],
            },
          ],
        },
      ],
      note_changes: [],
      setup_effects: [],
    };
    await writeRequest(fixture, split);
    await prepareCandidate(
      {
        root: fixture.root,
        requestPath: fixture.requestPath,
        out: fixture.out,
      },
      fixedDependencies([SECOND_ENTITY_ID, THIRD_ENTITY_ID]),
    );
    const entities = await readFile(
      resolve(fixture.out, "repository/knowledge/entities.yml"),
      "utf8",
    );
    expect(entities).toContain(SECOND_ENTITY_ID);
    expect(entities).toContain(THIRD_ENTITY_ID);
    expect(entities).not.toContain(EXISTING_ENTITY_ID);
    expect(entities).not.toMatch(/redirect|supersedes|retired/);
    const remapped = await readFile(
      resolve(fixture.out, `repository/knowledge/notes/${EXISTING_NOTE_ID}.md`),
      "utf8",
    );
    expect(remapped).toContain(SECOND_ENTITY_ID);
    expect(remapped).toContain(THIRD_ENTITY_ID);

    const incomplete = await makeRepository("initialized");
    await writeRequest(incomplete, {
      ...split,
      entity_changes: (split.entity_changes as Record<string, unknown>[]).map(
        (change) =>
          change.action === "retire" ? { ...change, note_remaps: [] } : change,
      ),
    });
    await expect(
      prepareCandidate(
        {
          root: incomplete.root,
          requestPath: incomplete.requestPath,
          out: incomplete.out,
        },
        fixedDependencies([SECOND_ENTITY_ID, THIRD_ENTITY_ID]),
      ),
    ).rejects.toMatchObject({
      diagnostic: { code: "incomplete-entity-retirement-remap" },
    });
  });
});

describe("exact approval preflight invalidation", () => {
  it.each(["inside", "symlink", "non-directory"])(
    "rejects an initially %s Candidate location without canonical mutation",
    async (kind) => {
      const fixture = await makeRepository("initialized");
      await writeRequest(fixture, updateRequest());
      await prepareCandidate(
        {
          root: fixture.root,
          requestPath: fixture.requestPath,
          out: fixture.out,
        },
        fixedDependencies([]),
      );
      const manifest = await readJson<CandidateManifest>(
        resolve(fixture.out, "candidate-manifest.json"),
      );
      let candidateDir = fixture.out;
      if (kind === "inside") {
        candidateDir = resolve(fixture.root, "candidate");
        await mkdir(candidateDir);
      } else if (kind === "symlink") {
        const realCandidate = resolve(fixture.base, "real-candidate");
        await rename(fixture.out, realCandidate);
        await symlink(realCandidate, fixture.out);
      } else {
        await rm(fixture.out, { recursive: true });
        await writeFile(fixture.out, "not a directory\n");
      }
      const before = await canonicalBytes(fixture.root);

      const receipt = await applyCandidate(
        {
          root: fixture.root,
          candidateDir,
          approvedDigest: manifest.candidate_digest,
        },
        fixedDependencies([]),
      );

      expect(receipt).toMatchObject({
        status: "approval_invalidated",
        invalidation_code: "candidate-location-invalid",
        changed_paths: [],
      });
      expect(await canonicalBytes(fixture.root)).toEqual(before);
    },
  );

  it("invalidates parent substitution before transaction and creates no journal in either parent", async () => {
    const fixture = await makeRepository("initialized");
    const candidateParent = resolve(fixture.base, "candidate-parent");
    const movedParent = resolve(fixture.base, "candidate-parent-original");
    const attackerParent = resolve(fixture.base, "attacker-parent");
    await Promise.all([mkdir(candidateParent), mkdir(attackerParent)]);
    fixture.out = resolve(candidateParent, "candidate");
    await writeRequest(fixture, updateRequest());
    await prepareCandidate(
      {
        root: fixture.root,
        requestPath: fixture.requestPath,
        out: fixture.out,
      },
      fixedDependencies([]),
    );
    const manifest = await readJson<CandidateManifest>(
      resolve(fixture.out, "candidate-manifest.json"),
    );
    const before = await canonicalBytes(fixture.root);
    let substituted = false;

    const receipt = await applyCandidate(
      {
        root: fixture.root,
        candidateDir: fixture.out,
        approvedDigest: manifest.candidate_digest,
      },
      {
        ...fixedDependencies([]),
        fileSystem: {
          ...nodeFileSystem,
          checkpoint: async (point, path) => {
            await nodeFileSystem.checkpoint(point, path);
            if (!substituted && point === "before-candidate-transaction") {
              substituted = true;
              await rename(candidateParent, movedParent);
              await symlink(attackerParent, candidateParent);
            }
          },
        },
      },
    );

    expect(receipt).toMatchObject({
      status: "approval_invalidated",
      invalidation_code: "candidate-location-drift",
      changed_paths: [],
    });
    expect(await canonicalBytes(fixture.root)).toEqual(before);
    expect(
      (await readdir(attackerParent)).some((name) =>
        name.endsWith(".transaction.json"),
      ),
    ).toBe(false);
    expect(
      (await readdir(movedParent)).some((name) =>
        name.endsWith(".transaction.json"),
      ),
    ).toBe(false);
  });

  it("invalidates when the bound Candidate root is relocated before manifest read", async () => {
    const fixture = await makeRepository("initialized");
    await writeRequest(fixture, updateRequest());
    await prepareCandidate(
      {
        root: fixture.root,
        requestPath: fixture.requestPath,
        out: fixture.out,
      },
      fixedDependencies([]),
    );
    const manifest = await readJson<CandidateManifest>(
      resolve(fixture.out, "candidate-manifest.json"),
    );
    const relocated = resolve(fixture.base, "relocated-candidate");
    let relocatedAtBoundary = false;
    const before = await canonicalBytes(fixture.root);

    const receipt = await applyCandidate(
      {
        root: fixture.root,
        candidateDir: fixture.out,
        approvedDigest: manifest.candidate_digest,
      },
      {
        ...fixedDependencies([]),
        fileSystem: {
          ...nodeFileSystem,
          checkpoint: async (point, path) => {
            await nodeFileSystem.checkpoint(point, path);
            if (
              !relocatedAtBoundary &&
              point === "before-candidate-manifest-read"
            ) {
              relocatedAtBoundary = true;
              await rename(fixture.out, relocated);
              await mkdir(fixture.out);
            }
          },
        },
      },
    );

    expect(relocatedAtBoundary).toBe(true);
    expect(receipt).toMatchObject({
      status: "approval_invalidated",
      invalidation_code: "candidate-location-drift",
      changed_paths: [],
    });
    expect(await canonicalBytes(fixture.root)).toEqual(before);
    expect(
      await readFile(resolve(relocated, "candidate-manifest.json"), "utf8"),
    ).toContain(manifest.candidate_digest);
  });

  const finalBoundaryRaces: Array<{
    name: string;
    invalidationCode: string;
    setupEffect?: boolean;
    race: (
      fixture: RepositoryFixture,
      manifest: CandidateManifest,
      setInstant: (value: string) => void,
    ) => Promise<void>;
  }> = [
    {
      name: "Candidate artifact inventory",
      invalidationCode: "candidate-artifact-drift",
      race: async (fixture) => {
        await writeFile(resolve(fixture.out, "preview.json"), "{}\n");
      },
    },
    {
      name: "bound request bytes",
      invalidationCode: "source-observation-drift",
      race: async (fixture) => {
        const request = await readJson<Record<string, unknown>>(
          fixture.requestPath,
        );
        const change = (
          request.entity_changes as Array<Record<string, unknown>>
        )[0] as Record<string, unknown>;
        (change.value as Record<string, unknown>).label = "Raced request";
        await writeRequest(fixture, request);
      },
    },
    {
      name: "base HEAD",
      invalidationCode: "base-head-drift",
      race: async (fixture) => {
        await writeFile(resolve(fixture.root, "raced-head.txt"), "race\n");
        await git(fixture.root, "add", "raced-head.txt");
        await git(fixture.root, "commit", "-qm", "race head");
      },
    },
    {
      name: "repository identity",
      invalidationCode: "base-head-drift",
      race: async (fixture) => {
        await git(fixture.root, "checkout", "-qb", "raced-branch");
      },
    },
    {
      name: "canonical input",
      invalidationCode: "canonical-input-drift",
      race: async (fixture) => {
        const path = resolve(fixture.root, "knowledge/entities.yml");
        await writeFile(path, `${await readFile(path, "utf8")}# raced\n`);
      },
    },
    {
      name: "implementation input",
      invalidationCode: "implementation-drift",
      race: async (fixture) => {
        const path = resolve(fixture.root, "tools/generate.ts");
        await writeFile(path, `${await readFile(path, "utf8")}\n// raced\n`);
      },
    },
    {
      name: "worktree index",
      invalidationCode: "worktree-drift",
      race: async (fixture) => {
        await git(
          fixture.root,
          "update-index",
          "--chmod=+x",
          "knowledge/entities.yml",
        );
      },
    },
    {
      name: "configured date",
      invalidationCode: "configured-date-drift",
      race: async (_fixture, _manifest, setInstant) => {
        setInstant("2026-08-02T03:00:00.000Z");
      },
    },
    {
      name: "setup hook target",
      invalidationCode: "hook-target-drift",
      setupEffect: true,
      race: async (_fixture, manifest) => {
        const effect = manifest.setup_effects[0] as { target_path: string };
        await mkdir(dirname(effect.target_path), { recursive: true });
        await writeFile(effect.target_path, "#!/bin/sh\necho raced\n");
      },
    },
  ];

  it.each(finalBoundaryRaces)(
    "revalidates raced $name immediately before the transaction with zero engine writes",
    async ({ invalidationCode, setupEffect, race }) => {
      const fixture = await makeRepository("initialized");
      await writeRequest(fixture, {
        ...updateRequest(),
        setup_effects: setupEffect ? ["install-pre-commit"] : [],
      });
      await prepareCandidate(
        {
          root: fixture.root,
          requestPath: fixture.requestPath,
          out: fixture.out,
        },
        fixedDependencies([]),
      );
      const manifest = await readJson<CandidateManifest>(
        resolve(fixture.out, "candidate-manifest.json"),
      );
      let instant = "2026-08-01T03:00:00.000Z";
      let raced = false;
      let racedCanonical: Record<string, string> | undefined;
      const repositoryMutations: string[] = [];
      const checkpoint: CandidateFileSystem["checkpoint"] = async (
        point,
        path,
      ) => {
        await nodeFileSystem.checkpoint(point, path);
        if (!raced && point === "before-candidate-transaction") {
          raced = true;
          await race(fixture, manifest, (value) => {
            instant = value;
          });
          racedCanonical = await canonicalBytes(fixture.root);
        }
      };

      const receipt = await applyCandidate(
        {
          root: fixture.root,
          candidateDir: fixture.out,
          approvedDigest: manifest.candidate_digest,
        },
        {
          ...fixedDependencies([]),
          clock: { now: () => new Date(instant) },
          fileSystem: mutationSpyingFileSystem(
            fixture.root,
            repositoryMutations,
            checkpoint,
          ),
        },
      );

      expect(raced).toBe(true);
      expect(receipt).toMatchObject({
        status: "approval_invalidated",
        invalidation_code: invalidationCode,
        changed_paths: [],
        validation: { status: "not_run" },
      });
      expect(repositoryMutations).toEqual([]);
      expect(await canonicalBytes(fixture.root)).toEqual(racedCanonical);
      expect(
        (await readdir(fixture.base)).some((name) =>
          name.endsWith(".transaction.json"),
        ),
      ).toBe(false);
    },
  );

  it.each(["Candidate output", "canonical target"] as const)(
    "binds immutable transaction bytes when the %s changes after final approval checks",
    async (raceTarget) => {
      const fixture = await makeRepository("initialized");
      await writeRequest(fixture, updateRequest());
      await prepareCandidate(
        {
          root: fixture.root,
          requestPath: fixture.requestPath,
          out: fixture.out,
        },
        fixedDependencies([]),
      );
      const manifest = await readJson<CandidateManifest>(
        resolve(fixture.out, "candidate-manifest.json"),
      );
      const entityOutput = manifest.outputs.find(
        (entry) => entry.path === "./knowledge/entities.yml",
      );
      expect(entityOutput).toBeDefined();
      const candidatePath = resolve(
        fixture.out,
        "repository",
        (entityOutput as { path: string }).path,
      );
      const canonicalPath = resolve(
        fixture.root,
        (entityOutput as { path: string }).path,
      );
      const before = await canonicalBytes(fixture.root);
      let raced = false;
      let racedCanonical = before;

      const receipt = await applyCandidate(
        {
          root: fixture.root,
          candidateDir: fixture.out,
          approvedDigest: manifest.candidate_digest,
        },
        {
          ...fixedDependencies([]),
          fileSystem: {
            ...nodeFileSystem,
            checkpoint: async (point, path) => {
              await nodeFileSystem.checkpoint(point, path);
              if (
                !raced &&
                (point as string) === "before-transaction-journal"
              ) {
                raced = true;
                if (raceTarget === "Candidate output")
                  await writeFile(candidatePath, "raced candidate bytes\n");
                else {
                  await writeFile(
                    canonicalPath,
                    `${await readFile(canonicalPath, "utf8")}# raced target\n`,
                  );
                  racedCanonical = await canonicalBytes(fixture.root);
                }
              }
            },
          },
        },
      );

      expect(raced).toBe(true);
      expect(receipt).toMatchObject({
        status: "approval_invalidated",
        invalidation_code:
          raceTarget === "Candidate output"
            ? "candidate-artifact-drift"
            : "canonical-input-drift",
        changed_paths: [],
        validation: { status: "not_run" },
      });
      expect(await canonicalBytes(fixture.root)).toEqual(racedCanonical);
      expect(
        (await readdir(fixture.base)).some((name) =>
          name.endsWith(".transaction.json"),
        ),
      ).toBe(false);
    },
  );

  it("rechecks a canonical preimage after the swap checkpoint without overwriting external drift", async () => {
    const fixture = await makeRepository("initialized");
    await writeRequest(fixture, updateRequest());
    await prepareCandidate(
      {
        root: fixture.root,
        requestPath: fixture.requestPath,
        out: fixture.out,
      },
      fixedDependencies([]),
    );
    const manifest = await readJson<CandidateManifest>(
      resolve(fixture.out, "candidate-manifest.json"),
    );
    const target = resolve(fixture.root, "knowledge/entities.yml");
    let raced = false;
    let racedCanonical: Record<string, string> | undefined;

    const receipt = await applyCandidate(
      {
        root: fixture.root,
        candidateDir: fixture.out,
        approvedDigest: manifest.candidate_digest,
      },
      {
        ...fixedDependencies([]),
        fileSystem: {
          ...nodeFileSystem,
          checkpoint: async (point, path) => {
            await nodeFileSystem.checkpoint(point, path);
            if (!raced && point === "swap" && path.endsWith("entities.yml")) {
              raced = true;
              await writeFile(
                target,
                `${await readFile(target, "utf8")}# raced at swap\n`,
              );
              racedCanonical = Object.fromEntries(
                Object.entries(await canonicalBytes(fixture.root)).filter(
                  ([path]) => !path.includes(".coffee-chat-"),
                ),
              );
            }
          },
        },
      },
    );

    expect(raced).toBe(true);
    expect(receipt).toMatchObject({
      status: "approval_invalidated",
      invalidation_code: "canonical-input-drift",
      changed_paths: [],
      validation: { status: "not_run" },
    });
    expect(await canonicalBytes(fixture.root)).toEqual(racedCanonical);
    expect(
      (await recursiveFiles(fixture.root)).some((path) =>
        path.includes(".coffee-chat-"),
      ),
    ).toBe(false);
    expect(
      (await readdir(fixture.base)).some((name) =>
        name.endsWith(".transaction.json"),
      ),
    ).toBe(false);
  });

  it.each([
    {
      name: "unknown manifest fields",
      mutate: (manifest: Record<string, unknown>) => {
        manifest.untrusted_extension = true;
      },
    },
    {
      name: "an unknown embedded Preview property",
      mutate: (manifest: Record<string, unknown>) => {
        const preview = manifest.preview as Record<string, unknown>;
        preview.untrusted_extension = true;
      },
    },
    {
      name: "a traversal transaction path",
      mutate: (manifest: Record<string, unknown>) => {
        manifest.changed_paths = [
          ...(manifest.changed_paths as string[]),
          "./../escape.txt",
        ];
      },
    },
    {
      name: "a non-POSIX transaction path",
      mutate: (manifest: Record<string, unknown>) => {
        manifest.changed_paths = [
          ...(manifest.changed_paths as string[]),
          ".\\knowledge\\escape.txt",
        ];
      },
    },
    {
      name: "a traversal support-file path",
      mutate: (manifest: Record<string, unknown>) => {
        const files = manifest.support_files as Array<Record<string, unknown>>;
        files[0]!.path = "./schemas/../tools/candidate.json";
        files.sort((left, right) =>
          String(left.path).localeCompare(String(right.path)),
        );
      },
    },
    {
      name: "a traversal absolute request path",
      mutate: (manifest: Record<string, unknown>) => {
        const binding = manifest.request_binding as Record<string, unknown>;
        binding.path = "/tmp/../forged-request.json";
      },
    },
    {
      name: "a duplicate transaction path",
      mutate: (manifest: Record<string, unknown>) => {
        manifest.changed_paths = [
          ...(manifest.changed_paths as string[]),
          (manifest.changed_paths as string[])[0],
        ];
      },
    },
    {
      name: "a Preview/top-level path mismatch",
      mutate: (manifest: Record<string, unknown>) => {
        const preview = manifest.preview as Record<string, unknown>;
        preview.affected_paths = [];
      },
    },
    {
      name: "a materialized-change/request mismatch",
      mutate: (manifest: Record<string, unknown>) => {
        const changes = manifest.materialized_changes as {
          entity_changes: Array<Record<string, unknown>>;
        };
        const first = changes.entity_changes[0] as Record<string, unknown>;
        const value = first.value as Record<string, unknown>;
        value.label = "Forged materialized label";
      },
    },
    {
      name: "a Preview/materialized Entity mismatch",
      mutate: (manifest: Record<string, unknown>) => {
        const preview = manifest.preview as {
          entities: Array<Record<string, unknown>>;
        };
        const changed = preview.entities.find(
          (entity) => entity.id === EXISTING_ENTITY_ID,
        ) as Record<string, unknown>;
        changed.change = "unchanged";
      },
    },
  ])(
    "invalidates a digest-valid Candidate with $name before mutation",
    async ({ mutate }) => {
      const fixture = await makeRepository("initialized");
      await writeRequest(fixture, updateRequest());
      await prepareCandidate(
        {
          root: fixture.root,
          requestPath: fixture.requestPath,
          out: fixture.out,
        },
        fixedDependencies([]),
      );
      const escaped = resolve(fixture.base, "escape.txt");
      await writeFile(escaped, "outside sentinel\n");
      const manifest = await resignCandidateManifest(fixture, mutate);
      const before = await canonicalBytes(fixture.root);

      const receipt = await applyCandidate(
        {
          root: fixture.root,
          candidateDir: fixture.out,
          approvedDigest: manifest.candidate_digest,
        },
        fixedDependencies([]),
      ).catch((error: unknown) => error);

      expect(receipt).toMatchObject({
        status: "approval_invalidated",
        invalidation_code: "candidate-manifest-invalid",
        changed_paths: [],
      });
      expect(await canonicalBytes(fixture.root)).toEqual(before);
      expect(await readFile(escaped, "utf8")).toBe("outside sentinel\n");
    },
  );

  it.each([
    {
      name: "forged request-derived Source observations",
      previewReplacement: undefined,
      mutate: (manifest: Record<string, unknown>) => {
        const observations = manifest.source_observations as Array<
          Record<string, unknown>
        >;
        const preview = manifest.preview as Record<string, unknown>;
        const previewObservations = preview.source_observations as Array<
          Record<string, unknown>
        >;
        observations[0]!.title = "Forged observation";
        previewObservations[0]!.title = "Forged observation";
      },
    },
    {
      name: "forged privacy warnings",
      previewReplacement: ["Approved warning", "Forged warning"] as const,
      mutate: (manifest: Record<string, unknown>) => {
        const preview = manifest.preview as Record<string, unknown>;
        preview.privacy_warnings = ["Forged warning"];
      },
    },
    {
      name: "forged unresolved limitations",
      previewReplacement: [
        "The public page did not respond.",
        "Forged limitation",
      ] as const,
      mutate: (manifest: Record<string, unknown>) => {
        const preview = manifest.preview as Record<string, unknown>;
        preview.unresolved_source_limitations = ["Forged limitation"];
      },
    },
    {
      name: "forged materialized Note provenance",
      previewReplacement: undefined,
      mutate: (manifest: Record<string, unknown>) => {
        const materialized = manifest.materialized_changes as {
          note_changes: Array<{
            value: {
              recorded_on: string;
              sources: Array<{ accessed_on?: string }>;
            };
          }>;
        };
        materialized.note_changes[0]!.value.recorded_on = "2026-07-01";
        materialized.note_changes[0]!.value.sources[0]!.accessed_on =
          "2026-07-01";
      },
    },
  ])(
    "invalidates $name even when the Candidate digest and self-mirrors agree",
    async ({ mutate, previewReplacement }) => {
      const fixture = await makeRepository();
      const request = makeMineRequest();
      const note = (request.note_changes as Array<Record<string, unknown>>)[0]!;
      (note.value as Record<string, unknown>).public_content_warnings = [
        "Approved warning",
      ];
      await writeRequest(fixture, request);
      await prepareCandidate(
        {
          root: fixture.root,
          requestPath: fixture.requestPath,
          out: fixture.out,
        },
        fixedDependencies(),
      );
      const manifest = await resignCandidateManifest(fixture, mutate);
      if (previewReplacement) {
        const [before, after] = previewReplacement;
        const previewPath = resolve(fixture.out, "preview.md");
        await writeFile(
          previewPath,
          (await readFile(previewPath, "utf8")).replace(before, after),
        );
      }
      const before = await canonicalBytes(fixture.root);

      const receipt = await applyCandidate(
        {
          root: fixture.root,
          candidateDir: fixture.out,
          approvedDigest: manifest.candidate_digest,
        },
        fixedDependencies(),
      );

      expect(receipt).toMatchObject({
        status: "approval_invalidated",
        invalidation_code: "candidate-manifest-invalid",
        changed_paths: [],
      });
      expect(await canonicalBytes(fixture.root)).toEqual(before);
    },
  );

  const cases: Array<{
    name: string;
    setupEffect?: boolean;
    request?: () => Record<string, unknown>;
    mutate: (
      fixture: RepositoryFixture,
      manifest: CandidateManifest,
    ) => Promise<CandidateDependencies | undefined>;
  }> = [
    {
      name: "D1 materialized output bytes",
      mutate: async (fixture, manifest) => {
        await writeFile(
          resolve(
            fixture.out,
            "repository",
            manifest.outputs[0]?.path as string,
          ),
          "tampered\n",
        );
        return undefined;
      },
    },
    {
      name: "D1 preview.json bytes",
      mutate: async (fixture) => {
        await writeFile(resolve(fixture.out, "preview.json"), "{}\n");
        return undefined;
      },
    },
    {
      name: "D1 preview.md bytes",
      mutate: async (fixture) => {
        await writeFile(
          resolve(fixture.out, "preview.md"),
          "tampered preview\n",
        );
        return undefined;
      },
    },
    {
      name: "D1 undeclared Candidate artifact",
      mutate: async (fixture) => {
        await writeFile(resolve(fixture.out, "undeclared.txt"), "extra\n");
        return undefined;
      },
    },
    {
      name: "D2 base HEAD",
      mutate: async (fixture) => {
        await writeFile(resolve(fixture.root, "unrelated.txt"), "new commit\n");
        await git(fixture.root, "add", "unrelated.txt");
        await git(fixture.root, "commit", "-qm", "move head");
        return undefined;
      },
    },
    {
      name: "D3 canonical input bytes",
      mutate: async (fixture) => {
        const path = resolve(fixture.root, "coffee-chat.json");
        await writeFile(
          path,
          (await readFile(path, "utf8")).replace(
            "Example Author",
            "Drifted Owner",
          ),
        );
        return undefined;
      },
    },
    {
      name: "D4 relevant staged state",
      mutate: async (fixture) => {
        await git(
          fixture.root,
          "update-index",
          "--chmod=+x",
          "coffee-chat.json",
        );
        return undefined;
      },
    },
    {
      name: "D5 configured-zone date rollover",
      mutate: async () => fixedDependencies([], "2026-08-02T03:00:00.000Z"),
    },
    {
      name: "D6 bound Source observation",
      request: () => ({
        ...updateRequest(),
        note_changes: [
          {
            action: "create",
            temporary_key: "observed_note",
            value: {
              title: "Observed Note",
              temporal_coverage: "2026",
              sources: [
                {
                  url: "https://example.com/observed",
                  title: "Observed source",
                  retrieval_status: "succeeded",
                },
              ],
              entity_refs: [],
              body: "Observed body.",
            },
          },
        ],
      }),
      mutate: async (fixture) => {
        const request = await readJson<Record<string, unknown>>(
          fixture.requestPath,
        );
        const note = (
          request.note_changes as Record<string, unknown>[]
        )[0] as Record<string, unknown>;
        const value = note.value as Record<string, unknown>;
        const source = (
          value.sources as Record<string, unknown>[]
        )[0] as Record<string, unknown>;
        source.title = "Changed observation";
        await writeRequest(fixture, request);
        return undefined;
      },
    },
    {
      name: "D7 validation race",
      mutate: async (fixture, manifest) => ({
        preflight: {
          checkpoint: async (point) => {
            if (point !== "before-shared-validation") return;
            const note = manifest.outputs.find((entry) =>
              entry.path.endsWith(".md"),
            );
            if (note)
              await writeFile(
                resolve(fixture.out, "repository", note.path),
                "invalid\n",
              );
          },
        },
      }),
    },
    {
      name: "D8/D9 setup-effect target bytes",
      setupEffect: true,
      mutate: async (_fixture, manifest) => {
        const effect = manifest.setup_effects[0] as { target_path: string };
        await mkdir(dirname(effect.target_path), { recursive: true });
        await writeFile(effect.target_path, "#!/bin/sh\necho unmanaged\n");
        return undefined;
      },
    },
    {
      name: "D10 implementation identity",
      mutate: async (fixture) => {
        await writeFile(
          resolve(fixture.root, "tools/generate.ts"),
          "// drift\n",
        );
        return undefined;
      },
    },
    {
      name: "D11 unreadable bound request",
      mutate: async (fixture) => {
        await rm(fixture.requestPath);
        await mkdir(fixture.requestPath);
        return undefined;
      },
    },
  ];

  it.each(cases)(
    "invalidates $name before any canonical or hook write",
    async ({ setupEffect, request: requestFactory, mutate }) => {
      const fixture = await makeRepository("initialized");
      const request = requestFactory
        ? requestFactory()
        : setupEffect
          ? { ...updateRequest(), setup_effects: ["install-pre-commit"] }
          : updateRequest();
      await writeRequest(fixture, request);
      await prepareCandidate(
        {
          root: fixture.root,
          requestPath: fixture.requestPath,
          out: fixture.out,
        },
        fixedDependencies([]),
      );
      const manifest = await readJson<CandidateManifest>(
        resolve(fixture.out, "candidate-manifest.json"),
      );
      const hook = manifest.setup_effects[0] as
        | { target_path: string }
        | undefined;
      const dependencies =
        (await mutate(fixture, manifest)) ?? fixedDependencies([]);
      const before = await canonicalBytes(fixture.root);
      const receipt = await applyCandidate(
        {
          root: fixture.root,
          candidateDir: fixture.out,
          approvedDigest: manifest.candidate_digest,
        },
        { ...fixedDependencies([]), ...dependencies },
      );
      expect(receipt.status).toBe("approval_invalidated");
      expect(receipt.changed_paths).toEqual([]);
      expect(receipt.validation.status).toBe("not_run");
      expect(await canonicalBytes(fixture.root)).toEqual(before);
      if (hook)
        expect(await readFile(hook.target_path, "utf8")).toContain("unmanaged");
    },
  );

  it("D1 rejects a different approved digest and D12 applies only when every binding agrees", async () => {
    const invalid = await makeRepository("initialized");
    await writeRequest(invalid, updateRequest());
    await prepareCandidate(
      {
        root: invalid.root,
        requestPath: invalid.requestPath,
        out: invalid.out,
      },
      fixedDependencies([]),
    );
    const manifest = await readJson<CandidateManifest>(
      resolve(invalid.out, "candidate-manifest.json"),
    );
    const invalidReceipt = await applyCandidate(
      {
        root: invalid.root,
        candidateDir: invalid.out,
        approvedDigest: `sha256:${"f".repeat(64)}`,
      },
      fixedDependencies([]),
    );
    expect(invalidReceipt).toMatchObject({
      status: "approval_invalidated",
      invalidation_code: "approved-digest-mismatch",
      changed_paths: [],
    });

    const applied = await makeRepository("initialized");
    await writeRequest(applied, updateRequest());
    await prepareCandidate(
      {
        root: applied.root,
        requestPath: applied.requestPath,
        out: applied.out,
      },
      fixedDependencies([]),
    );
    const approved = await readJson<CandidateManifest>(
      resolve(applied.out, "candidate-manifest.json"),
    );
    const receipt = await applyCandidate(
      {
        root: applied.root,
        candidateDir: applied.out,
        approvedDigest: approved.candidate_digest,
      },
      fixedDependencies([]),
    );
    expect(receipt).toMatchObject({
      status: "applied",
      candidate_digest: approved.candidate_digest,
      changed_paths: ["./knowledge/entities.yml", "./knowledge/index.json"],
      validation: { status: "passed" },
    });
    expect(
      await readFile(resolve(applied.root, "knowledge/entities.yml"), "utf8"),
    ).toContain("Iteration corrected");
    const snapshot = await createSnapshot(applied.root, "worktree");
    const validation = await validateKnowledge(snapshot);
    expect(validation.diagnostics).toEqual([]);
    expect(validation.graph && isInstanceGraph(validation.graph)).toBe(true);
    expect(
      await checkGeneratedIndex(
        snapshot,
        validation.graph as Parameters<typeof checkGeneratedIndex>[1],
      ),
    ).toEqual([]);
  });
});

describe("transaction rollback and setup receipt semantics", () => {
  const faultPoints: MutationPoint[] = [
    "temp-write",
    "temp-fsync",
    "backup",
    "backup-fsync",
    "mode",
    "swap",
    "directory-fsync",
    "final-verification",
  ];

  it("writes a recoverable local transaction journal before mutation and removes it after verified success", async () => {
    const fixture = await makeRepository("initialized");
    await writeRequest(fixture, updateRequest());
    await prepareCandidate(
      {
        root: fixture.root,
        requestPath: fixture.requestPath,
        out: fixture.out,
      },
      fixedDependencies([]),
    );
    const manifest = await readJson<CandidateManifest>(
      resolve(fixture.out, "candidate-manifest.json"),
    );
    let observedJournal: Record<string, unknown> | undefined;

    const receipt = await applyCandidate(
      {
        root: fixture.root,
        candidateDir: fixture.out,
        approvedDigest: manifest.candidate_digest,
      },
      {
        ...fixedDependencies([]),
        fileSystem: {
          ...nodeFileSystem,
          checkpoint: async (point, path) => {
            await nodeFileSystem.checkpoint(point, path);
            if (!observedJournal && point === "temp-write") {
              const journalNames = (await readdir(fixture.base)).filter(
                (name) => name.endsWith(".transaction.json"),
              );
              expect(journalNames).toHaveLength(1);
              observedJournal = await readJson<Record<string, unknown>>(
                resolve(fixture.base, journalNames[0] as string),
              );
            }
          },
        },
      },
    );

    expect(receipt.status).toBe("applied");
    expect(observedJournal).toMatchObject({
      schema_version: "1.0.0",
      candidate_digest: manifest.candidate_digest,
      state: "prepared",
      entries: expect.arrayContaining([
        expect.objectContaining({
          path: "./knowledge/entities.yml",
          original: expect.objectContaining({ digest: expect.any(String) }),
          expected_digest: expect.any(String),
          backup_path: expect.any(String),
          temporary_path: expect.any(String),
        }),
      ]),
    });
    expect(
      (await readdir(fixture.base)).filter((name) =>
        name.endsWith(".transaction.json"),
      ),
    ).toEqual([]);
  });

  it.each(faultPoints)(
    "rolls back byte-identically after injected %s failure",
    async (faultPoint) => {
      const fixture = await makeRepository("initialized");
      await writeRequest(fixture, updateRequest());
      await prepareCandidate(
        {
          root: fixture.root,
          requestPath: fixture.requestPath,
          out: fixture.out,
        },
        fixedDependencies([]),
      );
      const manifest = await readJson<CandidateManifest>(
        resolve(fixture.out, "candidate-manifest.json"),
      );
      const before = await canonicalBytes(fixture.root);
      let fired = false;
      await expect(
        applyCandidate(
          {
            root: fixture.root,
            candidateDir: fixture.out,
            approvedDigest: manifest.candidate_digest,
          },
          {
            ...fixedDependencies([]),
            fileSystem: {
              ...nodeFileSystem,
              checkpoint: async (point, path) => {
                await nodeFileSystem.checkpoint(point, path);
                if (!fired && point === faultPoint) {
                  fired = true;
                  throw new Error(`injected ${point}`);
                }
              },
            },
          },
        ),
      ).rejects.toMatchObject({
        diagnostic: { code: "candidate-transaction-failed" },
        rollbackVerified: true,
      });
      expect(fired).toBe(true);
      expect(await canonicalBytes(fixture.root)).toEqual(before);
      expect(
        (await recursiveFiles(fixture.root)).some((path) =>
          path.includes(".coffee-chat-"),
        ),
      ).toBe(false);
      expect(
        (await readdir(fixture.base)).some((name) =>
          name.endsWith(".transaction.json"),
        ),
      ).toBe(false);
    },
  );

  it("removes newly added canonical state after a mid-transaction make-mine fault", async () => {
    const fixture = await makeRepository();
    await writeRequest(fixture, makeMineRequest());
    await prepareCandidate(
      {
        root: fixture.root,
        requestPath: fixture.requestPath,
        out: fixture.out,
      },
      fixedDependencies(),
    );
    const manifest = await readJson<CandidateManifest>(
      resolve(fixture.out, "candidate-manifest.json"),
    );
    const before = await canonicalBytes(fixture.root);
    let swaps = 0;
    await expect(
      applyCandidate(
        {
          root: fixture.root,
          candidateDir: fixture.out,
          approvedDigest: manifest.candidate_digest,
        },
        {
          ...fixedDependencies(),
          fileSystem: {
            ...nodeFileSystem,
            checkpoint: async (point, path) => {
              await nodeFileSystem.checkpoint(point, path);
              if (point === "swap") {
                swaps += 1;
                if (swaps === 2) throw new Error("mid-swap fault");
              }
            },
          },
        },
      ),
    ).rejects.toMatchObject({
      diagnostic: { code: "candidate-transaction-failed" },
      rollbackVerified: true,
    });
    expect(swaps).toBe(2);
    expect(await canonicalBytes(fixture.root)).toEqual(before);
    await expect(
      lstat(resolve(fixture.root, `knowledge/notes/${NOTE_ID}.md`)),
    ).rejects.toThrow();
  });

  it("rolls back when applied shared validation fails after all swaps", async () => {
    const fixture = await makeRepository("initialized");
    await writeRequest(fixture, updateRequest());
    await prepareCandidate(
      {
        root: fixture.root,
        requestPath: fixture.requestPath,
        out: fixture.out,
      },
      fixedDependencies([]),
    );
    const manifest = await readJson<CandidateManifest>(
      resolve(fixture.out, "candidate-manifest.json"),
    );
    const before = await canonicalBytes(fixture.root);
    let raced = false;
    await expect(
      applyCandidate(
        {
          root: fixture.root,
          candidateDir: fixture.out,
          approvedDigest: manifest.candidate_digest,
        },
        {
          ...fixedDependencies([]),
          fileSystem: {
            ...nodeFileSystem,
            checkpoint: async (point, path) => {
              await nodeFileSystem.checkpoint(point, path);
              if (!raced && (point as string) === "before-applied-validation") {
                raced = true;
                await writeFile(
                  resolve(fixture.root, "knowledge/entities.yml"),
                  "invalid\n",
                );
              }
            },
          },
        },
      ),
    ).rejects.toMatchObject({
      diagnostic: { code: "candidate-transaction-failed" },
      rollbackVerified: true,
    });
    expect(raced).toBe(true);
    expect(await canonicalBytes(fixture.root)).toEqual(before);
  });

  it("reports rollback verification failure explicitly and never runs setup", async () => {
    const fixture = await makeRepository("initialized");
    await writeRequest(fixture, {
      ...updateRequest(),
      setup_effects: ["install-pre-commit"],
    });
    await prepareCandidate(
      {
        root: fixture.root,
        requestPath: fixture.requestPath,
        out: fixture.out,
      },
      fixedDependencies([]),
    );
    const manifest = await readJson<CandidateManifest>(
      resolve(fixture.out, "candidate-manifest.json"),
    );
    let processCalls = 0;
    await expect(
      applyCandidate(
        {
          root: fixture.root,
          candidateDir: fixture.out,
          approvedDigest: manifest.candidate_digest,
        },
        {
          ...fixedDependencies([]),
          fileSystem: {
            ...nodeFileSystem,
            checkpoint: async (point, path) => {
              await nodeFileSystem.checkpoint(point, path);
              if (point === "swap") throw new Error("swap failed");
              if (point === "rollback-verification")
                throw new Error("verify failed");
            },
          },
          process: {
            execute: async () => {
              processCalls += 1;
              return { exitCode: 0, stdout: "", stderr: "" };
            },
          },
        },
      ),
    ).rejects.toMatchObject({
      diagnostic: { code: "candidate-rollback-failed" },
      rollbackVerified: false,
    });
    expect(processCalls).toBe(0);
    expect(
      (await readdir(fixture.base)).some((name) =>
        name.endsWith(".transaction.json"),
      ),
    ).toBe(true);
    expect(
      (await recursiveFiles(fixture.base)).some((path) =>
        path.endsWith(".bak"),
      ),
    ).toBe(true);
  });

  it("keeps verified canonical bytes and returns partial_local_result when approved setup fails", async () => {
    const fixture = await makeRepository("initialized");
    await writeRequest(fixture, {
      ...updateRequest(),
      setup_effects: ["install-pre-commit"],
    });
    await prepareCandidate(
      {
        root: fixture.root,
        requestPath: fixture.requestPath,
        out: fixture.out,
      },
      fixedDependencies([]),
    );
    const manifest = await readJson<CandidateManifest>(
      resolve(fixture.out, "candidate-manifest.json"),
    );
    const receipt = await applyCandidate(
      {
        root: fixture.root,
        candidateDir: fixture.out,
        approvedDigest: manifest.candidate_digest,
      },
      {
        ...fixedDependencies([]),
        process: {
          execute: async () => ({
            exitCode: 1,
            stdout: "",
            stderr: "token=ghp_abcdefghijklmnopqrstuvwxyz123456",
          }),
        },
      },
    );
    expect(receipt).toMatchObject({
      status: "partial_local_result",
      validation: { status: "passed" },
      changed_paths: expect.arrayContaining(["./knowledge/entities.yml"]),
      setup_effects: [
        expect.objectContaining({
          effect: "install-pre-commit",
          status: "failed",
        }),
      ],
    });
    expect(receipt.setup_failure).toContain("<redacted>");
    expect(JSON.stringify(receipt)).not.toContain("ghp_");
    expect(
      await readFile(resolve(fixture.root, "knowledge/entities.yml"), "utf8"),
    ).toContain("Iteration corrected");
  });

  it("Receipt schema rejects contradictory invalidated, applied, and partial combinations", async () => {
    const schema = await readJson<Record<string, unknown>>(
      resolve(projectRoot, "schemas/receipt.schema.json"),
    );
    const { Ajv2020 } = await import("ajv/dist/2020.js");
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      schema,
    );
    const digest = `sha256:${"a".repeat(64)}`;
    const invalid: Array<Record<string, unknown>> = [
      {
        schema_version: "1.0.0",
        candidate_digest: digest,
        status: "approval_invalidated",
        changed_paths: ["coffee-chat.json"],
        validation: { status: "not_run" },
        invalidation_code: "base-drift",
      },
      {
        schema_version: "1.0.0",
        candidate_digest: digest,
        status: "applied",
        changed_paths: ["coffee-chat.json"],
        validation: { status: "passed" },
        setup_failure: "failed",
      },
      {
        schema_version: "1.0.0",
        candidate_digest: digest,
        status: "partial_local_result",
        changed_paths: ["coffee-chat.json"],
        validation: { status: "passed" },
      },
    ];
    for (const receipt of invalid) expect(validate(receipt)).toBe(false);
  });
});
