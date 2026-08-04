import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { generatedProjectionBytes } from "../tools/projections.ts";
import { type Manifest, validateKnowledge } from "../tools/knowledge.ts";
import { renderReadmes } from "../tools/readme.ts";
import { createSnapshot } from "../tools/snapshot.ts";

const projectRoot = resolve(import.meta.dirname, "..");
const initializedFixtureRoot = resolve(
  projectRoot,
  "tests/fixtures/initialized-valid",
);

async function engineProjection() {
  const snapshot = await createSnapshot(projectRoot, "worktree");
  const validation = await validateKnowledge(snapshot, {
    validateIndex: false,
  });
  expect(validation.diagnostics).toEqual([]);
  expect(validation.graph).toBeDefined();
  return generatedProjectionBytes(snapshot, validation.graph!);
}

async function initializedInstanceProjection() {
  const manifest = JSON.parse(
    await readFile(resolve(initializedFixtureRoot, "coffee-chat.json"), "utf8"),
  ) as Manifest;
  return renderReadmes(manifest);
}

function expectHeadingOrder(readme: string, headings: readonly string[]) {
  let offset = -1;
  for (const heading of headings) {
    const next = readme.indexOf(heading);
    expect(next).toBeGreaterThan(offset);
    offset = next;
  }
}

describe("localized README projections", () => {
  it("renders separate reciprocal English and Korean engine readmes", async () => {
    const projected = await engineProjection();
    const english = projected.get("README.md")?.toString("utf8");
    const korean = projected.get("README.ko.md")?.toString("utf8");

    expect(
      english?.startsWith(
        "![Coffee Chat cover showing a coffee cup, orbit lines, and four colored nodes](./docs/assets/readme/coffee-chat-cover.png)\n\n[한국어](./README.ko.md)\n",
      ),
    ).toBe(true);
    expect(
      korean?.startsWith(
        "![커피잔, 궤도선, 네 개의 색상 노드가 있는 Coffee Chat 커버](./docs/assets/readme/coffee-chat-cover.png)\n\n[English](./README.md)\n",
      ),
    ).toBe(true);
    expect(english).toContain("## Same Origin. Different Taste.");
    expect(korean).toContain("## 같은 Origin. 다른 Taste.");
    expect(english).toContain("## When information is not enough");
    expect(korean).toContain("## 정보만으로는 충분하지 않을 때");
    expect(english).toContain("## Your Agent needs more than knowledge");
    expect(korean).toContain("## Agent가 알아야 할 것은 지식만이 아닙니다");
    expect(english).toContain("## From Origin to Taste");
    expect(korean).toContain("## Origin에서 Taste까지");
    expect(english).toContain("## Put your Taste to work");
    expect(korean).toContain("## Taste를 실제로 사용하기");
    expect(english).toContain(
      "Taste is the recurring value system behind how a person interprets information and assigns importance.",
    );
    expect(korean).toContain(
      "Taste는 정보를 해석하고 중요도를 부여하는 과정에서 반복적으로 작동하는 가치체계입니다.",
    );
    expect(english).toContain(
      "Your Agent already knows a lot. Coffee Chat helps it understand what matters to you.",
    );
    expect(korean).toContain(
      "당신의 Agent는 이미 많은 것을 알고 있습니다. Coffee Chat은 그 Agent가 당신에게 무엇이 중요한지 이해하도록 돕습니다.",
    );
    expect(english).toContain("coffee-chat-taste.en.png");
    expect(english).toContain("coffee-chat-agent.en.png");
    expect(korean).toContain("coffee-chat-taste.en.png");
    expect(korean).toContain("coffee-chat-agent.en.png");
    expect(english).toContain("### Build your Taste");
    expect(korean).toContain("### Taste 만들기");
    expect(english).toContain("## Put your Taste to work");
    expect(korean).toContain("## Taste를 실제로 사용하기");
    expect(english).toContain("Harvest one or more Origins into Green Beans");
    expect(english).toContain(
      "Roast the relevant Green Beans into a contextual Bean",
    );
    expect(english).toContain("Brew that Bean into Coffee");
    expect(english).toContain(
      "Coffee Pairing to apply it to a named project or task",
    );
    expect(korean).toContain(
      "하나 이상의 Origin을 Harvest해 Green Bean을 만듭니다",
    );
    expect(korean).toContain(
      "Green Bean을 Roast하면 현재 맥락의 Taste를 담은 Bean",
    );
    expect(korean).toContain("그 Bean을 Brew해 Coffee를 만들면");
    expect(english).toContain("Have a Coffee Chat with that Coffee");
    expect(english).toContain(
      "Coffee Pairing to apply it to a named project or task",
    );
    expect(korean).toContain(
      "Coffee Pairing을 통해 특정 프로젝트와 작업에 같은 기준을 적용합니다.",
    );
    expect(english).toContain("PERSONAL_COFFEE_CHAT_URL");
    expect(korean).toContain("PERSONAL_COFFEE_CHAT_URL");
    expect(english).not.toMatch(/\bpersona\b/i);
    expect(korean).not.toMatch(/\bpersona\b/i);
    expect(english).toContain("## What makes it different");
    expect(korean).toContain("## Coffee Chat이 다른 이유");
    expect(english).toContain("Green Bean");
    expect(korean).toContain("Green Bean");
    expect(english).not.toContain("Source-grounded Perspective Annotation");
    expect(korean).not.toContain("Source-grounded Perspective Annotation");
    for (const term of ["Sip", "Serve", "Project"]) {
      expect(english).not.toContain(term);
      expect(korean).not.toContain(term);
    }
    expect(english).toContain("This engine has no default person or Taste");
    expect(english).toContain("Init your Coffee Chat");
    expect(english).toContain("Install engine plugin");
    expect(english).toContain("Contribute to engine");
    expect(english).not.toContain("<COFFEE_CHAT_INSTANCE_URL>");
    expect(korean).not.toContain("<COFFEE_CHAT_INSTANCE_URL>");
    for (const deprecated of [
      "Mental Model",
      "Task Lens",
      "Derived Perspective",
      "judgment policy",
    ]) {
      expect(english).not.toContain(deprecated);
      expect(korean).not.toContain(deprecated);
    }
    for (const removedAsset of [
      "coffee-chat-flow.en.png",
      "coffee-chat-trust.en.png",
    ]) {
      expect(english).not.toContain(removedAsset);
      expect(korean).not.toContain(removedAsset);
    }
    for (const removedTerm of ["Authored", "Sourced", "Inferred"]) {
      expect(english).not.toContain(removedTerm);
      expect(korean).not.toContain(removedTerm);
    }
    for (const command of [
      "npm run cc -- hooks inspect --format json",
      "npm run cc -- hooks install --format json",
      "npm run cc -- hooks uninstall --format json",
      "codex plugin add --help",
      "codex plugin marketplace upgrade coffee-chat-marketplace",
      "codex plugin list --json",
      "codex plugin marketplace list --json",
      "claude plugin update coffee-chat@coffee-chat-marketplace --scope local",
      "claude plugin list --json",
      "claude plugin marketplace list --json",
    ]) {
      expect(english).toContain(command);
      expect(korean).toContain(command);
    }

    expectHeadingOrder(english!, [
      "## Same Origin. Different Taste.",
      "## When information is not enough",
      "## Your Agent needs more than knowledge",
      "## From Origin to Taste",
      "## Put your Taste to work",
      "## What makes it different",
      "## Try a Coffee Chat",
      "## Init your Coffee Chat",
      "## Choose your next action",
      "## Install, maintain, and contribute",
    ]);
    expectHeadingOrder(korean!, [
      "## 같은 Origin. 다른 Taste.",
      "## 정보만으로는 충분하지 않을 때",
      "## Agent가 알아야 할 것은 지식만이 아닙니다",
      "## Origin에서 Taste까지",
      "## Taste를 실제로 사용하기",
      "## Coffee Chat이 다른 이유",
      "## Coffee Chat 해보기",
      "## 나만의 Coffee Chat Init",
      "## 다음 행동 선택하기",
      "## 설치, 유지보수, 기여",
    ]);
  });

  it("renders the initialized instance identity in both localized READMEs", async () => {
    const projected = await initializedInstanceProjection();
    const english = projected.get("README.md")?.toString("utf8");
    const korean = projected.get("README.ko.md")?.toString("utf8");

    expect(english).toContain("Open https://github.com/example/coffee-chat");
    expect(korean).toContain("https://github.com/example/coffee-chat");
    expect(english).toContain("Example Author");
    expect(korean).toContain("Example Author");
    expect(english).toContain("https://example.github.io/coffee-chat/");
    expect(korean).toContain("https://example.github.io/coffee-chat/");
    expect(english).toContain(
      "coffee-chat-example@coffee-chat-example-marketplace",
    );
    expect(korean).toContain(
      "coffee-chat-example@coffee-chat-example-marketplace",
    );
    expect(english).not.toContain("<COFFEE_CHAT_INSTANCE_URL>");
    expect(korean).not.toContain("<COFFEE_CHAT_INSTANCE_URL>");
    expect(korean).toContain("[중립 엔진](#init-your-coffee-chat)");
    expect(english).not.toContain("Sangjoon Son");
    expect(korean).not.toContain("Sangjoon Son");
    expect(english).not.toContain("Built with [Coffee Chat]");
    expect(korean).not.toContain("Built with [Coffee Chat]");
  });

  it("renders instance attribution only from canonical provenance", async () => {
    const manifest = JSON.parse(
      await readFile(
        resolve(initializedFixtureRoot, "coffee-chat.json"),
        "utf8",
      ),
    ) as Manifest & { provenance?: unknown };
    manifest.schema_version = "1.1.0";
    manifest.provenance = {
      engine: {
        repository: "https://github.com/example/coffee-chat-engine",
        version: "2026.08.04",
        source_commit: "a".repeat(40),
        release_digest: `sha256:${"b".repeat(64)}`,
      },
      created_from: {
        method: "github-template",
        template_repository: "https://github.com/example/coffee-chat-engine",
      },
    };
    const projected = renderReadmes(manifest);
    for (const readme of projected.values()) {
      const lines = readme.toString("utf8").trimEnd().split("\n");
      expect(lines.at(-1)).toBe(
        "Initialized with [Coffee Chat](https://github.com/example/coffee-chat-engine) · v2026.08.04",
      );
      expect(readme.toString("utf8")).not.toContain(
        "https://github.com/SonSangjoon/coffee-chat",
      );
    }
  });

  it("joins instance Pages routes when pages_url has no trailing slash", async () => {
    const manifest = JSON.parse(
      await readFile(
        resolve(initializedFixtureRoot, "coffee-chat.json"),
        "utf8",
      ),
    ) as Manifest;
    manifest.pages_url = "https://example.github.io/coffee-chat";
    const projected = renderReadmes(manifest);
    const english = projected.get("README.md")?.toString("utf8");
    const korean = projected.get("README.ko.md")?.toString("utf8");

    for (const readme of [english, korean]) {
      expect(readme).toContain(
        "[Timeline](https://example.github.io/coffee-chat/timeline/)",
      );
      expect(readme).toContain(
        "[Graph](https://example.github.io/coffee-chat/graph/)",
      );
      expect(readme).not.toContain("coffee-chattimeline");
      expect(readme).not.toContain("coffee-chatgraph");
    }
  });
});
