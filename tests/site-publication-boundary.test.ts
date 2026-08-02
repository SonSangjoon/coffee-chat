import { lstat, mkdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ValidationFailure } from "../tools/contracts.ts";
import { bindSiteBuildRequest } from "../site/lib/build-context.ts";
import { loadSiteModel } from "../site/lib/load-site-model.ts";
import { renderMarkdown } from "../site/lib/render-markdown.ts";
import {
  createSyntheticSiteFixture,
  projectRoot,
  readKnowledgeIndex,
  type SyntheticSiteFixture,
} from "./helpers/site-fixture.ts";

const fixtures: SyntheticSiteFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

async function syntheticFixture(): Promise<SyntheticSiteFixture> {
  const fixture = await createSyntheticSiteFixture();
  fixtures.push(fixture);
  return fixture;
}

async function failureCode(operation: Promise<unknown>): Promise<string> {
  try {
    await operation;
    throw new Error("Expected a site publication boundary failure.");
  } catch (error) {
    if (!(error instanceof ValidationFailure)) throw error;
    return error.diagnostic.code;
  }
}

describe("Task 6 site publication boundary", () => {
  it("binds release builds to the current root and exact dist/site output", async () => {
    const fixture = await syntheticFixture();
    await expect(
      failureCode(
        loadSiteModel({
          source_root: fixture.source,
          output_root: resolve(projectRoot, "dist/site"),
          artifact_class: "release",
        }),
      ),
    ).resolves.toBe("site-release-source-mismatch");
    await expect(
      failureCode(
        loadSiteModel({
          source_root: projectRoot,
          output_root: resolve(projectRoot, "dist/not-site"),
          artifact_class: "release",
        }),
      ),
    ).resolves.toBe("site-release-output-mismatch");
  });

  it("rejects checkout fixtures and checkout output for ephemeral builds", async () => {
    const fixture = await syntheticFixture();
    await expect(
      failureCode(
        loadSiteModel({
          source_root: resolve(
            projectRoot,
            "tests/fixtures/synthetic-instance",
          ),
          output_root: fixture.output,
          artifact_class: "ephemeral-test",
        }),
      ),
    ).resolves.toBe("site-ephemeral-source-must-be-external");
    await expect(
      failureCode(
        loadSiteModel({
          source_root: fixture.source,
          output_root: resolve(projectRoot, "dist/site-fixture"),
          artifact_class: "ephemeral-test",
        }),
      ),
    ).resolves.toBe("site-ephemeral-output-must-be-external");

    await expect(
      failureCode(
        bindSiteBuildRequest({
          source_root: resolve(projectRoot, ".."),
          output_root: fixture.output,
          artifact_class: "ephemeral-test",
        }),
      ),
    ).resolves.toBe("site-ephemeral-source-must-be-external");
    await expect(
      failureCode(
        bindSiteBuildRequest({
          source_root: fixture.source,
          output_root: resolve(projectRoot, ".."),
          artifact_class: "ephemeral-test",
        }),
      ),
    ).resolves.toBe("site-ephemeral-output-must-be-external");
  });

  it("rejects symlink aliases and overlapping ephemeral roots", async () => {
    const fixture = await syntheticFixture();
    const sourceAlias = resolve(fixture.base, "source-alias");
    const outputAlias = resolve(fixture.base, "output-alias");
    await symlink(fixture.source, sourceAlias, "dir");
    await symlink(projectRoot, outputAlias, "dir");

    await expect(
      failureCode(
        loadSiteModel({
          source_root: sourceAlias,
          output_root: fixture.output,
          artifact_class: "ephemeral-test",
        }),
      ),
    ).resolves.toBe("site-source-root-unsafe");
    await expect(
      failureCode(
        loadSiteModel({
          source_root: fixture.source,
          output_root: outputAlias,
          artifact_class: "ephemeral-test",
        }),
      ),
    ).resolves.toBe("site-output-root-unsafe");
    await expect(
      failureCode(
        loadSiteModel({
          source_root: fixture.source,
          output_root: resolve(fixture.source, "dist/site"),
          artifact_class: "ephemeral-test",
        }),
      ),
    ).resolves.toBe("site-ephemeral-roots-overlap");
    await expect(
      failureCode(
        loadSiteModel({
          source_root: fixture.source,
          output_root: fixture.base,
          artifact_class: "ephemeral-test",
        }),
      ),
    ).resolves.toBe("site-ephemeral-roots-overlap");
  });

  it("rejects canonical inputs that alias other in-repository content", async () => {
    const fixture = await syntheticFixture();
    const fixtureDirectory = resolve(fixture.source, "tests/fixtures/alias");
    await mkdir(fixtureDirectory, { recursive: true });
    await rename(
      resolve(fixture.source, "coffee-chat.json"),
      resolve(fixtureDirectory, "coffee-chat.json"),
    );
    await symlink(
      "tests/fixtures/alias/coffee-chat.json",
      resolve(fixture.source, "coffee-chat.json"),
    );

    await expect(
      failureCode(
        loadSiteModel({
          source_root: fixture.source,
          output_root: fixture.output,
          artifact_class: "ephemeral-test",
        }),
      ),
    ).resolves.toBe("site-source-symlink");
  });

  it("requires an exact current generated instance index", async () => {
    const missing = await syntheticFixture();
    await rm(resolve(missing.source, "knowledge/index.json"));
    await expect(
      failureCode(
        loadSiteModel({
          source_root: missing.source,
          output_root: missing.output,
          artifact_class: "ephemeral-test",
        }),
      ),
    ).resolves.toBe("stale-generated-index");

    const stale = await syntheticFixture();
    const index = await readKnowledgeIndex(stale.source);
    index.knowledge_digest = `sha256:${"0".repeat(64)}`;
    await writeFile(
      resolve(stale.source, "knowledge/index.json"),
      `${JSON.stringify(index, null, 2)}\n`,
    );
    await expect(
      failureCode(
        loadSiteModel({
          source_root: stale.source,
          output_root: stale.output,
          artifact_class: "ephemeral-test",
        }),
      ),
    ).resolves.toBe("stale-generated-index");
  });

  it("loads models without creating or mutating the requested output root", async () => {
    const fixture = await syntheticFixture();
    await loadSiteModel({
      source_root: fixture.source,
      output_root: fixture.output,
      artifact_class: "ephemeral-test",
    });
    await expect(lstat(fixture.output)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

describe("Task 6 Markdown publication boundary", () => {
  it("renders an allowlisted tree and neutralizes unsafe or remote content", () => {
    const markdown = [
      "# Safe heading",
      "",
      "<script>alert('raw')</script>",
      "",
      '<iframe src="https://remote.example/embed"></iframe>',
      "",
      "![remote image](https://remote.example/image.png)",
      "",
      "[external](https://external.example/path)",
      "",
      "[unsafe](javascript:alert('x'))",
      "",
      "[internal](./123e4567-e89b-42d3-a456-426614174000.md)",
      "",
      "`<button onclick=alert(1)>code</button>`",
    ].join("\n");

    const html = renderMarkdown(markdown, {
      resolve_internal_link: (href) =>
        href.endsWith(".md") ? "/coffee-chat/notes/example/" : href,
    });

    expect(html).toContain("<h1>Safe heading</h1>");
    expect(html).toContain(
      '<a href="https://external.example/path" target="_blank" rel="noopener noreferrer">external</a>',
    );
    expect(html).toContain(
      '<a href="/coffee-chat/notes/example/">internal</a>',
    );
    expect(html).toContain("&lt;button onclick=alert(1)&gt;");
    expect(html).not.toMatch(/<(?:script|iframe|img)\b/i);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("remote.example");
    expect(html).not.toContain("<button");
  });
});
