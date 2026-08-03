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
    expect(english).toContain(
      "## AI makes execution abundant. Taste decides what is worth making.",
    );
    expect(korean).toContain(
      "## AI가 실행을 풍부하게 만들수록, 무엇을 만들 가치가 있는지 결정하는 Taste가 중요해집니다.",
    );
    expect(english).toContain(
      "Taste here means trained judgment under uncertainty",
    );
    expect(korean).toContain(
      "여기서 Taste는 미적 취향이나 성격이 아니라, 불확실성 속에서 훈련된 판단입니다.",
    );
    expect(english).toContain("## Why Coffee Chat");
    expect(korean).toContain("## 왜 Coffee Chat인가");
    expect(english).not.toContain("Coffee Chat과 대화하기");
    expect(korean).not.toContain("Talk with a Coffee Chat / ");
    expect(korean).toContain(
      "[**나만의 Coffee Chat 만들기**](#나만의-coffee-chat-만들기)",
    );
    expect(english).toContain(
      "![One public record branches toward the owner's Task Lens and another person's grounded Coffee Chat](./docs/assets/readme/coffee-chat-flow.en.png)",
    );
    expect(korean).toContain(
      "![하나의 공개 기록이 주인의 Task Lens와 다른 사람의 근거 기반 Coffee Chat으로 이어지는 흐름](./docs/assets/readme/coffee-chat-flow.en.png)",
    );
    expect(english).toContain(
      "![Four separate trust layers: Authored, Sourced, Inferred, and Unknown](./docs/assets/readme/coffee-chat-trust.en.png)",
    );
    expect(korean).toContain(
      "![작성자 기록, 출처 내용, 제한된 추론, 기록으로 알 수 없음의 분리된 네 가지 신뢰 층](./docs/assets/readme/coffee-chat-trust.en.png)",
    );
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
      "## AI makes execution abundant. Taste decides what is worth making.",
      "## Why Coffee Chat",
      "## Two needs, one graph",
      "## Have a Coffee Chat without installing",
      "## One record, two directions",
      "## Why this is not another knowledge base",
      "## How it earns trust",
      "## Put Taste to work",
      "## Build your Coffee Chat",
      "## Install, remove, contribute, and license",
    ]);
    expectHeadingOrder(korean!, [
      "## AI가 실행을 풍부하게 만들수록, 무엇을 만들 가치가 있는지 결정하는 Taste가 중요해집니다.",
      "## 왜 Coffee Chat인가",
      "## 두 가지 필요, 하나의 그래프",
      "## 설치 없이 Coffee Chat 하기",
      "## 하나의 기록, 두 방향",
      "## 또 하나의 지식 베이스가 아닌 이유",
      "## 신뢰를 얻는 방식",
      "## Taste를 업무에 적용하기",
      "## 나만의 Coffee Chat 만들기",
      "## 설치, 제거, 기여, 라이선스",
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
    expect(korean).toContain(
      "[**나만의 Coffee Chat 만들기**](#build-your-coffee-chat)",
    );
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
        version: "1.1.0",
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
        "Built with [Coffee Chat](https://github.com/example/coffee-chat-engine) · v1.1.0",
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
