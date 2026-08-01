import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(import.meta.dirname, "..");
const fixtureRoot = resolve(import.meta.dirname, "fixtures/initialized-valid");
const cliPath = resolve(projectRoot, "tools/cc.ts");
const temporaryRoots: string[] = [];

type Diagnostic = {
  code: string;
  path: string;
  pointer?: string;
  message: string;
};

async function makeRepository(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "coffee-chat-task-2-"));
  temporaryRoots.push(root);
  await cp(fixtureRoot, root, { recursive: true });
  await cp(resolve(projectRoot, "schemas"), resolve(root, "schemas"), {
    recursive: true,
  });
  return root;
}

async function runCli(
  root: string,
  ...args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(
      process.execPath,
      ["--experimental-strip-types", cliPath, ...args],
      { cwd: root, encoding: "utf8" },
    );
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failed = error as {
      code: number;
      stdout: string;
      stderr: string;
    };
    return {
      exitCode: failed.code,
      stdout: failed.stdout,
      stderr: failed.stderr,
    };
  }
}

async function diagnostics(
  root: string,
  command = "validate",
  ...args: string[]
): Promise<{ exitCode: number; diagnostics: Diagnostic[] }> {
  const result = await runCli(root, command, "--format", "json", ...args);
  return {
    exitCode: result.exitCode,
    diagnostics: JSON.parse(result.stdout) as Diagnostic[],
  };
}

async function mutate(
  root: string,
  path: string,
  replacement: (text: string) => string,
): Promise<void> {
  const absolute = resolve(root, path);
  await writeFile(absolute, replacement(await readFile(absolute, "utf8")));
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe("Coffee Chat Task 2 public CLI", () => {
  it("exposes validate, generate, check, stable formats, and documented exits", async () => {
    const root = await makeRepository();

    const initial = await diagnostics(root);
    expect(initial).toEqual({ exitCode: 0, diagnostics: [] });

    const generated = await runCli(root, "generate", "--format", "json");
    expect(generated.exitCode).toBe(0);
    expect(JSON.parse(generated.stdout)).toEqual([]);
    expect((await lstat(resolve(root, "knowledge/index.json"))).isFile()).toBe(
      true,
    );

    expect((await diagnostics(root, "check")).exitCode).toBe(0);
    expect(
      (await runCli(root, "generate", "--check", "--format", "json")).exitCode,
    ).toBe(0);

    await mutate(root, "coffee-chat.json", (text) =>
      text.replace('"time_zone": "Asia/Seoul"', '"time_zone": "Bad/Zone"'),
    );
    const invalid = await diagnostics(root);
    expect(invalid.exitCode).toBe(1);
    expect(invalid.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "invalid-time-zone",
          path: "./coffee-chat.json",
          pointer: "/time_zone",
        }),
      ]),
    );
    expect(invalid.diagnostics[0]?.message).not.toContain("Bad/Zone");

    const usage = await runCli(root, "validate", "--wat");
    expect(usage.exitCode).toBe(2);
    expect(usage.stdout).toContain("[cli-usage]");
  });

  it("accepts a pending graph without inventing canonical knowledge", async () => {
    const root = projectRoot;
    expect(await runCli(root, "validate", "--format", "json")).toMatchObject({
      exitCode: 0,
      stdout: "[]\n",
    });
    expect(await runCli(root, "generate", "--format", "json")).toMatchObject({
      exitCode: 0,
      stdout: "[]\n",
    });
  });
});

describe("strict authored parsing and repository integrity", () => {
  it("rejects non-RFC whitespace in JSON", async () => {
    const root = await makeRepository();
    await mutate(root, "coffee-chat.json", (text) =>
      text.replace("{\n", "{\u00a0\n"),
    );
    const result = await diagnostics(root);
    expect(result.exitCode).toBe(1);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid-json" }),
      ]),
    );
  });

  it("does not trim non-RFC whitespace before strict JSON parsing", async () => {
    const root = await makeRepository();
    await mutate(
      root,
      "coffee-chat.json",
      (text) => `${text.slice(0, -1)}\u00a0\n`,
    );
    const result = await diagnostics(root);
    expect(result.exitCode).toBe(1);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid-json" }),
      ]),
    );
  });

  it.each([
    [
      "duplicate JSON members",
      "coffee-chat.json",
      (text: string) =>
        text.replace(
          '  "schema_version": "1.0.0",',
          '  "schema_version": "1.0.0",\n  "schema_version": "1.0.0",',
        ),
      "duplicate-json-member",
    ],
    [
      "JSON comments",
      "coffee-chat.json",
      (text: string) => text.replace("{\n", "{\n  // no extensions\n"),
      "invalid-json",
    ],
    [
      "JSON trailing commas",
      "coffee-chat.json",
      (text: string) => text.replace("  }\n}\n", "  },\n}\n"),
      "invalid-json",
    ],
    [
      "JSON NaN",
      "coffee-chat.json",
      (text: string) => text.replace('"version": "1.0.0"', '"version": NaN'),
      "invalid-json",
    ],
    [
      "JSON Infinity",
      "coffee-chat.json",
      (text: string) =>
        text.replace('"version": "1.0.0"', '"version": Infinity'),
      "invalid-json",
    ],
    [
      "duplicate YAML keys",
      "knowledge/entities.yml",
      (text: string) =>
        text.replace(
          '  label: "Iteration"',
          '  label: "Iteration"\n  label: "Duplicate"',
        ),
      "duplicate-yaml-key",
    ],
    [
      "YAML merge keys",
      "knowledge/entities.yml",
      (_text: string) =>
        '- &defaults\n  id: "48d1c840-5d38-48d0-8e74-7187d9f0c2fd"\n  label: "Base"\n- <<: *defaults\n  id: "8e22e2bf-1368-4477-a194-44ed16db3188"\n  label: "Merged"\n',
      "yaml-merge-key",
    ],
    [
      "YAML aliases",
      "knowledge/entities.yml",
      (text: string) =>
        text
          .replace('"Iteration"', '&label "Iteration"')
          .replace('"Iteration loop"', "*label"),
      "yaml-alias",
    ],
    [
      "YAML custom tags",
      "knowledge/entities.yml",
      (text: string) => text.replace('"Iteration"', '!owner "Iteration"'),
      "yaml-custom-tag",
    ],
    [
      "YAML non-JSON values",
      "knowledge/entities.yml",
      (text: string) => text.replace('kind: "process"', "kind: .nan"),
      "yaml-non-json-value",
    ],
  ])("rejects %s before schema validation", async (_name, path, edit, code) => {
    const root = await makeRepository();
    await mutate(root, path, edit);
    const result = await diagnostics(root);

    expect(result.exitCode).toBe(1);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  });

  it.each([
    ["invalid UTF-8", Buffer.from([0xc3, 0x28, 0x0a]), "invalid-utf8"],
    ["CRLF", Buffer.from("[]\r\n"), "non-canonical-newlines"],
    ["no final newline", Buffer.from("[]"), "non-canonical-newlines"],
    ["two final newlines", Buffer.from("[]\n\n"), "non-canonical-newlines"],
  ])("rejects %s text", async (_name, bytes, code) => {
    const root = await makeRepository();
    await writeFile(resolve(root, "knowledge/entities.yml"), bytes);
    const result = await diagnostics(root);
    expect(result.exitCode).toBe(1);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  });

  it.each([
    [
      "undeclared external links",
      "An [undeclared link](https://example.com/not-declared).",
      "undeclared-external-link",
    ],
    [
      "remote images",
      "![tracking image](https://example.com/pixel.png)",
      "remote-image",
    ],
    ["unsafe schemes", "[bad](javascript:alert(1))", "unsafe-link"],
    [
      "broken internal Note links",
      "[missing](./00000000-0000-4000-8000-000000000000.md)",
      "broken-note-link",
    ],
  ])("rejects %s in Markdown", async (_name, line, code) => {
    const root = await makeRepository();
    await mutate(
      root,
      "knowledge/notes/a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61.md",
      (text) => `${text.slice(0, -1)}\n\n${line}\n`,
    );
    const result = await diagnostics(root);
    expect(result.exitCode).toBe(1);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  });

  it("rejects duplicate Sources, unknown Entities, noncanonical UUIDs, and filename/ID mismatch", async () => {
    const cases: Array<[string, (text: string) => string, string]> = [
      [
        "duplicate-source-url",
        (text) =>
          text.replace(
            '  - url: "https://example.com/second"',
            '  - url: "https://example.com/shared"',
          ),
        "knowledge/notes/a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61.md",
      ],
      [
        "unknown-entity",
        (text) =>
          text.replace(
            "48d1c840-5d38-48d0-8e74-7187d9f0c2fd",
            "00000000-0000-4000-8000-000000000000",
          ),
        "knowledge/notes/a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61.md",
      ],
      [
        "invalid-uuid-v4",
        (text) =>
          text.replace(
            "69d249c9-3c4f-4e0d-b622-74b292f87e9d",
            "69D249C9-3C4F-4E0D-B622-74B292F87E9D",
          ),
        "coffee-chat.json",
      ],
      [
        "note-id-filename-mismatch",
        (text) =>
          text.replace(
            "a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61",
            "00000000-0000-4000-8000-000000000000",
          ),
        "knowledge/notes/a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61.md",
      ],
    ];

    for (const [code, edit, path] of cases) {
      const root = await makeRepository();
      await mutate(root, path, edit);
      const result = await diagnostics(root);
      expect(result.exitCode, code).toBe(1);
      expect(result.diagnostics, code).toEqual(
        expect.arrayContaining([expect.objectContaining({ code })]),
      );
    }
  });

  it("rejects marketplace derivation drift and repository-path symlink escape", async () => {
    const driftRoot = await makeRepository();
    await mutate(driftRoot, "coffee-chat.json", (text) =>
      text.replace("coffee-chat-example-marketplace", "unrelated-marketplace"),
    );
    expect((await diagnostics(driftRoot)).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "marketplace-name-mismatch" }),
      ]),
    );

    const escapeRoot = await makeRepository();
    const outside = await mkdtemp(resolve(tmpdir(), "coffee-chat-outside-"));
    temporaryRoots.push(outside);
    await rm(resolve(escapeRoot, "knowledge/entities.yml"));
    await import("node:fs/promises").then(({ symlink }) =>
      symlink(
        resolve(outside, "entities.yml"),
        resolve(escapeRoot, "knowledge/entities.yml"),
      ),
    );
    await writeFile(resolve(outside, "entities.yml"), "[]\n");
    expect((await diagnostics(escapeRoot)).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "symlink-escape" }),
      ]),
    );

    const declaredPathRoot = await makeRepository();
    const declaredOutside = await mkdtemp(
      resolve(tmpdir(), "coffee-chat-declared-path-"),
    );
    temporaryRoots.push(declaredOutside);
    const { symlink } = await import("node:fs/promises");
    await symlink(declaredOutside, resolve(declaredPathRoot, "skills"));
    expect((await diagnostics(declaredPathRoot)).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "symlink-escape" }),
      ]),
    );
  });

  it("redacts secret-like content and credential-bearing URLs", async () => {
    const secretRoot = await makeRepository();
    const secret = "ghp_123456789012345678901234567890123456";
    await mutate(
      secretRoot,
      "knowledge/notes/a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61.md",
      (text) => `${text.slice(0, -1)}\n\n${secret}\n`,
    );
    const secretResult = await diagnostics(secretRoot);
    expect(secretResult.exitCode).toBe(1);
    expect(secretResult.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "detected-secret" }),
      ]),
    );
    expect(JSON.stringify(secretResult.diagnostics)).not.toContain(secret);

    const urlRoot = await makeRepository();
    const signedValue = "do-not-print-this-signature";
    await mutate(
      urlRoot,
      "knowledge/notes/b52d8b79-8247-4dce-96e8-35beb40137bc.md",
      (text) =>
        text.replaceAll(
          "https://example.com/shared",
          `https://example.com/shared?token=${signedValue}`,
        ),
    );
    const urlResult = await diagnostics(urlRoot);
    expect(urlResult.exitCode).toBe(1);
    expect(urlResult.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "credential-bearing-url" }),
      ]),
    );
    expect(JSON.stringify(urlResult.diagnostics)).not.toContain(signedValue);
  });

  it("rejects credential-bearing manifest URLs without echoing credentials", async () => {
    const root = await makeRepository();
    const credential = "private-password";
    await mutate(root, "coffee-chat.json", (text) =>
      text.replace(
        "https://github.com/example/coffee-chat",
        `https://owner:${credential}@github.com/example/coffee-chat`,
      ),
    );
    const result = await diagnostics(root);
    expect(result.exitCode).toBe(1);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "credential-bearing-url" }),
      ]),
    );
    expect(JSON.stringify(result.diagnostics)).not.toContain(credential);
  });

  it("rejects an explicit full-form custom YAML tag", async () => {
    const root = await makeRepository();
    await mutate(root, "knowledge/entities.yml", (text) =>
      text.replace(
        'label: "Iteration"',
        'label: !<tag:example.com,2026:owner> "Iteration"',
      ),
    );
    expect((await diagnostics(root)).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "yaml-custom-tag" }),
      ]),
    );
  });

  it("does not silently ignore a nested canonical Note", async () => {
    const root = await makeRepository();
    const { mkdir } = await import("node:fs/promises");
    await mkdir(resolve(root, "knowledge/notes/nested"));
    await cp(
      resolve(root, "knowledge/notes/b52d8b79-8247-4dce-96e8-35beb40137bc.md"),
      resolve(
        root,
        "knowledge/notes/nested/b52d8b79-8247-4dce-96e8-35beb40137bc.md",
      ),
    );
    const result = await diagnostics(root);
    expect(result.exitCode).toBe(1);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid-note-path" }),
      ]),
    );
  });

  it("rejects remote HTML embeds", async () => {
    const root = await makeRepository();
    await mutate(
      root,
      "knowledge/notes/a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61.md",
      (text) =>
        `${text.slice(0, -1)}\n\n<iframe src="https://example.com/embed"></iframe>\n`,
    );
    expect((await diagnostics(root)).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "remote-embed" }),
      ]),
    );
  });
});

describe("Gregorian temporal behavior", () => {
  it("rejects invalid calendar units and reversed mixed-precision ranges", async () => {
    for (const [value, code] of [
      ["2023-02-29", "invalid-calendar-date"],
      ["2024-02-30", "invalid-calendar-date"],
      ["2025-03/2025-02-28", "reversed-temporal-range"],
    ]) {
      const root = await makeRepository();
      await mutate(
        root,
        "knowledge/notes/a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61.md",
        (text) => text.replace("2024-02/2024-03-01", value),
      );
      const result = await diagnostics(root);
      expect(result.exitCode, value).toBe(1);
      expect(result.diagnostics, value).toEqual(
        expect.arrayContaining([expect.objectContaining({ code })]),
      );
    }
  });

  it("exposes inclusive overlap and a full-date first-recorded cutoff without inventing precision", async () => {
    const temporal = await import("../tools/temporal.ts");

    expect(temporal.expandTemporalCoverage("2024-02")).toEqual({
      start: "2024-02-01",
      end: "2024-02-29",
    });
    expect(
      temporal.temporalCoverageOverlaps("2024-02/2024-03", "2024-03-31"),
    ).toBe(true);
    expect(
      temporal.temporalCoverageOverlaps("2024-02", "2024-03-01/2024-03-31"),
    ).toBe(false);
    expect(temporal.recordedOnThrough("2026-08-01", "2026-08-01")).toBe(true);
    expect(() => temporal.recordedOnThrough("2026-08-01", "2026-08")).toThrow(
      /full Gregorian date/,
    );
  });
});

describe("deterministic temporal knowledge index", () => {
  it("uses RFC 8785-style canonical object ordering for the knowledge digest", async () => {
    const { canonicalizeJson } = await import("../tools/generate.ts");
    const canonical = '{"a":2,"b":1,"text":"한글"}';
    expect(canonicalizeJson({ b: 1, text: "한글", a: 2 })).toBe(canonical);
    expect(createHash("sha256").update(canonical).digest("hex")).toBe(
      "445ff394aac35e2daf96e915765c2ffde7bafaa493e5a58bd8881d75e18010a1",
    );
    expect(
      canonicalizeJson([
        333333333.33333329, 1e30, 4.5, 2e-3, 0.000000000000000000000000001,
      ]),
    ).toBe("[333333333.3333333,1e+30,4.5,0.002,1e-27]");
    expect(() => canonicalizeJson("\ud800")).toThrow(/surrogate/i);
  });

  it("keeps exact URL variants as distinct Source identities", async () => {
    const root = await makeRepository();
    await mutate(
      root,
      "knowledge/notes/b52d8b79-8247-4dce-96e8-35beb40137bc.md",
      (text) =>
        text.replaceAll(
          "https://example.com/shared",
          "https://example.com/shared/",
        ),
    );
    await runCli(root, "generate", "--format", "json");
    const index = JSON.parse(
      await readFile(resolve(root, "knowledge/index.json"), "utf8"),
    ) as { nodes: Array<{ id: string; type: string }> };
    expect(
      index.nodes.filter(({ type }) => type === "source").map(({ id }) => id),
    ).toEqual([
      "https://example.com/second",
      "https://example.com/shared",
      "https://example.com/shared/",
    ]);
  });

  it("sorts nodes and triples while preserving every Note-local Citation observation", async () => {
    const root = await makeRepository();
    expect((await runCli(root, "generate", "--format", "json")).exitCode).toBe(
      0,
    );
    const index = JSON.parse(
      await readFile(resolve(root, "knowledge/index.json"), "utf8"),
    ) as {
      nodes: Array<Record<string, unknown>>;
      edges: Array<Record<string, unknown>>;
    };

    expect(index.nodes.map(({ type, id }) => [type, id])).toEqual([
      ["entity", "48d1c840-5d38-48d0-8e74-7187d9f0c2fd"],
      ["note", "a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61"],
      ["note", "b52d8b79-8247-4dce-96e8-35beb40137bc"],
      ["source", "https://example.com/second"],
      ["source", "https://example.com/shared"],
    ]);
    expect(index.edges).toHaveLength(5);
    expect(
      index.edges.filter(
        (edge) =>
          edge.predicate === "cites" &&
          edge.object === "https://example.com/shared",
      ),
    ).toEqual([
      expect.objectContaining({
        subject: "a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61",
        citation_metadata: {
          title: "Shared title observed first",
          published_on: "2024-02",
          accessed_on: "2026-08-01",
        },
      }),
      expect.objectContaining({
        subject: "b52d8b79-8247-4dce-96e8-35beb40137bc",
        citation_metadata: {
          title: "A different local observation",
          published_on: "2024-02-29",
        },
      }),
    ]);
  });

  it("is byte-identical, changes both digests for a body-only edit, and generate --check never writes", async () => {
    const root = await makeRepository();
    await runCli(root, "generate", "--format", "json");
    const firstBytes = await readFile(resolve(root, "knowledge/index.json"));
    const first = JSON.parse(firstBytes.toString("utf8")) as {
      knowledge_digest: string;
      nodes: Array<{ id: string; content_digest?: string }>;
    };

    await runCli(root, "generate", "--format", "json");
    expect(await readFile(resolve(root, "knowledge/index.json"))).toEqual(
      firstBytes,
    );

    await mutate(
      root,
      "knowledge/notes/a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61.md",
      (text) => text.replace("This note cites", "This changed note cites"),
    );
    const beforeCheck = await readFile(resolve(root, "knowledge/index.json"));
    const checked = await diagnostics(root, "generate", "--check");
    expect(checked.exitCode).toBe(1);
    expect(checked.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "stale-generated-index" }),
      ]),
    );
    expect(await readFile(resolve(root, "knowledge/index.json"))).toEqual(
      beforeCheck,
    );

    await runCli(root, "generate", "--format", "json");
    const second = JSON.parse(
      await readFile(resolve(root, "knowledge/index.json"), "utf8"),
    ) as typeof first;
    expect(second.knowledge_digest).not.toBe(first.knowledge_digest);
    expect(
      second.nodes.find(
        ({ id }) => id === "a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61",
      )?.content_digest,
    ).not.toBe(
      first.nodes.find(
        ({ id }) => id === "a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61",
      )?.content_digest,
    );
  });

  it("regenerates a malformed old index from authored inputs", async () => {
    const root = await makeRepository();
    await writeFile(resolve(root, "knowledge/index.json"), "not json\n");
    const result = await runCli(root, "generate", "--format", "json");
    expect(result.exitCode).toBe(0);
    expect(
      JSON.parse(await readFile(resolve(root, "knowledge/index.json"), "utf8")),
    ).toMatchObject({ schema_version: "1.0.0", nodes: expect.any(Array) });
  });

  it("refuses a generated-output directory symlink escape", async () => {
    const root = await makeRepository();
    const outside = await mkdtemp(resolve(tmpdir(), "coffee-chat-output-"));
    temporaryRoots.push(outside);
    await mutate(root, "coffee-chat.json", (text) =>
      text.replace("./knowledge/index.json", "./generated/index.json"),
    );
    const { symlink } = await import("node:fs/promises");
    await symlink(outside, resolve(root, "generated"));
    const result = await diagnostics(root, "generate");
    expect(result.exitCode).not.toBe(0);
    await expect(lstat(resolve(outside, "index.json"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("Git snapshot and identity isolation", () => {
  it("isolates unstaged additions and staged deletions", async () => {
    const root = await makeRepository();
    await execFileAsync("git", ["init", "-q"], { cwd: root });
    await execFileAsync("git", ["add", "."], { cwd: root });

    const untracked = resolve(
      root,
      "knowledge/notes/00000000-0000-4000-8000-000000000000.md",
    );
    await writeFile(untracked, "not frontmatter\n");
    expect(
      (await diagnostics(root, "validate", "--snapshot", "staged")).exitCode,
    ).toBe(0);
    expect(
      (await diagnostics(root, "validate", "--snapshot", "worktree")).exitCode,
    ).toBe(1);
    await rm(untracked);

    await mutate(
      root,
      "knowledge/notes/a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61.md",
      (text) =>
        text.replace(
          "\n\nIt also links to [a later note](./b52d8b79-8247-4dce-96e8-35beb40137bc.md).",
          "",
        ),
    );
    await execFileAsync(
      "git",
      ["add", "knowledge/notes/a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61.md"],
      { cwd: root },
    );
    await execFileAsync(
      "git",
      [
        "rm",
        "--cached",
        "knowledge/notes/b52d8b79-8247-4dce-96e8-35beb40137bc.md",
      ],
      { cwd: root },
    );
    expect(
      (await diagnostics(root, "validate", "--snapshot", "staged")).exitCode,
    ).toBe(0);
    expect(
      (await diagnostics(root, "validate", "--snapshot", "worktree")).exitCode,
    ).toBe(0);
  });

  it("returns exit 2 when --base-ref cannot resolve", async () => {
    const root = await makeRepository();
    await execFileAsync("git", ["init", "-q"], { cwd: root });
    const result = await diagnostics(
      root,
      "validate",
      "--base-ref",
      "refs/heads/does-not-exist",
    );
    expect(result.exitCode).toBe(2);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "base-ref-unavailable" }),
    ]);
  });

  it("validates only index bytes for --snapshot staged and leaves worktree bytes untouched", async () => {
    const root = await makeRepository();
    await execFileAsync("git", ["init", "-q"], { cwd: root });
    await execFileAsync("git", ["add", "."], { cwd: root });
    await mutate(root, "coffee-chat.json", (text) =>
      text.replace("coffee-chat-example-marketplace", "wrong-marketplace"),
    );

    expect(
      (await diagnostics(root, "validate", "--snapshot", "worktree")).exitCode,
    ).toBe(1);
    expect(
      (await diagnostics(root, "validate", "--snapshot", "staged")).exitCode,
    ).toBe(0);

    const worktreeManifest = await readFile(resolve(root, "coffee-chat.json"));
    expect(
      (
        await runCli(
          root,
          "generate",
          "--snapshot",
          "staged",
          "--format",
          "json",
        )
      ).exitCode,
    ).toBe(2);
    expect(await readFile(resolve(root, "coffee-chat.json"))).toEqual(
      worktreeManifest,
    );
  });

  it("uses --base-ref to reject immutable Profile and Entity ID mutation", async () => {
    const root = await makeRepository();
    await execFileAsync("git", ["init", "-q"], { cwd: root });
    await execFileAsync(
      "git",
      ["config", "user.email", "fixture@example.com"],
      { cwd: root },
    );
    await execFileAsync("git", ["config", "user.name", "Fixture"], {
      cwd: root,
    });
    await execFileAsync("git", ["add", "."], { cwd: root });
    await execFileAsync("git", ["commit", "-qm", "base"], { cwd: root });

    await mutate(root, "coffee-chat.json", (text) =>
      text.replace(
        "69d249c9-3c4f-4e0d-b622-74b292f87e9d",
        "8f75c513-778c-4050-bd40-cb087f81d1fa",
      ),
    );
    await mutate(root, "knowledge/entities.yml", (text) =>
      text.replace(
        "48d1c840-5d38-48d0-8e74-7187d9f0c2fd",
        "8e22e2bf-1368-4477-a194-44ed16db3188",
      ),
    );
    await mutate(
      root,
      "knowledge/notes/a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61.md",
      (text) =>
        text.replace(
          "48d1c840-5d38-48d0-8e74-7187d9f0c2fd",
          "8e22e2bf-1368-4477-a194-44ed16db3188",
        ),
    );

    const result = await diagnostics(root, "validate", "--base-ref", "HEAD");
    expect(result.exitCode).toBe(1);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "immutable-profile-id" }),
        expect.objectContaining({ code: "immutable-entity-id" }),
      ]),
    );
  });

  it("uses --base-ref to preserve a Note's original recorded_on", async () => {
    const root = await makeRepository();
    await execFileAsync("git", ["init", "-q"], { cwd: root });
    await execFileAsync(
      "git",
      ["config", "user.email", "fixture@example.com"],
      { cwd: root },
    );
    await execFileAsync("git", ["config", "user.name", "Fixture"], {
      cwd: root,
    });
    await execFileAsync("git", ["add", "."], { cwd: root });
    await execFileAsync("git", ["commit", "-qm", "base"], { cwd: root });
    await mutate(
      root,
      "knowledge/notes/a41c7f5e-9f67-4fe8-b3c7-2c8b4bd79e61.md",
      (text) =>
        text.replace('recorded_on: "2026-08-01"', 'recorded_on: "2026-08-03"'),
    );
    const result = await diagnostics(root, "validate", "--base-ref", "HEAD");
    expect(result.exitCode).toBe(1);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "immutable-recorded-on" }),
      ]),
    );
  });
});
