# 인수인계 · 이어서 개발하는 방법

> 현재 버전: **v0.6.9** (2026-11-26 기준) · 자세한 기능 목록과 변경 기록은 `docs/DESIGN.md`

## 1. 이 폴더에 들어 있는 것
| 경로 | 내용 |
|---|---|
| `static/game/` | **게임 본체** (index.html, style.css, js/*.js) |
| `docs/DESIGN.md` | 살아 있는 기획서: 시스템 표, 무기·적 목록, 수치 가이드, 변경 기록 |
| `docs/ART_DIRECTION.md` | 아트 디렉션: 목표 화면 기준, 팔레트, 배경 두 안(한국/뉴욕), 이미지 프롬프트 |
| `docs/HANDOFF.md` | 이 문서 |
| `CLAUDE.md` | Claude Code가 자동으로 읽는 프로젝트 안내 (코드 지도, 작업 규칙, 사용자 취향) |
| `tools/tests/` | 자동 테스트·자동 플레이 스크립트 (Playwright) |
| `start-game.bat` / `start-game.sh` | 게임 실행 (로컬 웹 서버 + 브라우저) |
| `app.py` | (기존) Flask 앱. `/game` 경로로 게임 연결 |

## 2. 게임 실행하기 (Windows)
1. [Python](https://www.python.org/downloads/) 설치 (설치할 때 "Add python.exe to PATH" 체크).
2. 폴더의 **`start-game.bat` 더블클릭** → 브라우저가 http://localhost:8000 을 연다.
3. 창을 닫으면 서버도 꺼진다.

> 파일(index.html)을 직접 더블클릭하면 안 열림 — ES 모듈이라 웹 서버가 필요.

## 2-1. 웹에서 바로 플레이 (GitHub Pages)
- 주소: **https://ojiking.github.io/PixelQuest/** (저장소 루트의 `index.html`이 `static/game/`으로 이동시킴, `.nojekyll`로 파일을 그대로 전달)
- 처음 한 번 설정: GitHub 저장소 → **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `ccr-dfd63318-2julkh` / `(root)` → Save**
- 이후 이 브랜치에 커밋을 올리면 1~2분 뒤 자동으로 갱신됨. 브랜치를 main으로 합치면 Pages의 Branch도 main으로 바꿀 것.

## 3. Claude로 이어서 개발하기 (Ultra/Max 등 구독 플랜)

### 방법 A — 내 PC에서 Claude Code (추천)
1. Node.js 18 이상 설치 → 명령 프롬프트에서 `npm install -g @anthropic-ai/claude-code`
   (또는 Claude 데스크톱 앱의 Claude Code 사용)
2. 명령 프롬프트에서 이 폴더로 이동: `cd /d "D:\!!!self_made_app\벨트스크롤액션게임-클로드"`
3. `claude` 실행 → 구독 계정으로 로그인
4. 첫 메시지 예시 (아래 4장 참고)

Claude Code는 폴더의 `CLAUDE.md`를 자동으로 읽으므로 맥락을 빠르게 잡는다.

### 방법 B — claude.ai/code (클라우드)
- GitHub 저장소 `ojiking/pixelquest`의 브랜치 **`ccr-dfd63318-2julkh`** 에 지금까지의 모든 커밋이 올라가 있다.
- claude.ai/code에서 이 저장소와 브랜치로 새 세션을 시작하면 그대로 이어서 작업 가능.
- (선택) 이 브랜치를 기본 브랜치에 합치면 이후 세션이 더 간단해진다.

### 로컬 폴더를 GitHub와 연결하고 싶다면
```
cd /d "D:\!!!self_made_app\벨트스크롤액션게임-클로드"
git init
git remote add origin https://github.com/ojiking/pixelquest.git
git fetch origin ccr-dfd63318-2julkh
git reset --soft FETCH_HEAD
```

## 4. 새 세션 첫 메시지 예시
```
CLAUDE.md와 docs/HANDOFF.md, docs/DESIGN.md를 읽고 프로젝트를 파악해줘.
지금까지 웹 프로토타입으로 기획을 검증하며 만들어 왔고, 같은 방식으로 이어서 개발하고 싶어.
설명은 한국어로 해줘. 먼저 start-game.bat로 실행되는지와 tools/tests/full_run.js 테스트가 통과하는지 확인해줘.
```

## 5. 테스트 돌리기
`tools/tests/README.md` 참고. 요약:
```
cd tools\tests
npm install
npx playwright install chromium
node full_run.js
```

## 6. 현재 상태 요약
- **판 구조**: 챕터(스테이지 2 + 보스) 반복. 보스를 잡으면 아지트를 거쳐 다음 챕터로, 쓰러지면 처음부터.
- **아지트**: 3D 장면(역기 드는 뱀돌이·충전 중인 볼트·현상수배 포스터·전리품 진열대)에서 업그레이드·난이도·전리품 관리.
- **전투**: 3~4연타, 대쉬·숄더 태클, 날아차기·내려찍기(해금), 잡기(무릎·던지기), 무기 17종(+적 전용), 신체 부위를 무기로, 드럼통·오토바이 던지기, 폭발하는 차.
- **적 9종 + 보스 2종**, 난이도 곡선에 따라 등장(새 적은 소개).
- **고어**: 부위별 절단·분쇄·두 동강·산산조각, 통통 튀는 조각, 표면에 칠해지는 핏자국, 캐릭터에 묻는 피, 고어 보너스(부품).
- **진행**: 해금(무기고·지역·현상수배), 수치 업그레이드, 난이도 0~5, 전리품 12종(최대 3개 장착, 호칭).
- **모바일**: 휴대폰에서만 터치 UI.

## 7. 다음에 할 일 (후보)
1. **콘텐츠 확장** — 새 지역·새 적·새 보스 (엔딩을 정하려면 먼저 필요)
2. **볼트 협동기** — 적을 볼트에게 던지면 받아치기, 볼트 발판 점프, 상황별 대사
3. **난이도 단계에 새 요소** — 정예 적, 함정 증가, 보스 새 패턴 (지금은 숫자만 커짐)
4. **엔딩** — 콘텐츠가 충분해진 뒤 결정 (기획서 '열린 질문')
5. 세계관 연출(스테이지 시작 컷, 적 소개 카드), 배경음악

> **바로 다음 작업 후보**: 기획서(`docs/DESIGN.md`)의 '광기 액션 아이디어' 목록 — 사용자가 승인한 항목들(볼트 합체기 제외). 추천 시작: 피칠갑 광폭화 + 처형기 + 머리 없는 몸.

## 8. 알려진 문제
- **샷건 드는 자세·사격 폼이 아직 어색함** (사용자 피드백). 반동은 좋아졌다는 평가. 나중에 다시 손볼 것 — 무기방(타이틀의 🔧 무기방)에서 확인 가능. 관련 코드: `actor.js`의 `gunHold`, `attackPose` 'shoot'.
- 원인을 확정하지 못한 막힘 1건: 적이 없는데 구역이 25초간 안 풀린 적이 있음(강제 해제로 진행됨). 뒷골목 쓰레기통 뒤에 적이 갇히는 경우로 의심.
- 모바일 실기기 성능은 직접 확인 필요(자동 테스트 환경은 그래픽카드 없이 그림).
- 이전 저장 데이터에는 보스 처치 누적 기록이 없어 전리품이 처음엔 비어 있음.
