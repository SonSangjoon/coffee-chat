# Coffee Chat — Sangjoon Son

## Purpose / 목적

A personal, dated point-of-view graph and wiki for Coffee Chats, a personal knowledge graph, and task-scoped agent perspective.
개인의 날짜별 관점을 기록한 그래프이자 위키로, 커피챗·개인 지식 그래프·작업별 에이전트 관점에 활용합니다.

It is not a personality clone, and synthesized Mental Models are never persisted.
성격 복제물이 아니며, 합성된 Mental Model은 저장하지 않습니다.

## AI synthesis / AI 해석

This is an AI-generated synthesis of public, dated records—not the person and not a statement of unrecorded beliefs.
공개된 날짜별 기록을 바탕으로 AI가 만든 해석입니다. 본인이 아니며, 기록되지 않은 생각을 대신 말하지 않습니다.

## One-time Coffee Chat / 일회성 커피챗

Paste this into a web-capable agent; one-time mode installs nothing.
웹을 볼 수 있는 에이전트에 아래 문장을 붙여 넣으세요. 일회성 모드는 아무것도 설치하지 않습니다.

```text
Open https://github.com/SonSangjoon/coffee-chat. Read `coffee-chat.json`, then `AGENTS.md`. Ask me first to choose one-time Coffee Chat or plugin installation. Use only public, dated evidence and keep Authored, Sourced, Inferred, and Unknown distinguishable.
```

## Install plugin / 플러그인 설치

Use the native host manager and review this repository as the source before installation. Coffee Chat v1 contributes only three Skills; it has no service, hook, MCP server, agent, or executable.
호스트의 기본 관리자를 사용하고 설치 전에 이 저장소를 소스로 검토하세요. Coffee Chat v1은 Skill 세 개만 제공하며 서비스·hook·MCP server·agent·실행 파일은 없습니다.

Codex install, then plugin-first removal / Codex 설치 후 플러그인 우선 삭제:

```sh
codex plugin marketplace add https://github.com/SonSangjoon/coffee-chat
codex plugin add coffee-chat-sangjoon@coffee-chat-sangjoon-marketplace
codex plugin remove coffee-chat-sangjoon@coffee-chat-sangjoon-marketplace
codex plugin marketplace remove coffee-chat-sangjoon-marketplace
```

Claude Code local-scope install, then plugin-first removal / Claude Code local scope 설치 후 플러그인 우선 삭제:

```sh
claude plugin marketplace add https://github.com/SonSangjoon/coffee-chat --scope local
claude plugin install coffee-chat-sangjoon@coffee-chat-sangjoon-marketplace --scope local
claude plugin uninstall coffee-chat-sangjoon@coffee-chat-sangjoon-marketplace --scope local
claude plugin marketplace remove coffee-chat-sangjoon-marketplace
```

<details>
<summary>Lifecycle, update, cache, and removal receipt / 수명주기·업데이트·캐시·삭제 receipt</summary>

Codex exposes no plugin scope selector in its current `plugin add` command. Its effective scope and exact host-managed configuration and cache paths are not declared by this repository. Inspect `codex plugin add --help` on the current host; if a lifecycle detail is not exposed, label it `Unknown` before installing.
현재 Codex의 `plugin add` 명령은 플러그인 scope 선택자를 제공하지 않습니다. 실제 적용 범위와 호스트가 관리하는 설정·캐시의 정확한 경로는 이 저장소가 정하지 않습니다. 현재 호스트에서 `codex plugin add --help`를 확인하고, 확인되지 않는 수명주기 정보는 설치 전에 `Unknown`으로 표시하세요.

Refresh the marketplace snapshot with the following command, then inspect `codex plugin list --json`. The current Codex CLI has no separate `plugin update` command, so do not claim the installed snapshot changed unless the native manager reports it.
아래 명령으로 marketplace snapshot을 갱신한 뒤 `codex plugin list --json`을 확인하세요. 현재 Codex CLI에는 별도 `plugin update` 명령이 없으므로 기본 관리자가 확인해 주지 않은 설치 snapshot 변경을 단정하지 마세요.

```sh
codex plugin marketplace upgrade coffee-chat-sangjoon-marketplace
```

`plugin remove` removes this plugin from Codex local configuration and cache. Remove its marketplace only when no other plugin needs that source:
`plugin remove`는 Codex의 로컬 설정과 캐시에서 이 플러그인을 제거합니다. 다른 플러그인이 해당 소스를 사용하지 않을 때만 marketplace도 제거하세요:

```sh
codex plugin list --json
codex plugin marketplace list --json
```

The last two read-only commands are the removal receipt: report whether this exact plugin and marketplace remain, plus any path the host leaves `Unknown`.
마지막 두 읽기 전용 명령이 삭제 receipt입니다. 정확히 이 플러그인과 marketplace가 남아 있는지, 호스트가 공개하지 않아 `Unknown`인 경로가 무엇인지 보고하세요.

Claude Code supports `user`, `project`, and `local` scopes; `local` is the narrowest temporary choice. It copies the plugin into a host cache. Installing at another scope changes that scope's settings. Uninstalling the last scope deletes plugin persistent data unless `--keep-data` is used; Coffee Chat v1 declares no persistent-data component.
Claude Code는 `user`·`project`·`local` scope를 지원하며, 잠시 사용할 때는 `local`이 가장 좁습니다. 플러그인은 호스트 캐시에 복사되고, 다른 scope를 선택하면 해당 scope의 설정이 바뀝니다. 마지막 scope에서 삭제하면 `--keep-data`를 쓰지 않는 한 플러그인 영속 데이터도 삭제되지만 Coffee Chat v1은 영속 데이터 구성요소를 선언하지 않습니다.

```sh
claude plugin update coffee-chat-sangjoon@coffee-chat-sangjoon-marketplace --scope local
claude plugin list --json
claude plugin marketplace list --json
```

For Claude Code, the final two list commands are the same presence/absence receipt. Marketplace removal clears its registration and uninstalls remaining plugins from it; exact residual cache paths remain host-dependent unless the manager reports them.
Claude Code에서도 마지막 두 list 명령을 presence/absence receipt로 사용합니다. marketplace 삭제는 등록을 지우고 그곳에서 설치한 남은 플러그인도 삭제하지만, 관리자가 알려주지 않는 잔여 캐시의 정확한 경로는 호스트에 따라 달라집니다.

Coffee Chat writes no runtime cache or personal data. Host conversation history, logs, and retention are outside Coffee Chat and may remain after plugin removal.
Coffee Chat 자체는 runtime cache나 개인 데이터를 기록하지 않습니다. 호스트의 대화 기록·로그·보존 정책은 Coffee Chat 밖에 있으며 플러그인을 지운 뒤에도 남을 수 있습니다.

</details>

## Make mine / 내 것으로 만들기

Fork the repository, open the fork in Codex or Claude Code, explicitly choose **Make mine**, and ask `build-kg` to prepare your first public Source-backed Note. Nothing is written before you approve the exact Preview digest.
저장소를 포크해 Codex 또는 Claude Code에서 열고 **Make mine**을 명시한 뒤, `build-kg`에 첫 공개 Source 기반 Note 준비를 요청하세요. 정확한 Preview digest를 승인하기 전에는 쓰지 않습니다.

## Browse KG / KG 둘러보기

[Browse the temporal graph / 시계열 그래프 보기](https://sonsangjoon.github.io/coffee-chat/)

### Build the public record / 공개 기록 만들기

Public Sources plus dated thoughts become linked Notes, Sources, and neutral Entities in a temporal knowledge graph.
공개 Source와 날짜가 있는 생각이 서로 연결된 Note·Source·중립 Entity의 시계열 지식 그래프가 됩니다.

### Use the public record / 공개 기록 사용하기

An agent retrieves the relevant temporal subgraph, derives a query-scoped Perspective and optional Task Lens, uses them with evidence, and never writes that synthesis back.
에이전트는 관련 시계열 부분 그래프에서 질문별 Perspective와 선택적 Task Lens를 합성해 근거와 함께 사용하고, 그 합성을 다시 저장하지 않습니다.

Code, schemas, templates, and Skills use the [MIT License](./LICENSE). Notes and original public prose use the [content terms](./CONTENT_LICENSE.md); third-party Sources retain their own terms.
코드·스키마·템플릿·Skill은 [MIT License](./LICENSE)를, Note와 독창적 공개 문장은 [콘텐츠 조건](./CONTENT_LICENSE.md)을 따르며 제3자 Source의 권리는 각 권리자에게 있습니다.
