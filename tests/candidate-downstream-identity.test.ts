import { execFile } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import * as candidate from "../tools/candidate.ts";
import {
  applyCandidate,
  nodeFileSystem,
  prepareCandidate,
  type CandidateDependencies,
  type CandidateManifest,
} from "../tools/candidate.ts";
import { sha256 } from "../tools/knowledge.ts";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "..");
const cliPath = resolve(projectRoot, "tools/cc.ts");
const temporaryRoots: string[] = [];
const CONTENT_NOTICE =
  "# Downstream Content Notice\n\nDownstream Owner retains ownership of these authored public Notes.\n";
const IDS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];

type TargetFingerprint = {
  git_common_dir: { real_path: string; device: string; inode: string };
  origin_url: string;
  base_commit: string;
  pre_conversion_manifest_digest: string;
};

async function git(root: string, ...args: string[]): Promise<string> {
  return (
    await execFileAsync("git", args, { cwd: root, encoding: "utf8" })
  ).stdout.trim();
}

function request(): Record<string, unknown> {
  return {
    schema_version: "1.0.0",
    mode: "make-mine",
    instance_configuration: {
      profile: {
        temporary_key: "profile",
        display_name: "Downstream Owner",
        short_name: "Downstream",
      },
      time_zone: "Asia/Seoul",
      repository: {
        url: "https://github.com/example/downstream",
        default_branch: "main",
      },
      pages_url: "https://example.github.io/downstream/",
      plugin: {
        name: "coffee-chat-downstream",
        version: "1.0.0",
        description: "A downstream Coffee Chat instance.",
      },
      content_notice: CONTENT_NOTICE,
    },
    entity_changes: [
      {
        action: "create",
        temporary_key: "topic",
        value: { label: "Downstream identity", kind: "concept" },
      },
    ],
    note_changes: [
      {
        action: "create",
        temporary_key: "note",
        value: {
          title: "First downstream Note",
          temporal_coverage: "2026-08",
          sources: [
            {
              url: "https://example.com/public-source",
              title: "Public source",
              retrieval_status: "succeeded",
            },
          ],
          entity_refs: ["topic"],
          body: "An authored public Note.",
        },
      },
    ],
    setup_effects: [],
  };
}

function dependencies(
  date = "2026-08-01T15:30:00.000Z",
): CandidateDependencies {
  const ids = [...IDS];
  return {
    clock: { now: () => new Date(date) },
    uuid: { next: () => ids.shift()! },
  };
}

async function makeDownstreamRepository() {
  const base = await mkdtemp(resolve(tmpdir(), "coffee-chat-downstream-"));
  temporaryRoots.push(base);
  const root = resolve(base, "repository");
  await mkdir(root);
  for (const path of [
    "coffee-chat.json",
    "schemas",
    "tools",
    "method",
    "skills",
    "docs/assets/readme",
    "docs/testing.md",
    "LICENSE",
    "CONTENT_LICENSE.md",
  ])
    await cp(resolve(projectRoot, path), resolve(root, path), {
      recursive: true,
    });
  await execFileAsync(
    process.execPath,
    ["--experimental-strip-types", cliPath, "generate", "--format", "json"],
    { cwd: root, encoding: "utf8" },
  );
  await git(root, "init", "-q");
  await git(root, "config", "user.email", "downstream@example.com");
  await git(root, "config", "user.name", "Downstream Test");
  await git(
    root,
    "remote",
    "add",
    "origin",
    "git@github.com:Example/Downstream.git",
  );
  await git(root, "add", ".");
  await git(root, "commit", "-qm", "engine fork");
  const requestPath = resolve(base, "request.json");
  const out = resolve(base, "candidate");
  await writeFile(requestPath, `${JSON.stringify(request(), null, 2)}\n`);
  return { base, root, requestPath, out };
}

async function prepare(
  fixture: Awaited<ReturnType<typeof makeDownstreamRepository>>,
) {
  return prepareCandidate(
    { root: fixture.root, requestPath: fixture.requestPath, out: fixture.out },
    dependencies(),
  );
}

async function trackedBytes(root: string): Promise<Record<string, string>> {
  const paths = (await git(root, "ls-files", "-z")).split("\0").filter(Boolean);
  return Object.fromEntries(
    await Promise.all(
      paths.map(async (path) => [
        path,
        (await readFile(resolve(root, path))).toString("base64"),
      ]),
    ),
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("downstream repository identity", () => {
  it("normalizes HTTPS and SCP-like GitHub origins to one canonical identity", () => {
    const normalize = (
      candidate as typeof candidate & {
        normalizeGitHubRepositoryUrl?: (raw: string) => string;
      }
    ).normalizeGitHubRepositoryUrl;

    expect(normalize).toBeTypeOf("function");
    expect(normalize?.("https://GitHub.com/Example/Downstream.git/")).toBe(
      "https://github.com/example/downstream",
    );
    expect(normalize?.("git@github.com:EXAMPLE/DOWNSTREAM.git")).toBe(
      "https://github.com/example/downstream",
    );
  });

  it.each([
    "https://token@github.com/example/downstream",
    "https://github.com@example.com/example/downstream",
    "https://gitlab.com/example/downstream",
    "ssh://git@github.com/example/downstream.git",
    "https://github.com/example",
    "https://github.com/example/downstream//",
  ])("rejects ambiguous or non-GitHub origin %s", (raw) => {
    expect(() => candidate.normalizeGitHubRepositoryUrl(raw)).toThrow();
  });

  it("binds one lossless target fingerprint and exact proposed instance state through Preview and Receipt", async () => {
    const fixture = await makeDownstreamRepository();
    const engineBytes = await readFile(
      resolve(fixture.root, "coffee-chat.json"),
    );
    const prepared = await prepare(fixture);
    const manifest = JSON.parse(
      await readFile(resolve(fixture.out, "candidate-manifest.json"), "utf8"),
    ) as CandidateManifest & { target_fingerprint: TargetFingerprint };
    const preview = JSON.parse(
      await readFile(resolve(fixture.out, "preview.json"), "utf8"),
    ) as {
      current_repository_role: string;
      proposed_repository_role: string;
      actual_origin_url: string;
      proposed_time_zone: string;
      marketplace_name: string;
      content_notice: string;
      target_fingerprint: TargetFingerprint;
    };
    const common = await lstat(resolve(fixture.root, ".git"), {
      bigint: true,
    });

    expect(manifest.target_fingerprint).toEqual({
      git_common_dir: {
        real_path: await realpath(resolve(fixture.root, ".git")),
        device: common.dev.toString(10),
        inode: common.ino.toString(10),
      },
      origin_url: "https://github.com/example/downstream",
      base_commit: await git(fixture.root, "rev-parse", "HEAD"),
      pre_conversion_manifest_digest: sha256(engineBytes),
    });
    expect(preview).toMatchObject({
      current_repository_role: "engine",
      proposed_repository_role: "instance",
      actual_origin_url: "https://github.com/example/downstream",
      proposed_time_zone: "Asia/Seoul",
      marketplace_name: "coffee-chat-downstream-marketplace",
      content_notice: CONTENT_NOTICE,
      target_fingerprint: manifest.target_fingerprint,
    });
    expect(
      await readFile(
        resolve(fixture.out, "repository/CONTENT_LICENSE.md"),
        "utf8",
      ),
    ).toBe(CONTENT_NOTICE);

    const receipt = await applyCandidate(
      {
        root: fixture.root,
        candidateDir: fixture.out,
        approvedDigest: prepared.candidateDigest,
      },
      dependencies(),
    );
    expect(receipt).toMatchObject({
      status: "applied",
      target_fingerprint: manifest.target_fingerprint,
    });
    expect(
      await readFile(resolve(fixture.root, "CONTENT_LICENSE.md"), "utf8"),
    ).toBe(CONTENT_NOTICE);
    await execFileAsync(
      process.execPath,
      ["--experimental-strip-types", cliPath, "generate", "--format", "json"],
      { cwd: fixture.root, encoding: "utf8" },
    );
    expect(
      await readFile(resolve(fixture.root, "CONTENT_LICENSE.md"), "utf8"),
    ).toBe(CONTENT_NOTICE);
  }, 15_000);

  it("rejects the engine origin and differently normalized multiple origins before materialization", async () => {
    for (const mode of ["same-engine", "multiple"] as const) {
      const fixture = await makeDownstreamRepository();
      if (mode === "same-engine")
        await git(
          fixture.root,
          "remote",
          "set-url",
          "origin",
          "https://github.com/SonSangjoon/coffee-chat.git",
        );
      else
        await git(
          fixture.root,
          "config",
          "--add",
          "remote.origin.url",
          "https://github.com/another/downstream",
        );

      await expect(prepare(fixture)).rejects.toMatchObject({
        diagnostic: {
          code:
            mode === "same-engine"
              ? "make-mine-target-not-downstream"
              : "candidate-origin-invalid",
        },
      });
      await expect(lstat(resolve(fixture.out))).rejects.toThrow();
    }
  });

  it.each(["origin", "common-dir"] as const)(
    "rechecks a raced %s fingerprint immediately before transaction with zero canonical writes",
    async (race) => {
      const fixture = await makeDownstreamRepository();
      const prepared = await prepare(fixture);
      const before = await trackedBytes(fixture.root);
      let raced = false;
      const receipt = await applyCandidate(
        {
          root: fixture.root,
          candidateDir: fixture.out,
          approvedDigest: prepared.candidateDigest,
        },
        {
          ...dependencies(),
          fileSystem: {
            ...nodeFileSystem,
            checkpoint: async (point, path) => {
              await nodeFileSystem.checkpoint(point, path);
              if (!raced && point === "before-candidate-transaction") {
                raced = true;
                if (race === "origin")
                  await git(
                    fixture.root,
                    "remote",
                    "set-url",
                    "origin",
                    "https://github.com/example/raced-origin",
                  );
                else {
                  await rename(
                    resolve(fixture.root, ".git"),
                    resolve(fixture.root, ".git-before-race"),
                  );
                  await cp(
                    resolve(fixture.root, ".git-before-race"),
                    resolve(fixture.root, ".git"),
                    { recursive: true },
                  );
                }
              }
            },
          },
        },
      );

      expect(raced).toBe(true);
      expect(receipt).toMatchObject({
        status: "approval_invalidated",
        invalidation_code: "target-fingerprint-drift",
        changed_paths: [],
      });
      expect(await trackedBytes(fixture.root)).toEqual(before);
      expect(
        (await readdir(fixture.base)).some((path) =>
          path.endsWith(".transaction.json"),
        ),
      ).toBe(false);
    },
  );

  it("invalidates pre-conversion manifest digest drift and proposed-zone rollover", async () => {
    const digestFixture = await makeDownstreamRepository();
    const digestPrepared = await prepare(digestFixture);
    const manifestPath = resolve(digestFixture.root, "coffee-chat.json");
    await writeFile(
      manifestPath,
      (await readFile(manifestPath, "utf8")).replace(
        '"default_branch": "main"',
        '"default_branch": "trunk"',
      ),
    );
    const digestBytes = await trackedBytes(digestFixture.root);
    const digestReceipt = await applyCandidate(
      {
        root: digestFixture.root,
        candidateDir: digestFixture.out,
        approvedDigest: digestPrepared.candidateDigest,
      },
      dependencies(),
    );
    expect(digestReceipt).toMatchObject({
      status: "approval_invalidated",
      invalidation_code: "target-fingerprint-drift",
    });
    expect(await trackedBytes(digestFixture.root)).toEqual(digestBytes);

    const dateFixture = await makeDownstreamRepository();
    const datePrepared = await prepare(dateFixture);
    const dateReceipt = await applyCandidate(
      {
        root: dateFixture.root,
        candidateDir: dateFixture.out,
        approvedDigest: datePrepared.candidateDigest,
      },
      dependencies("2026-08-02T15:30:00.000Z"),
    );
    expect(dateReceipt).toMatchObject({
      status: "approval_invalidated",
      invalidation_code: "configured-date-drift",
    });
  });

  it.each([
    {
      name: "removed origin",
      mutate: (root: string) => git(root, "remote", "remove", "origin"),
    },
    {
      name: "GitLab origin",
      mutate: (root: string) =>
        git(
          root,
          "remote",
          "set-url",
          "origin",
          "https://gitlab.com/example/downstream",
        ),
    },
    {
      name: "credential-bearing origin",
      mutate: (root: string) =>
        git(
          root,
          "remote",
          "set-url",
          "origin",
          "https://token@github.com/example/downstream",
        ),
    },
  ])(
    "returns a schema-valid zero-write invalidation after $name drift",
    async ({ mutate }) => {
      const fixture = await makeDownstreamRepository();
      const prepared = await prepare(fixture);
      const manifest = JSON.parse(
        await readFile(resolve(fixture.out, "candidate-manifest.json"), "utf8"),
      ) as CandidateManifest;
      await mutate(fixture.root);
      const before = await trackedBytes(fixture.root);
      const receipt = await applyCandidate(
        {
          root: fixture.root,
          candidateDir: fixture.out,
          approvedDigest: prepared.candidateDigest,
        },
        dependencies(),
      );
      const schema = JSON.parse(
        await readFile(
          resolve(projectRoot, "schemas/receipt.schema.json"),
          "utf8",
        ),
      ) as object;
      const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
        schema,
      );

      expect(receipt).toMatchObject({
        status: "approval_invalidated",
        candidate_digest: prepared.candidateDigest,
        invalidation_code: "target-fingerprint-drift",
        changed_paths: [],
        validation: { status: "not_run" },
        target_fingerprint: manifest.target_fingerprint,
      });
      expect(validate(receipt), JSON.stringify(validate.errors, null, 2)).toBe(
        true,
      );
      expect(await trackedBytes(fixture.root)).toEqual(before);
      expect(
        (await readdir(fixture.base)).some((path) =>
          path.endsWith(".transaction.json"),
        ),
      ).toBe(false);
    },
  );

  it("rejects a malformed approved digest without returning an invalid Receipt", async () => {
    const fixture = await makeDownstreamRepository();
    await prepare(fixture);
    const before = await trackedBytes(fixture.root);

    await expect(
      applyCandidate(
        {
          root: fixture.root,
          candidateDir: fixture.out,
          approvedDigest: "not-a-digest",
        },
        dependencies(),
      ),
    ).rejects.toMatchObject({
      diagnostic: { code: "approved-digest-invalid" },
    });
    expect(await trackedBytes(fixture.root)).toEqual(before);
    expect(
      (await readdir(fixture.base)).some((path) =>
        path.endsWith(".transaction.json"),
      ),
    ).toBe(false);
  });

  it("requires the exact target fingerprint in every public Receipt", async () => {
    const schema = JSON.parse(
      await readFile(
        resolve(projectRoot, "schemas/receipt.schema.json"),
        "utf8",
      ),
    ) as object;
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      schema,
    );
    expect(
      validate({
        schema_version: "1.0.0",
        candidate_digest: `sha256:${"a".repeat(64)}`,
        status: "applied",
        changed_paths: ["./coffee-chat.json"],
        validation: { status: "passed" },
      }),
    ).toBe(false);
  });
});
