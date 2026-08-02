![커피잔, 궤도선, 네 개의 색상 노드가 있는 Coffee Chat 커버](./docs/assets/readme/coffee-chat-cover.png)

[English](./README.md)

# Coffee Chat

## AI가 실행을 풍부하게 만들수록, 무엇을 만들 가치가 있는지 결정하는 Taste가 중요해집니다.

여기서 Taste는 미적 취향이나 성격이 아니라, 불확실성 속에서 훈련된 판단입니다. 무엇을 보고·선택하고·다듬고·버리며·멈출지를 정합니다. Coffee Chat은 공개 Source와 날짜가 있는 작성자 승인 기록을, 사람과 Agent가 질문하고 활용할 수 있는 시계열 관점 그래프로 만듭니다.

Coffee Chat은 사람을 복제하거나 고정된 Mental Model을 저장하지 않습니다. 현재 질문이나 작업에 필요한 관점만 도출하고, 무엇이 그 관점을 뒷받침하는지와 공개 기록의 경계를 함께 보여줍니다.

[**설치 없이 Coffee Chat 하기**](#설치-없이-coffee-chat-하기) · [**나만의 Coffee Chat 만들기**](#나만의-coffee-chat-만들기)

## 왜 Coffee Chat인가

커피챗은 내가 던지는 질문을 통해 누군가가 어떻게 보고 판단하는지 이해하는 자리입니다. Coffee Chat은 사람과 Agent가 Source·날짜·보이는 한계를 갖춘 문서화된 관점에 같은 방식으로 접근하게 합니다.

- **나의 Agent가 나와 Coffee Chat을 합니다:** 작업 전 관련 기록을 읽고 임시 POV·Mental Model·Task Lens를 도출합니다.
- **다른 사람이 나와 Coffee Chat을 합니다:** 그 사람 또는 그 Agent가 자기 질문으로 기록된 관점을 이해·비교·신중하게 활용합니다.

이곳은 특정 인물을 담지 않은 중립 엔진입니다. 대화하려면 초기화된 공개 인스턴스 URL을 사용하세요.

## 두 가지 필요, 하나의 그래프

| 나의 Taste를 쌓고 활용하기 | 다른 사람의 관점을 이해하고 활용하기 |
| --- | --- |
| 공개 Source 하나와 날짜가 있는 생각을 Agent 인터뷰로 더합니다. | 인스턴스 URL을 열고 설치 없이 질문합니다. |
| 나의 Agent가 작업 전 관련 기록을 찾게 합니다. | 날짜가 있는 Note와 공개 Source까지 답변을 추적합니다. |
| 저장하지 않는 임시 POV·Mental Model·Task Lens를 도출합니다. | 가장·점수 없이 alignment·tension·Unknown을 드러냅니다. |

## 설치 없이 Coffee Chat 하기

초기화된 공개 인스턴스 URL에서 시작하세요. 일회성 Coffee Chat은 아무것도 설치하지 않습니다.

```text
Open <COFFEE_CHAT_INSTANCE_URL>.
Read coffee-chat.json, then AGENTS.md.
Start a one-time Coffee Chat. Do not install anything.

Help me understand how this person approaches <ROLE_OR_PROJECT>.
Show documented alignment, tension, and Unknown.
Distinguish Authored, Sourced, Inferred, and Unknown.
Do not score the person or make a hiring decision.
```

이렇게 물어볼 수 있습니다:

- 이 사람은 이런 결정을 할 때 무엇을 가장 중요하게 보나요?
- 그 판단을 만든 공개 근거는 무엇인가요?
- 관점은 시간에 따라 어떻게, 왜 바뀌었나요?
- 이 역할이나 프로젝트와 맞닿거나 긴장되는 지점은 어디인가요?
- 공개 기록만으로 답할 수 없어 이 사람에게 직접 물어봐야 할 것은 무엇인가요?

역할·채용 비교는 선택 가능한 질문 패턴 중 하나일 뿐, 제품의 정체성이 아닙니다.

## 하나의 기록, 두 방향

![하나의 공개 기록이 주인의 Task Lens와 다른 사람의 근거 기반 Coffee Chat으로 이어지는 흐름](./docs/assets/readme/coffee-chat-flow.en.png)

도출된 Perspective와 Task Lens는 현재 질문이나 작업에만 쓰며 다시 저장하지 않습니다.

- **Build:** 공개 Source 하나와 날짜가 있는 생각에서 시작합니다.
- **Use:** 명시된 작업 전에 관련 판단을 되찾습니다.
- **Talk:** 설치 없이 문서화된 관점을 탐색합니다.
- **Apply:** 출처와 한계를 밝히며 관련 작업에 참고합니다.

## 또 하나의 지식 베이스가 아닌 이유

다른 시스템은 정보를 찾게 하거나 AI가 사용자를 기억·재현하게 합니다. Coffee Chat은 문서화된 판단을 주인과 그 Agent가 활용하고, 다른 사람이 살펴보고, 다른 Agent가 필요한 범위에서 선택적으로 적용하게 합니다.

| 범주 | 핵심 질문 | Coffee Chat의 경계 |
| --- | --- | --- |
| 개인 지식 베이스 | 주인이 무엇을 저장하거나 배웠나? | 승인된 공개 기록이 이 사안을 어떻게 판단했는가? |
| RAG 또는 GraphRAG | 이 코퍼스는 무엇을 말하나? | 무엇이 Authored·Sourced·Inferred·Unknown인가? |
| Agent memory | Agent가 무엇을 기억해야 하나? | 승인된 공개 기록만 남고 작업 합성은 남지 않습니다. |

지식 베이스는 누군가가 아는 것을 찾습니다. Coffee Chat은 그 사람의 문서화된 판단이 어떻게 변화했는지를 사람과 Agent가 활용하게 합니다.

## 신뢰를 얻는 방식

![작성자 기록, 출처 내용, 제한된 추론, 기록으로 알 수 없음의 분리된 네 가지 신뢰 층](./docs/assets/readme/coffee-chat-trust.en.png)

- 모든 기록은 공개 Source에 닿아 있습니다.
- 작성자가 날짜가 있는 Note를 승인합니다.
- 시간에 따른 변화가 보입니다.
- 답변은 Authored·Sourced·Inferred·Unknown을 구분합니다.
- 성격이나 고정 Mental Model을 저장하지 않습니다.
- 도출된 관점은 지속 저장하지 않습니다.

업무는 더 일관되게, 대화는 더 충분한 정보 위에서 하되 사람을 고정하거나 대체하지 마세요.

## Taste를 업무에 적용하기

정확한 외부 작업과 대상을 이름 붙이세요. Agent는 관련된 날짜별 기록만 찾고, 조언 성격의 Task Lens를 뒷받침하는 Note를 밝히며, 이름 붙인 대상만 바꾸고 Coffee Chat 지식과 설치된 플러그인 데이터는 건드리지 않습니다.

```text
Use <YOUR_COFFEE_CHAT_URL> as the perspective source for <TASK>.
Retrieve only the public, dated records relevant to the task.
Derive a temporary POV, Mental Model, and Task Lens.
Explain which judgment criteria affect the work and cite the supporting Notes.
Work only on <TARGET>.
Do not write the synthesis back to Coffee Chat.
```

## 나만의 Coffee Chat 만들기

```text
공개 레퍼런스 하나 + 날짜가 있는 나의 생각
→ Agent 인터뷰
→ 공개 Preview와 승인
→ 첫 Note와 시계열 그래프
→ Coffee Chat과 작업 활용
```

이 중립 엔진에서 별도의 인스턴스를 만드세요. 작성자는 성격 프로필이나 고정 Mental Model을 채우지 않으며, 첫 승인 Note 하나만으로도 질문이나 관련 작업을 바로 지원할 수 있습니다.

주인이 자신의 Agent와 그래프를 쓰는 것이 핵심 반복입니다. 공개 대화와 다른 사람의 신중한 활용은 같은 기록에서 생기는 배포·협업의 반복입니다.

## 설치, 제거, 기여, 라이선스

인스턴스를 만들고 운영하려면 엔진 플러그인을 설치하세요. 반복적인 대화나 작업에는 해당 인물의 인스턴스 플러그인을 설치하세요.

<details><summary>Codex 설치와 제거</summary>

```sh
codex plugin marketplace add https://github.com/SonSangjoon/coffee-chat
codex plugin add coffee-chat@coffee-chat-marketplace

codex plugin remove coffee-chat@coffee-chat-marketplace
codex plugin marketplace remove coffee-chat-marketplace
```

</details>

<details><summary>Claude Code 설치와 제거</summary>

```sh
claude plugin marketplace add https://github.com/SonSangjoon/coffee-chat --scope local
claude plugin install coffee-chat@coffee-chat-marketplace --scope local

claude plugin uninstall coffee-chat@coffee-chat-marketplace --scope local
claude plugin marketplace remove coffee-chat-marketplace
```

</details>

<details><summary>Hook, 수명주기, 업데이트, 캐시, 삭제 receipt</summary>

설치 전에 실제 저장소 hook 경로와 상태를 확인하세요. 안전한 inspection 뒤에만 설치하며, uninstall은 Coffee Chat이 관리하는 hook과 저장소 로컬 runtime만 제거합니다. 관리되지 않는 hook을 우회·자동 연결·덮어쓰지 않습니다.

```sh
npm run cc -- hooks inspect --format json
npm run cc -- hooks install --format json
npm run cc -- hooks uninstall --format json
```

```sh
codex plugin add --help
codex plugin marketplace upgrade coffee-chat-marketplace
codex plugin list --json
codex plugin marketplace list --json
```

```sh
claude plugin update coffee-chat@coffee-chat-marketplace --scope local
claude plugin list --json
claude plugin marketplace list --json
```

Codex의 `plugin add`에는 scope 선택자가 없고 별도 plugin update 명령도 없습니다. 확인되지 않은 scope와 호스트 관리 경로는 Unknown으로 둡니다. Marketplace upgrade는 source snapshot을 갱신하며, 두 개의 읽기 전용 list 명령이 정확한 플러그인과 marketplace의 삭제 receipt입니다.

Claude Code에서는 `local` scope가 가장 좁은 임시 선택입니다. update 명령은 namespaced plugin을 갱신하며, 두 list 명령은 같은 presence-or-absence receipt입니다. 호스트 관리 캐시·대화 기록·로그·보존 데이터는 삭제 후에도 남을 수 있습니다.

도출된 POV·Mental Model·Task Lens와 새 개인 지식은 runtime에 설치된 snapshot에 덧붙이지 않습니다.

</details>

재사용 가능한 스키마·방법론·Skill·안전 가드레일은 [엔진](https://github.com/SonSangjoon/coffee-chat)에 기여하세요. 개인 Note는 작성자가 관리하는 인스턴스에만 둡니다.

[testing and acceptance](./docs/testing.md)를 확인하세요. 코드·스키마·템플릿·Skill은 [MIT License](./LICENSE)를, Note와 독창적 공개 문장은 [콘텐츠 조건](./CONTENT_LICENSE.md)을 따릅니다.
