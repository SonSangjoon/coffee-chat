import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { expect, test, type Page } from "@playwright/test";
import { generatedIndexBytes } from "../../tools/generate.ts";
import { isInstanceGraph, validateKnowledge } from "../../tools/knowledge.ts";
import { createSnapshot } from "../../tools/snapshot.ts";
import {
  createSyntheticSiteFixture,
  gitHead,
  projectRoot,
  type SyntheticSiteFixture,
} from "../helpers/site-fixture.ts";

const execFileAsync = promisify(execFile);
const engineBasePath = "/coffee-chat/";
const instanceBasePath = "/coffee-chat-projection/";
const noteId = "8a7b6c5d-4e3f-4a21-b098-7c6d5e4f3a2b";
const laterNoteId = "7c6d5e4f-3a2b-4d1c-8b7a-6f4e2d1c9a80";
const entityId = "6f4e2d1c-8b7a-4d3e-a291-5c0b9f8e7d6c";
const longEntityId = "5e4f3a2b-1c9a-4d8b-a706-f4e2d1c8b7a6";
const sourceUrl = "https://research.example/review-boundaries";
const firstObservationTitle = "Fictional review-boundary field notes";
const laterObservationTitle = "Later fictional observation of the same URL";
const longEntityLabel = `Boundary${"WithoutBreaks".repeat(24)}`;
const sourceSlug =
  "faa44a82b6b6054537f05d756baaaed4430befc783adac6efe1eca41173eec05";
const unsafeSentinel = "coffee-chat-e2e-unsafe-executed";

type StaticSite = {
  origin: string;
  close(): Promise<void>;
};

let engineSite: StaticSite | undefined;
let instanceSite: StaticSite | undefined;
let fixture: SyntheticSiteFixture | undefined;
let engineCommit = "";

test.beforeAll(async () => {
  fixture = await createSyntheticSiteFixture();
  await addSafeToRejectPublicationPayload(fixture);
  engineCommit = await gitHead(projectRoot);

  await runSiteBuild();
  await runSiteBuild({
    sourceRoot: fixture.source,
    outputRoot: fixture.output,
    artifactClass: "ephemeral-test",
  });

  engineSite = await startStaticSite(
    resolve(projectRoot, "dist/site"),
    engineBasePath,
  );
  instanceSite = await startStaticSite(fixture.output, instanceBasePath);
});

test.afterAll(async () => {
  const cleanup: Promise<unknown>[] = [];
  if (engineSite) cleanup.push(engineSite.close());
  if (instanceSite) cleanup.push(instanceSite.close());
  await Promise.all(cleanup);
  if (fixture) await fixture.cleanup();
});

test("publishes a docs-only engine release beneath its exact base path", async ({
  page,
}) => {
  const response = await page.goto(engineUrl());

  expect(response?.status()).toBe(200);
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("body")).toContainText(engineCommit);

  for (const instanceOnlyRoute of ["timeline/", "graph/", `notes/${noteId}/`]) {
    const routeResponse = await page.request.get(engineUrl(instanceOnlyRoute));
    expect(routeResponse.status(), instanceOnlyRoute).toBe(404);
  }
});

test("publishes every canonical instance route and the exact Source slug", async ({
  page,
}) => {
  expect(sourceSlug).toHaveLength(64);
  const routes = [
    "",
    "timeline/",
    "graph/",
    `notes/${noteId}/`,
    `entities/${entityId}/`,
    `sources/${sourceSlug}/`,
  ];

  for (const route of routes) {
    const response = await page.goto(instanceUrl(route));
    expect(response?.status(), route || "home").toBe(200);
    await expect(page.locator("main"), route || "home").toBeVisible();
  }

  await expect(page.locator(`a[href="${sourceUrl}"]`).first()).toBeVisible();
});

test("discloses the current knowledge digest and source Git commit", async ({
  page,
}) => {
  await page.goto(instanceUrl());

  await expect(page.locator("body")).toContainText(fixture!.knowledgeDigest);
  await expect(page.locator("body")).toContainText(fixture!.head);
  expect(fixture!.knowledgeDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  await expect(
    page.locator('meta[name="coffee-chat:engine-repository"]'),
  ).toHaveAttribute("content", "https://github.com/sonsangjoon/coffee-chat");
  await expect(
    page.locator('meta[name="coffee-chat:engine-version"]'),
  ).toHaveAttribute("content", "1.1.0");
  await expect(
    page.locator('meta[name="coffee-chat:engine-source-commit"]'),
  ).toHaveAttribute("content", "a".repeat(40));
  await expect(
    page.locator('meta[name="coffee-chat:engine-release-digest"]'),
  ).toHaveAttribute("content", `sha256:${"b".repeat(64)}`);
  await expect(page.locator("footer")).toContainText("Built with");
});

test("shares perspective and first-recorded filter state across Timeline and Graph", async ({
  page,
}) => {
  const query = "?perspective=2025&recorded_through=2026-01-15";
  await page.goto(instanceUrl(`timeline/${query}`));

  await expect(page.locator('[name="perspective"]')).toHaveValue("2025");
  await expect(page.locator('[name="recorded_through"]')).toHaveValue(
    "2026-01-15",
  );
  await expect(
    page.locator(`a[href*="notes/${noteId}/"]`).first(),
  ).toBeVisible();
  await expectSharedFilterLink(page, "graph/", {
    perspective: "2025",
    recorded_through: "2026-01-15",
  });

  await page.goto(instanceUrl(`graph/${query}`));
  await expect(page.locator('[name="perspective"]')).toHaveValue("2025");
  await expect(page.locator('[name="recorded_through"]')).toHaveValue(
    "2026-01-15",
  );
  await expectSharedFilterLink(page, "timeline/", {
    perspective: "2025",
    recorded_through: "2026-01-15",
  });

  await page.goto(
    instanceUrl("timeline/?perspective=2024&recorded_through=2026-01-15"),
  );
  await expect(page.locator(`li[data-note-id="${noteId}"]`)).toBeHidden();
});

test("keeps a zero-result Graph consistent across visual and semantic views", async ({
  page,
}) => {
  await page.goto(instanceUrl("graph/?perspective=1900"));

  await expect(page.locator("[data-filter-status]")).toContainText(
    "0 of 2 records shown",
  );
  await expect(page.locator("[data-graph-member]:visible")).toHaveCount(0);
  await expect(page.locator("[data-graph-canvas]")).toHaveAttribute(
    "data-visible-node-count",
    "0",
  );
  await expect(page.locator("[data-graph-canvas]")).toHaveAttribute(
    "data-visible-edge-count",
    "0",
  );
});

test("keeps shared Source observations note-local instead of choosing a canonical title", async ({
  page,
}) => {
  await page.goto(instanceUrl("timeline/"));

  await expect(
    page.locator(`li[data-note-id="${noteId}"]`).getByRole("link", {
      name: firstObservationTitle,
    }),
  ).toBeVisible();
  await expect(
    page.locator(`li[data-note-id="${laterNoteId}"]`).getByRole("link", {
      name: laterObservationTitle,
    }),
  ).toBeVisible();

  await page.goto(instanceUrl(`sources/${sourceSlug}/`));
  await expect(page.locator("h1")).toHaveText(sourceUrl);
  await expect(page.locator("main")).toContainText(firstObservationTitle);
  await expect(page.locator("main")).toContainText(laterObservationTitle);

  await page.goto(instanceUrl("graph/"));
  await expect(
    page.locator(`[data-source-url="${sourceUrl}"]`).getByRole("link"),
  ).toHaveText(sourceUrl);
});

test("keeps an equivalent semantic graph when JavaScript is disabled", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    const response = await page.goto(instanceUrl("graph/"));
    expect(response?.status()).toBe(200);

    const fallback = page.locator("[data-graph-fallback]");
    await expect(fallback).toBeVisible();
    await expect(fallback).toContainText("A fictional review boundary");
    await expect(fallback).toContainText("Review boundary");
    await expect(fallback.locator(`a[href*="notes/${noteId}/"]`)).toBeVisible();
    await expect(
      fallback.locator(`a[href*="entities/${entityId}/"]`),
    ).toBeVisible();
    await expect(
      fallback.locator(`a[href*="sources/${sourceSlug}/"]`),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("protects external openers and excludes unsafe authored payloads and remote embeds", async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== instanceSite!.origin) externalRequests.push(url.href);
  });

  await page.goto(instanceUrl(`notes/${noteId}/`));
  const external = page.locator(`a[href="${sourceUrl}"]`).first();
  await expect(external).toHaveAttribute("target", "_blank");
  await expect(external).toHaveAttribute(
    "rel",
    /^(?=.*\bnoopener\b)(?=.*\bnoreferrer\b).+$/,
  );

  await expect(page.locator(`[data-unsafe-e2e]`)).toHaveCount(0);
  await expect(
    page.locator("main iframe, main embed, main object"),
  ).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(unsafeSentinel);
  await page.goto(instanceUrl(`sources/${sourceSlug}/`));
  await page.waitForLoadState("networkidle");
  expect(externalRequests).toEqual([]);
});

test("has no broken internal route or published asset", async ({ page }) => {
  const routes = [
    "",
    "timeline/",
    "graph/",
    `notes/${noteId}/`,
    `entities/${entityId}/`,
    `sources/${sourceSlug}/`,
  ];
  const failedResponses: Array<{ status: number; url: string }> = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === instanceSite!.origin && response.status() >= 400)
      failedResponses.push({ status: response.status(), url: url.href });
  });

  const internalUrls = new Set<string>();
  for (const route of routes) {
    await page.goto(instanceUrl(route));
    for (const value of await publishedReferences(page)) {
      const url = new URL(value, page.url());
      if (url.origin === instanceSite!.origin) {
        url.hash = "";
        internalUrls.add(url.href);
      }
    }
  }

  for (const url of internalUrls) {
    const response = await page.request.get(url);
    expect(response.status(), url).toBeLessThan(400);
  }
  expect(failedResponses).toEqual([]);
});

for (const width of [360, 768, 1440]) {
  test(`avoids horizontal overflow at the ${width}px viewport`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "",
      "timeline/",
      "graph/",
      `entities/${longEntityId}/`,
      `sources/${sourceSlug}/`,
    ]) {
      await page.goto(instanceUrl(route));
      await expect(page.locator("main")).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
        route || "home",
      ).toBe(true);
    }
  });
}

test("offers a keyboard-visible skip link that moves focus to main content", async ({
  page,
}) => {
  await page.goto(instanceUrl());
  await page.keyboard.press("Tab");

  const skipLink = page.locator('a[href="#main-content"]');
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  expect(
    await skipLink.evaluate((element) => {
      const style = getComputedStyle(element);
      return style.outlineWidth !== "0px" || style.boxShadow !== "none";
    }),
  ).toBe(true);

  await page.keyboard.press("Enter");
  await expect(page.locator("main#main-content")).toBeFocused();
});

test("disables animation when reduced motion is requested", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(instanceUrl("graph/"));

  expect(
    await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter((animation) => animation.playState === "running").length,
    ),
  ).toBe(0);
});

async function runSiteBuild(options?: {
  sourceRoot: string;
  outputRoot: string;
  artifactClass: "ephemeral-test";
}): Promise<void> {
  const args = ["run", "site:build"];
  if (options) {
    args.push(
      "--",
      "--source-root",
      options.sourceRoot,
      "--output-root",
      options.outputRoot,
      "--artifact-class",
      options.artifactClass,
    );
  }
  await execFileAsync("npm", args, {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function addSafeToRejectPublicationPayload(
  siteFixture: SyntheticSiteFixture,
): Promise<void> {
  const notePath = resolve(siteFixture.source, `knowledge/notes/${noteId}.md`);
  const note = await readFile(notePath, "utf8");
  await writeFile(
    notePath,
    `${note}\n\n<script data-unsafe-e2e>window.${unsafeSentinel} = true</script>\n\n<img data-unsafe-e2e src="/e2e-unsafe.png" onerror="window.${unsafeSentinel} = true">\n`,
  );
  await writeFile(
    resolve(siteFixture.source, `knowledge/notes/${laterNoteId}.md`),
    `---\nid: "${laterNoteId}"\ntitle: "A later fictional review"\ntemporal_coverage: "2026-01/2026-03"\nrecorded_on: "2026-02-15"\nsources:\n  - url: "${sourceUrl}"\n    title: "${laterObservationTitle}"\n    published_on: "2025-04-01"\n    accessed_on: "2026-02-15"\nentities:\n  - "${longEntityId}"\n---\n\nThis fictional Note observes the same exact Source URL at a later time.\n`,
  );
  await writeFile(
    resolve(siteFixture.source, "knowledge/entities.yml"),
    `- id: "${entityId}"\n  label: "Review boundary"\n  kind: "concept"\n  same_as:\n    - "https://concepts.example/review-boundary"\n- id: "${longEntityId}"\n  label: "${longEntityLabel}"\n  kind: "concept"\n`,
  );

  const snapshot = await createSnapshot(siteFixture.source, "worktree");
  const validation = await validateKnowledge(snapshot, {
    validateIndex: false,
  });
  if (
    validation.diagnostics.length > 0 ||
    !validation.graph ||
    !isInstanceGraph(validation.graph)
  ) {
    throw new Error(
      `Unsafe-rendering fixture stopped being canonical: ${JSON.stringify(validation.diagnostics)}`,
    );
  }
  const indexBytes = generatedIndexBytes(validation.graph);
  await writeFile(
    resolve(siteFixture.source, "knowledge/index.json"),
    indexBytes,
  );
  const index = JSON.parse(indexBytes.toString("utf8")) as {
    knowledge_digest: string;
  };

  await execFileAsync("git", ["add", "--all"], { cwd: siteFixture.source });
  await execFileAsync(
    "git",
    ["commit", "--quiet", "-m", "Add unsafe rendering fixture"],
    { cwd: siteFixture.source },
  );
  siteFixture.head = await gitHead(siteFixture.source);
  siteFixture.knowledgeDigest = index.knowledge_digest;
}

async function expectSharedFilterLink(
  page: Page,
  route: string,
  expected: Record<string, string>,
): Promise<void> {
  const href = await page
    .locator(`a[data-shared-query-link][href*="${instanceBasePath}${route}"]`)
    .first()
    .getAttribute("href");
  expect(href).not.toBeNull();
  const url = new URL(href!, page.url());
  expect(url.pathname).toBe(`${instanceBasePath}${route}`);
  for (const [name, value] of Object.entries(expected))
    expect(url.searchParams.get(name), name).toBe(value);
}

async function publishedReferences(page: Page): Promise<string[]> {
  return page
    .locator(
      "a[href], link[href], script[src], img[src], source[src], video[poster]",
    )
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        for (const attribute of ["href", "src", "poster"]) {
          const value = element.getAttribute(attribute);
          if (value) return [value];
        }
        return [];
      }),
    );
}

function engineUrl(route = ""): string {
  return new URL(route, `${engineSite!.origin}${engineBasePath}`).href;
}

function instanceUrl(route = ""): string {
  return new URL(route, `${instanceSite!.origin}${instanceBasePath}`).href;
}

async function startStaticSite(
  root: string,
  mountPath: string,
): Promise<StaticSite> {
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405).end();
        return;
      }
      const pathname = decodeURIComponent(
        new URL(request.url ?? "/", "http://localhost").pathname,
      );
      if (!pathname.startsWith(mountPath)) {
        response.writeHead(404).end();
        return;
      }
      let logicalPath = pathname.slice(mountPath.length);
      if (logicalPath === "" || logicalPath.endsWith("/"))
        logicalPath += "index.html";
      const absolute = resolve(root, logicalPath);
      const fromRoot = relative(root, absolute);
      if (
        fromRoot === ".." ||
        fromRoot.startsWith(`..${sep}`) ||
        resolve(root, fromRoot) !== absolute
      ) {
        response.writeHead(404).end();
        return;
      }
      const file = await stat(absolute);
      if (!file.isFile()) {
        response.writeHead(404).end();
        return;
      }
      const bytes = await readFile(absolute);
      response.writeHead(200, {
        "content-length": bytes.length,
        "content-type": contentType(absolute),
      });
      response.end(request.method === "HEAD" ? undefined : bytes);
    } catch {
      response.writeHead(404).end();
    }
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolvePromise();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Static test server did not bind a TCP port.");
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => closeServer(server),
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
}

function contentType(path: string): string {
  return (
    {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2",
    }[extname(path)] ?? "application/octet-stream"
  );
}
