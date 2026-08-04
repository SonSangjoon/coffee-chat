import { isEngineManifest, type Manifest } from "./knowledge.ts";

export type ReadmePath = "README.md" | "README.ko.md";

function textBytes(value: string): Buffer {
  return Buffer.from(value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

function markdown(lines: readonly string[]): string {
  return lines.join("\n");
}

function pagesRoute(base: string, route: string): string {
  const normalized = new URL(base);
  if (!normalized.pathname.endsWith("/")) normalized.pathname += "/";
  normalized.search = "";
  normalized.hash = "";
  return new URL(route, normalized).toString();
}

type ReadmeContext = {
  name: string;
  profileName: string;
  instanceUrl?: string;
  initUrl: string;
  pluginSelector: string;
  marketplace: string;
  isEngine: boolean;
  pagesUrl?: string;
  engineRepositoryUrl?: string;
  engineDefaultBranch?: string;
  engineVersion?: string;
};

function context(manifest: Manifest): ReadmeContext {
  const isEngine = isEngineManifest(manifest);
  const engineRepositoryUrl = isEngine
    ? manifest.repository.url
    : manifest.provenance?.engine.repository;
  return {
    name: isEngine
      ? "Coffee Chat"
      : `Coffee Chat — ${manifest.profile.display_name}`,
    profileName: isEngine ? "Coffee Chat" : manifest.profile.display_name,
    instanceUrl: isEngine ? undefined : manifest.repository.url,
    initUrl: isEngine
      ? "#init-your-coffee-chat"
      : (engineRepositoryUrl ?? "#init-your-coffee-chat"),
    pluginSelector: `${manifest.plugin.name}@${manifest.marketplace_name}`,
    marketplace: manifest.marketplace_name,
    isEngine,
    pagesUrl: isEngine ? undefined : manifest.pages_url,
    engineRepositoryUrl,
    engineDefaultBranch: isEngine
      ? manifest.repository.default_branch
      : undefined,
    engineVersion: isEngine ? undefined : manifest.provenance?.engine.version,
  };
}

function repositoryFileUrl(
  repository: string,
  branch: string,
  path: string,
): string {
  const base = repository.endsWith("/") ? repository : `${repository}/`;
  return new URL(`blob/${branch}/${path}`, base).toString();
}

function coffeeChatPrompt(url: string): string[] {
  return [
    "```text",
    `Open ${url}.`,
    "Read coffee-chat.json, then AGENTS.md.",
    "Start Coffee Roast and Coffee Brew for this session, then have a one-time Coffee Chat. Do not install anything.",
    "",
    "What did this person notice in <ORIGIN>?",
    "What did they treat as important, and why?",
    "Show the supporting Green Beans, Origins, dates, and Unknown.",
    "Do not invent a view that the public record cannot support.",
    "```",
  ];
}

function pairingPrompt(url: string): string[] {
  return [
    "```text",
    `Use ${url} for <TASK> after Coffee Roast and Coffee Brew.`,
    "Coffee Pairing uses only the public, dated Green Beans relevant to the task.",
    "Explain which Green Beans and Origins support the result and separate Unknown.",
    "Work only on the explicitly named <TARGET>.",
    "Do not write the task result back to Coffee Chat.",
    "```",
  ];
}

function installCommands(
  context: ReadmeContext,
  locale: "en" | "ko",
): string[] {
  const install =
    locale === "en" ? "Codex install and remove" : "Codex 설치와 제거";
  const claude =
    locale === "en"
      ? "Claude Code install and remove"
      : "Claude Code 설치와 제거";
  const source = context.engineRepositoryUrl ?? context.instanceUrl;
  if (!source) return [];
  return [
    `<details><summary>${install}</summary>`,
    "",
    "```sh",
    `codex plugin marketplace add ${source}`,
    `codex plugin add ${context.pluginSelector}`,
    "",
    `codex plugin remove ${context.pluginSelector}`,
    `codex plugin marketplace remove ${context.marketplace}`,
    "```",
    "",
    "</details>",
    "",
    `<details><summary>${claude}</summary>`,
    "",
    "```sh",
    `claude plugin marketplace add ${source} --scope local`,
    `claude plugin install ${context.pluginSelector} --scope local`,
    "",
    `claude plugin uninstall ${context.pluginSelector} --scope local`,
    `claude plugin marketplace remove ${context.marketplace}`,
    "```",
    "",
    "</details>",
  ];
}

function lifecycleGuidance(
  context: ReadmeContext,
  locale: "en" | "ko",
): string[] {
  const commands = [
    "```sh",
    "npm run cc -- hooks inspect --format json",
    "npm run cc -- hooks install --format json",
    "npm run cc -- hooks uninstall --format json",
    "```",
    "",
    "```sh",
    "codex plugin add --help",
    `codex plugin marketplace upgrade ${context.marketplace}`,
    "codex plugin list --json",
    "codex plugin marketplace list --json",
    "```",
    "",
    "```sh",
    `claude plugin update ${context.pluginSelector} --scope local`,
    "claude plugin list --json",
    "claude plugin marketplace list --json",
    "```",
  ];
  if (locale === "en")
    return [
      "<details><summary>Hooks, lifecycle, update, cache, and removal receipt</summary>",
      "",
      "Inspect the resolved repository hook before installation. Install only after a safe inspection; uninstall removes only the Coffee Chat-managed hook and repository-local runtime. Do not bypass, silently chain, or overwrite an unmanaged hook.",
      "",
      ...commands,
      "",
      "Codex exposes no plugin scope selector in `plugin add` and no separate plugin update command. Treat unreported scope or host-managed paths as Unknown. Marketplace upgrade refreshes the source snapshot; the two read-only list commands are the removal receipt for this exact plugin and marketplace.",
      "",
      "Claude Code `local` scope is the narrowest temporary choice. Its update command refreshes this namespaced plugin; the two list commands are the same presence-or-absence receipt. Host-managed caches, conversation history, logs, and retention may remain after removal.",
      "",
      "Only approved Green Beans are durable. A Bean or Coffee Pairing result is temporary and is not appended to the installed snapshot at runtime.",
      "",
      "</details>",
    ];
  return [
    "<details><summary>Hook, 수명주기, 업데이트, 캐시, 삭제 확인</summary>",
    "",
    "설치 전에 실제 저장소 hook 경로와 상태를 확인하세요. 안전한 inspection 뒤에만 설치하며, uninstall은 Coffee Chat이 관리하는 hook과 저장소 로컬 runtime만 제거합니다. 관리되지 않는 hook을 우회·자동 연결·덮어쓰지 않습니다.",
    "",
    ...commands,
    "",
    "Codex의 `plugin add`에는 scope 선택자가 없고 별도 plugin update 명령도 없습니다. 확인되지 않은 scope와 호스트 관리 경로는 Unknown으로 둡니다. Marketplace upgrade는 플러그인 원본을 갱신하며, 두 개의 읽기 전용 list 명령은 정확한 플러그인과 marketplace의 설치 상태를 확인하는 기록입니다.",
    "",
    "Claude Code에서는 `local` scope가 가장 좁은 임시 선택입니다. update 명령은 이 인스턴스 전용 plugin을 갱신하며, 두 list 명령은 같은 설치 상태 확인 기록입니다. 호스트 관리 캐시·대화 기록·로그·보존 데이터는 삭제 후에도 남을 수 있습니다.",
    "",
    "승인된 Green Bean만 지속 저장됩니다. Bean과 Coffee Pairing 결과는 일시적이며 runtime에 설치된 snapshot에 덧붙이지 않습니다.",
    "",
    "</details>",
  ];
}

function engineActions(locale: "en" | "ko"): string[] {
  if (locale === "en")
    return [
      "## Choose your next action",
      "",
      "- **Init your Coffee Chat** — initialize a separate public coffee-chat-* repository from the engine, then Harvest its first Origin into a Green Bean.",
      "- **Install engine plugin** — add the neutral engine Skills to your agent for authoring and maintenance.",
      "- **Contribute to engine** — improve schemas, validation, Skills, and the public presentation.",
      "",
      "This engine has no default person or Taste. It contains no personal Origin, Green Bean, Bean, or Coffee to chat with.",
      "",
      "Do not treat this engine URL as a personal Coffee Chat. Init or open an explicit instance URL first.",
    ];
  return [
    "## 다음 행동 선택하기",
    "",
    "- **나만의 Coffee Chat Init** — 엔진에서 별도의 coffee-chat-* 저장소를 Init하고 첫 Origin을 Green Bean으로 Harvest합니다.",
    "- **Install engine plugin** — 작성과 유지보수를 위한 중립 엔진 Skill을 Agent에 추가합니다.",
    "- **Contribute to engine** — 스키마·검증·Skill·공개 화면을 개선합니다.",
    "",
    "이 엔진에는 기본 인물이나 Taste가 없습니다. 대화할 개인 Origin·Green Bean·Bean·Coffee를 담고 있지 않습니다.",
    "",
    "이 엔진 URL을 개인 Coffee Chat으로 취급하지 마세요. 먼저 Init한 인스턴스 URL을 만들거나 열어야 합니다.",
  ];
}

function tasteVisual(locale: "en" | "ko"): string {
  return locale === "en"
    ? "![Origin becomes Green Bean through Harvest, then Bean through Roast](./docs/assets/readme/coffee-chat-taste.en.png)"
    : "![Harvest로 Origin을 Green Bean으로, Roast로 Bean으로 바꾸는 흐름](./docs/assets/readme/coffee-chat-taste.en.png)";
}

function agentVisual(locale: "en" | "ko"): string {
  return locale === "en"
    ? "![Bean becomes Coffee through Brew, then branches to Coffee Chat and Coffee Pairing](./docs/assets/readme/coffee-chat-agent.en.png)"
    : "![Brew로 Bean을 Coffee로 만들고 Coffee Chat과 Coffee Pairing으로 나누는 흐름](./docs/assets/readme/coffee-chat-agent.en.png)";
}

function renderEnglish(manifest: Manifest): string {
  const c = context(manifest);
  const roleCopy = c.isEngine
    ? "This is the neutral engine. It has no default person or Taste, and no personal record to answer for."
    : `This is ${c.profileName}'s approved public record. It is an interface to documented evidence, not a claim that an agent is the person. `;
  const timelineLinks = c.pagesUrl
    ? ` Browse the public [Timeline](${pagesRoute(c.pagesUrl, "timeline/")}) and [Graph](${pagesRoute(c.pagesUrl, "graph/")}).`
    : "";
  const instanceSection = c.instanceUrl
    ? [
        "## Try a Coffee Chat",
        "",
        "A public instance URL is enough for a one-time, read-only conversation. No install, signup, or email is required.",
        "",
        ...coffeeChatPrompt(c.instanceUrl),
        "",
        "Useful follow-ups:",
        "",
        "- What did this person treat as important in this Origin?",
        "- Which Green Bean and Origin support that reading?",
        "- What changed over time?",
        "- What does the public record leave Unknown?",
        "- What should I ask the person directly?",
        "",
        "For a named external task, use Coffee Pairing:",
        "",
        ...pairingPrompt(c.instanceUrl),
      ]
    : [
        "## Try a Coffee Chat",
        "",
        "This repository is the neutral engine, not a ready-made personal instance. There is no default person or Taste here.",
        "",
        "Init a public instance first, then give that explicit URL to an agent. Coffee Roast and Coffee Brew should begin from the instance's `coffee-chat.json` and `AGENTS.md` before the first Coffee Chat.",
        "",
        "> **My personal Coffee Chat** — coming soon.",
        "> This space is reserved for my public Coffee Chat.",
        "<!-- PERSONAL_COFFEE_CHAT_URL: replace this marker with your public Coffee Chat link -->",
      ];
  const initSection = c.isEngine
    ? [
        "## Init your Coffee Chat",
        "",
        "Start with one or more public Origins and prepare how you interpreted them, what you considered important, and which values guided that judgment.",
        "",
        "Harvest public Origins into Green Beans, Roast them into contextual Beans that carry Taste, and Brew a Bean into Coffee—the Agent with your Taste—for Coffee Chat or Coffee Pairing.",
        "",
        ...engineActions("en"),
      ]
    : [
        "## Init your own record",
        "",
        `This instance belongs to ${c.profileName}. Init a separate public instance from the [neutral engine](${c.initUrl}) if you want to Harvest your own Green Beans.`,
        "",
        "Personal Green Beans belong only in the instance controlled by their author.",
      ];
  const installSection = [
    "## Install, maintain, and contribute",
    "",
    c.isEngine
      ? "Install the engine plugin for reusable authoring and maintenance. Install an instance plugin only when you need repeated access to a particular public record."
      : "Use the URL for a one-time conversation. Install this instance plugin only when you need repeated access to this public record.",
    "",
    ...installCommands(c, "en"),
    "",
    ...lifecycleGuidance(c, "en"),
    "",
    c.isEngine && c.engineRepositoryUrl && c.engineDefaultBranch
      ? `Read the [maintained design contract](${repositoryFileUrl(c.engineRepositoryUrl, c.engineDefaultBranch, "docs/design/coffee-chat.md")}), [UX research](${repositoryFileUrl(c.engineRepositoryUrl, c.engineDefaultBranch, "docs/research/2026-08-04-coffee-chat-ux-research.md")}), and [testing and acceptance guide](${repositoryFileUrl(c.engineRepositoryUrl, c.engineDefaultBranch, "docs/testing.md")}) before changing the engine.`
      : "This instance follows the engine's maintained design contract; keep personal content in the instance and reusable behavior in the engine.",
    "",
    c.isEngine
      ? "Code, schemas, engine payloads, and Skills use the [MIT License](./LICENSE); original Green Beans and public prose use the [content terms](./CONTENT_LICENSE.md)."
      : "Code, schemas, engine payloads, and Skills use the [MIT License](./LICENSE); original Green Beans and public prose use the [content terms](./CONTENT_LICENSE.md).",
  ];
  if (!c.isEngine && c.engineRepositoryUrl && c.engineVersion)
    installSection.push(
      "",
      `Initialized with [Coffee Chat](${c.engineRepositoryUrl}) · v${c.engineVersion}`,
    );
  return markdown([
    "![Coffee Chat cover showing a coffee cup, orbit lines, and four colored nodes](./docs/assets/readme/coffee-chat-cover.png)",
    "",
    "[한국어](./README.ko.md)",
    "",
    `# ${c.name}`,
    "",
    "## Same Origin. Different Taste.",
    "",
    "AI made information cheap. It did not make judgment personal.",
    "",
    "Your Agent may already know a lot. It still does not know what matters to you.",
    "",
    "## When information is not enough",
    "",
    "The same information can lead to different judgments. People notice different things, assign importance differently, and make different value judgments.",
    "",
    "Taste is the recurring value system behind how a person interprets information and assigns importance. It is not a score, a personality profile, or a decision rule. Its criteria remain recognizable across different Origins and situations, even when conclusions change.",
    "",
    "That recurring consistency is why Taste matters. It makes a person's way of seeing information recognizable to other people and useful to an Agent.",
    "",
    "## Your Agent needs more than knowledge",
    "",
    "- People who use Agents for real work and keep explaining what matters to them.",
    "",
    "- People who share information but want to show their point of view, not only a summary.",
    "",
    "- People who want to understand each other's criteria before collaborating.",
    "",
    "> Your Agent already knows a lot. Coffee Chat helps it understand what matters to you.",
    "",
    "## From Origin to Taste",
    "",
    "Coffee Chat is an open-source workflow for turning Origin-based points of view into contextual Taste, putting that Taste on an Agent, and using it in conversation or work.",
    "",
    "```text",
    "Origin → Green Bean → Bean → Coffee → Coffee Chat / Coffee Pairing",
    "          Harvest        Roast   Brew",
    "```",
    "",
    "### Build your Taste",
    "",
    tasteVisual("en"),
    "",
    "Harvest one or more Origins into Green Beans. Roast the relevant Green Beans into a contextual Bean that carries Taste for the current question or task.",
    "",
    "## Put your Taste to work",
    "",
    agentVisual("en"),
    "",
    "Brew that Bean into Coffee—the Agent with your Taste—for the current Coffee Chat or task. The Taste context is dynamic and is not shown as a fixed profile.",
    "",
    "Have a Coffee Chat with that Coffee, or use Coffee Pairing to apply it to a named project or task.",
    "",
    "## What makes it different",
    "",
    "Coffee Chat does not store everything you know or every decision you make. It keeps how you interpreted an Origin and what you considered important.",
    "",
    "- Origin: the information and its provenance",
    "- Green Bean: your authored point of view",
    "- Bean: the Taste needed for the current context",
    "- Coffee: an Agent with that Taste applied",
    "",
    "A Green Bean may link one or more Origins. Taste is not a global profile or an executable rule; Roast forms the Bean needed for the current context.",
    "",
    roleCopy + timelineLinks,
    "",
    ...instanceSection,
    "",
    ...initSection,
    "",
    ...installSection,
  ]);
}

function renderKorean(manifest: Manifest): string {
  const c = context(manifest);
  const initUrl = c.isEngine ? "#나만의-coffee-chat-init" : c.initUrl;
  const roleCopy = c.isEngine
    ? "이곳은 중립 엔진입니다. 기본 인물이나 Taste, 개인 기록이 없으므로 특정 사람을 대신해 답하지 않습니다."
    : `이곳은 ${c.profileName}의 승인된 공개 기록입니다. Agent가 그 사람이라고 주장하는 것이 아니라 문서화된 근거에 접근하는 인터페이스입니다. `;
  const timelineLinks = c.pagesUrl
    ? ` 공개 [Timeline](${pagesRoute(c.pagesUrl, "timeline/")})과 [Graph](${pagesRoute(c.pagesUrl, "graph/")})도 볼 수 있습니다.`
    : "";
  const instanceSection = c.instanceUrl
    ? [
        "## Coffee Chat 해보기",
        "",
        "공개 인스턴스 URL만 있으면 일회성 읽기 전용 대화를 시작할 수 있습니다. 설치·가입·이메일은 필요하지 않습니다.",
        "",
        ...coffeeChatPrompt(c.instanceUrl),
        "",
        "이어서 이렇게 물어볼 수 있습니다:",
        "",
        "- 이 사람은 이 Origin에서 무엇을 중요하게 보았나요?",
        "- 그 해석을 뒷받침하는 Green Bean과 Origin은 무엇인가요?",
        "- 시간에 따라 무엇이 바뀌었나요?",
        "- 공개 기록이 말해주지 못하는 Unknown은 무엇인가요?",
        "- 당사자에게 직접 물어봐야 할 것은 무엇인가요?",
        "",
        "특정 외부 작업에 활용할 때는 Coffee Pairing을 사용합니다:",
        "",
        ...pairingPrompt(c.instanceUrl),
      ]
    : [
        "## Coffee Chat 해보기",
        "",
        "이 저장소는 준비된 개인 인스턴스가 아니라 중립 엔진입니다. 기본 인물이나 Taste가 없습니다.",
        "",
        "먼저 공개 인스턴스를 Init한 뒤 그 명시적 URL을 Agent에 전달하세요. 일회성 Coffee Chat은 인스턴스의 `coffee-chat.json`과 `AGENTS.md`에서 시작해야 합니다.",
        "",
        "> **나의 Coffee Chat** — 준비 중입니다.",
        "> 나의 공개 Coffee Chat 링크가 준비되면 이 자리에 연결합니다.",
        "<!-- PERSONAL_COFFEE_CHAT_URL: 공개 Coffee Chat 링크로 이 표시를 교체하세요 -->",
      ];
  const initSection = c.isEngine
    ? [
        "## 나만의 Coffee Chat Init",
        "",
        "공개 Origins를 엮어 어떻게 해석했고, 무엇을 중요하게 판단했으며, 어떤 가치판단 기준이 작동했는지 Green Bean으로 남기는 것에서 시작합니다.",
        "",
        "Origin을 Harvest해 Green Bean을 만들고, 이를 Roast해 현재 맥락의 Taste를 담은 Bean을 구성합니다. 그 Bean을 Brew해 Coffee를 만들면 나의 Taste가 입혀진 Agent로 Coffee Chat이나 Coffee Pairing을 사용할 수 있습니다.",
        "",
        ...engineActions("ko"),
      ]
    : [
        "## 나의 기록 만들기",
        "",
        `${c.profileName}의 인스턴스와 별개로 [중립 엔진](${initUrl})에서 나만의 공개 Origin을 Green Bean으로 Harvest할 수 있습니다.`,
        "",
        "개인 Green Bean은 작성자가 관리하는 인스턴스에만 둡니다.",
      ];
  const installSection = [
    "## 설치, 유지보수, 기여",
    "",
    c.isEngine
      ? "반복적인 작성과 유지보수를 위해 엔진 플러그인을 설치하세요. 특정 공개 기록을 계속 사용할 때만 인스턴스 플러그인을 설치합니다."
      : "일회성 대화에는 URL을 사용하세요. 이 공개 기록을 계속 사용할 때만 인스턴스 플러그인을 설치합니다.",
    "",
    ...installCommands(c, "ko"),
    "",
    ...lifecycleGuidance(c, "ko"),
    "",
    c.isEngine && c.engineRepositoryUrl && c.engineDefaultBranch
      ? `변경 전 [유지되는 설계 계약](${repositoryFileUrl(c.engineRepositoryUrl, c.engineDefaultBranch, "docs/design/coffee-chat.md")}), [UX 리서치](${repositoryFileUrl(c.engineRepositoryUrl, c.engineDefaultBranch, "docs/research/2026-08-04-coffee-chat-ux-research.md")}), [테스트·수용 기준](${repositoryFileUrl(c.engineRepositoryUrl, c.engineDefaultBranch, "docs/testing.md")})을 읽으세요.`
      : "이 인스턴스는 엔진의 유지되는 설계 계약을 따릅니다. 개인 콘텐츠는 인스턴스에, 재사용 가능한 동작은 엔진에 둡니다.",
    "",
    "코드·스키마·엔진 페이로드·Skill은 [MIT License](./LICENSE)를 따르고, 원본 Green Bean과 공개 문장은 [콘텐츠 조건](./CONTENT_LICENSE.md)을 따릅니다.",
  ];
  if (!c.isEngine && c.engineRepositoryUrl && c.engineVersion)
    installSection.push(
      "",
      `Initialized with [Coffee Chat](${c.engineRepositoryUrl}) · v${c.engineVersion}`,
    );
  return markdown([
    "![커피잔, 궤도선, 네 개의 색상 노드가 있는 Coffee Chat 커버](./docs/assets/readme/coffee-chat-cover.png)",
    "",
    "[English](./README.md)",
    "",
    `# ${c.name}`,
    "",
    "## 같은 Origin. 다른 Taste.",
    "",
    "AI는 정보를 값싸고 빠르게 만들었습니다. 하지만 판단까지 개인적으로 만들지는 못합니다.",
    "",
    "당신의 Agent는 이미 많은 것을 알고 있을 수 있습니다. 하지만 당신에게 무엇이 중요한지는 아직 모릅니다.",
    "",
    "## 정보만으로는 충분하지 않을 때",
    "",
    "같은 정보를 보더라도 판단은 달라집니다. 사람마다 주목하는 부분이 다르고, 중요도를 부여하는 방식이 다르며, 작동하는 가치판단 기준도 다릅니다.",
    "",
    "Taste는 정보를 해석하고 중요도를 부여하는 과정에서 반복적으로 작동하는 가치체계입니다. 점수나 성격 프로필, Agent가 따라야 하는 의사결정 규칙이 아닙니다. 결론이 항상 같다는 뜻이 아니라, Origin과 상황이 달라도 판단 기준이 식별되는 항상성을 의미합니다.",
    "",
    "이런 반복되는 기준이 Taste가 중요한 이유입니다. Taste는 한 사람이 정보를 바라보는 방식을 다른 사람이 이해하게 하고, Agent가 그 기준을 활용하게 합니다.",
    "",
    "## Agent가 알아야 할 것은 지식만이 아닙니다",
    "",
    "- Agent를 실제 업무에 사용하면서 무엇이 중요한지 매번 다시 설명하는 사람",
    "",
    "- 정보를 공유할 때 단순한 요약이 아니라 자신의 관점을 보여주고 싶은 사람",
    "",
    "- 함께 일하기 전에 서로의 판단 기준을 이해하고 싶은 사람",
    "",
    "> 당신의 Agent는 이미 많은 것을 알고 있습니다. Coffee Chat은 그 Agent가 당신에게 무엇이 중요한지 이해하도록 돕습니다.",
    "",
    "## Origin에서 Taste까지",
    "",
    "Coffee Chat은 외부 정보를 보고 남긴 나의 관점을 현재 맥락의 Taste로 만들고, 그 Taste를 Agent에 입혀 대화와 작업에 사용하는 오픈소스 워크플로우입니다.",
    "",
    "```text",
    "Origin → Green Bean → Bean → Coffee → Coffee Chat / Coffee Pairing",
    "          Harvest        Roast   Brew",
    "```",
    "",
    "### Taste 만들기",
    "",
    tasteVisual("ko"),
    "",
    "하나 이상의 Origin을 Harvest해 Green Bean을 만듭니다. 무엇을 중요하게 판단했고, 어떻게 해석했으며, 왜 그런지 Green Bean에 기록합니다. Green Bean을 Roast하면 현재 맥락의 Taste를 담은 Bean이 구성됩니다.",
    "",
    "## Taste를 실제로 사용하기",
    "",
    agentVisual("ko"),
    "",
    "그 Bean을 Brew해 Coffee를 만들면 나의 Taste가 입혀진 Agent로 현재 Coffee Chat이나 작업에서 기준을 활용할 수 있습니다. Taste는 고정 프로필로 보이지 않습니다.",
    "",
    "그 Coffee와 대화하거나, Coffee Pairing을 통해 특정 프로젝트와 작업에 같은 기준을 적용합니다.",
    "",
    "## Coffee Chat이 다른 이유",
    "",
    "Coffee Chat은 내가 무엇을 알고 있는지나 어떤 결정을 내렸는지를 저장하지 않습니다. 외부 정보를 어떻게 해석했고, 무엇을 중요하게 보았는지를 남깁니다.",
    "",
    "- Origin: 정보와 그 출처",
    "- Green Bean: 작성자의 관점",
    "- Bean: 현재 맥락에 필요한 Taste",
    "- Coffee: 그 Taste가 입혀진 Agent",
    "",
    "하나의 Green Bean은 여러 Origin을 엮을 수 있습니다. Taste는 전역 프로필이나 실행 규칙으로 저장되지 않고, Roast가 현재 맥락에 필요한 Bean으로 구성합니다.",
    "",
    roleCopy + timelineLinks,
    "",
    ...instanceSection,
    "",
    ...initSection,
    "",
    ...installSection,
  ]);
}

export function renderReadmes(
  manifest: Manifest,
): ReadonlyMap<ReadmePath, Buffer> {
  const outputs = new Map<ReadmePath, Buffer>();
  outputs.set("README.md", textBytes(renderEnglish(manifest)));
  outputs.set("README.ko.md", textBytes(renderKorean(manifest)));
  return outputs;
}
