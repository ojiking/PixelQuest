# 자동 테스트 · 자동 플레이

브라우저(Chromium)를 화면 없이 띄워 게임을 실제로 돌려 보는 스크립트들입니다.
결과는 콘솔에 출력되고, 스크린샷은 `tools/tests/out/` 에 저장됩니다.

## 준비 (처음 한 번)
```
cd tools\tests
npm install
npx playwright install chromium
```

## 실행
```
node full_run.js
```
각 스크립트는 `static/game` 폴더를 직접 읽어 가상 주소(http://game.test)로 띄우므로 따로 서버를 켤 필요가 없습니다.
마지막 줄에 `ERRORS: none` / `errors none` 이 나오면 게임 오류 없음.

| 스크립트 | 확인하는 것 |
|---|---|
| `full_run.js` | **전체 진행**: 전투 → 구역 → 스테이지 클리어 → 특성 → 보스 → 챕터 클리어 → 아지트 구매 → 챕터 2 시작 (항상 통과해야 함) |
| `softlock.js` | 진행 막힘 방지 (갇힌 적, 주울 수 없는 무기, 안 사라지는 시체) |
| `pits.js` | 낭떠러지 추락·볼트 복귀·넉백 추락 |
| `dash_air.js` | 대쉬, 날아차기, 내려찍기 |
| `tackle.js` | 숄더 태클 (실제 키 입력 →→J) |
| `limb_weapons.js` | 잘린 팔·다리·머리 줍고 휘두르기 |
| `grab_hint.js` | 잡기·무릎·던지기, L 키 우선순위·라벨, 공격 예고 '!' |
| `cars_biker.js` | 차량 폭파·연쇄, 폭주족 돌진·낙차, 오토바이 들고 던지기 (도심) |
| `blood.js` | 핏자국 (바닥·벽·캐릭터). `WALL=1` 이면 벽 테스트 |
| `hero_blood.js` | 실제 공격으로 적을 벨 때 주인공에게 피가 되튀어 묻는지 |
| `gib_bounce.js` | 떨어진 조각이 통통 튀는지 |
| `gore_bonus.js` | 고어 보너스 지급, 동전 표시 |
| `heal_charger_pitwarn.js` | 스테이지 클리어 회복, 첫 스테이지 돌격 헬멧 1명 제한, 낭떠러지 경고 |
| `unlocks_difficulty.js` | 해금·난이도·예전 저장 환불 |
| `hideout.js` | 아지트 화면, 창 4개, 챕터 클리어 → 다음 챕터 |
| `perf.js` | 핏자국 1.5만 개일 때 프레임 시간 |
| `play.js` + `bot.js` | **자동 플레이어**: 실제 키 입력만으로 여러 판 플레이하고 피해 원인·사망·막힘·프레임을 기록 (`RUNS=3 MAXMIN=25 node play.js`) |

> 테스트 대부분은 디버그용 `window.__game` 으로 상황을 만든 뒤 결과를 확인합니다.
