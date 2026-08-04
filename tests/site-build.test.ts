import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildSite,
  checkSiteOutput,
  type SiteBuildResult,
} from "../tools/site-build.ts";
import { releaseSiteRoot } from "../site/lib/build-context.ts";
import { sourceRouteSlug } from "../site/lib/load-site-model.ts";
import {
  createSyntheticSiteFixture,
  projectRoot,
  type SyntheticSiteFixture,
} from "./helpers/site-fixture.ts";

const fixtures: SyntheticSiteFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
  await rm(releaseSiteRoot, { recursive: true, force: true });
});

async function syntheticFixture(): Promise<SyntheticSiteFixture> {
  const fixture = await createSyntheticSiteFixture();
  fixtures.push(fixture);
  return fixture;
}

async function expectFile(path: string): Promise<string> {
  expect((await lstat(path)).isFile()).toBe(true);
  return readFile(path, "utf8");
}

describe.sequential("Task 6 static site build", () => {
  it("publishes the generic engine as one documentation route", async () => {
    const result = await buildSite({
      source_root: projectRoot,
      output_root: releaseSiteRoot,
      artifact_class: "release",
    });

    expect(result).toMatchObject({
      role: "engine",
      output_root: releaseSiteRoot,
      published_routes: ["index.html"],
    } satisfies Partial<SiteBuildResult>);
    const home = await expectFile(resolve(releaseSiteRoot, "index.html"));
    expect(home).toContain("Coffee Chat");
    expect(home).toContain("Init your Coffee Chat");
    await expect(
      lstat(resolve(releaseSiteRoot, "timeline")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      lstat(resolve(releaseSiteRoot, "graph")),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(checkSiteOutput(result)).resolves.toBeUndefined();
  });

  it("publishes every fictional instance route beneath its Pages base", async () => {
    const fixture = await syntheticFixture();
    const result = await buildSite({
      source_root: fixture.source,
      output_root: fixture.output,
      artifact_class: "ephemeral-test",
    });
    const noteId = "8a7b6c5d-4e3f-4a21-b098-7c6d5e4f3a2b";
    const entityId = "6f4e2d1c-8b7a-4d3e-a291-5c0b9f8e7d6c";
    const sourceSlug = sourceRouteSlug(
      "https://research.example/review-boundaries",
    );

    expect(result.role).toBe("instance");
    expect(result.published_routes).toEqual([
      "index.html",
      "timeline/index.html",
      "graph/index.html",
      `notes/${noteId}/index.html`,
      `entities/${entityId}/index.html`,
      `sources/${sourceSlug}/index.html`,
    ]);
    const home = await expectFile(resolve(fixture.output, "index.html"));
    const timeline = await expectFile(
      resolve(fixture.output, "timeline/index.html"),
    );
    await expectFile(resolve(fixture.output, "graph/index.html"));
    await expectFile(resolve(fixture.output, `notes/${noteId}/index.html`));
    await expectFile(
      resolve(fixture.output, `entities/${entityId}/index.html`),
    );
    await expectFile(
      resolve(fixture.output, `sources/${sourceSlug}/index.html`),
    );
    expect(home).toContain(fixture.head);
    expect(home).toContain(fixture.knowledgeDigest);
    expect(timeline).toContain("/coffee-chat-projection/graph/");
    await expect(checkSiteOutput(result)).resolves.toBeUndefined();
  });

  it("refuses to replace a nonempty ephemeral output directory", async () => {
    const fixture = await syntheticFixture();
    const sentinel = resolve(fixture.output, "keep-me.txt");
    const sentinelBytes = "unmanaged output must survive\n";
    await mkdir(fixture.output);
    await writeFile(sentinel, sentinelBytes);

    await expect(
      buildSite({
        source_root: fixture.source,
        output_root: fixture.output,
        artifact_class: "ephemeral-test",
      }),
    ).rejects.toMatchObject({
      diagnostic: { code: "site-ephemeral-output-not-empty" },
    });

    await expect(readFile(sentinel, "utf8")).resolves.toBe(sentinelBytes);
    await expect(
      lstat(resolve(fixture.output, "index.html")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
