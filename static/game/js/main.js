// 진입점: 화면 흐름(타이틀 → 정비소 → 런 → 특성 선택 → 결과), HUD, 메인 루프
import { Renderer } from './gl.js';
import { Input } from './input.js';
import { Texts } from './fx.js';
import { Game } from './game.js';
import { PERKS, UPGRADES, WEAPONS, BOT, HEAT, TROPHIES, TROPHY_SLOTS } from './config.js';
import { Hideout } from './hideout.js';
import { STAGE_COUNT } from './level.js';
import { loadMeta, saveMeta, resetMeta, computeStats, upgradeCost, buyUpgrade, level, botLevel, heatMax, mergeRunStats, toggleEquip, unlocked } from './meta.js';
import { shuffle } from './math.js';
import { setupTouch, IS_MOBILE } from './touch.js';
import { play as playSfx, sawLoop, isMuted, setMuted } from './sfx.js';

const $ = id => document.getElementById(id);
import { PART_NAME as CARRY_NAME } from './game.js';
const screen = $('screen');
const hud = $('hud');

let renderer;
try {
  renderer = new Renderer($('view'));
} catch (e) {
  screen.innerHTML = `<div class="panel"><h1>실행 불가</h1><p>${e.message}</p></div>`;
  throw e;
}
const input = new Input();
const touch = setupTouch($('stage'), input);
const texts = new Texts($('texts'));
let meta = loadMeta();
let mode = 'title';
let pausedFrom = null;
let perkChoices = [];
let bannerT = 0;
let resetArmed = false;
let hubCont = false;      // 보스를 잡고 아지트에 온 경우: 다음 챕터로 이어서
let panel = null;         // 아지트에서 열린 창: hero / bot / diff / trophy
const hideout = new Hideout(renderer);

const game = new Game(renderer, input, texts, {
  banner: (text, dur) => showBanner(text, dur),
  onStageClear: final => (final ? finishChapter() : showPerks()),
  onRunEnd: () => finishRun(false),
});
game.sfx = playSfx;
window.__game = game; // 디버그용

// 배경으로 쓸 미리보기 스테이지
function preview() {
  game.startRun(computeStats(meta));
  game.running = false;
  game.camX = 9;
}

// ------------------------------------------------------------ 화면들
function setScreen(html, cls = '') {
  if (IS_MOBILE) html = html.replace(/ \((Enter|Esc|1·2·3)\)/g, ''); // 모바일에선 키보드 안내 숨김
  screen.className = 'overlay ' + cls;
  screen.innerHTML = html;
  screen.classList.toggle('hidden', !html);
}

function showTitle() {
  mode = 'title';
  hud.classList.add('hidden');
  setScreen(`
    <div class="panel title">
      <div class="logo"><small>메탈펀치</small><span>뱀돌이</span></div>
      <div class="sub">METAL PUNCH: BAEMDORI — 벨트스크롤 로그라이트 프로토타입</div>
      ${IS_MOBILE ? `<div class="controls">
        <div><b>왼쪽 아래 드래그</b> 이동 (위아래 = 라인 이동)</div>
        <div><b>공격</b> 연타 콤보 · 전기톱은 누르고 있기 · 날아차기·내려찍기는 정비소에서 해금</div>
        <div><b>대쉬</b> 대쉬 중 공격 = 숄더 태클 (적이 날아가 다른 적과 충돌) · 대쉬 중 점프 = 멀리뛰기</div>
        <div><b>점프</b> 낭떠러지와 벽을 넘기 · <b>줍기/던지기</b> 팔·다리·머리는 들고 공격으로 휘두르기 · 폭탄 드럼통도 던질 수 있음</div>
        <div><b>전술</b> 볼트 전술 변경 · <b>❚❚</b> 일시정지</div>
        <div class="dim">가로 화면으로 플레이하세요</div>
      </div>` : `<div class="controls">
        <div><b>WASD / 방향키</b> 이동 (위아래 = 라인 이동)</div>
        <div><b>J</b> 공격 (연타 콤보, 전기톱은 누르고 있기)</div>
        <div><b>K</b> 점프 · 날아차기·내려찍기·더블 점프는 정비소에서 해금</div>
        <div><b>Shift</b> 또는 좌우 두 번: 대쉬 · 대쉬 중 <b>J</b> 숄더 태클 · 대쉬 중 <b>K</b> 멀리뛰기</div>
        <div><b>L</b> 줍기/던지기 · 팔·다리·머리를 들면 <b>J</b>로 휘두르기 · 폭탄 드럼통도 들어서 던지기</div>
        <div><b>T</b> 볼트 전술 · <b>M</b> 효과음 · <b>Esc</b> 일시정지</div>
        <div class="dim"><b>P</b> 픽셀 크기 · <b>B</b> (테스트) 적 소환</div>
      </div>`}
      <button class="btn primary" data-act="start">시작 (Enter)</button>
    </div>`);
}

// ------------------------------------------------------------ 아지트 (정비소)
// 3D 아지트 장면 위에 버튼을 띄우고, 누르면 해당 창이 열림
const hubUI = document.createElement('div');
hubUI.id = 'hubui'; hubUI.className = 'hidden';
$('stage').appendChild(hubUI);

function upgradeCard(u) {
  const lv = level(meta, u.id), cost = upgradeCost(meta, u);
  const can = cost != null && meta.scrap >= cost;
  return `<div class="ucard ${cost == null ? 'max' : ''}">
    <div class="uname">${u.name} <span class="pips">${u.max > 5 ? `Lv ${lv}/${u.max}` : '■'.repeat(lv) + '□'.repeat(u.max - lv)}</span></div>
    <div class="udesc">${u.desc}</div>
    <button class="btn small" data-buy="${u.id}" ${can ? '' : 'disabled'}>${cost == null ? (u.unlock ? '해금됨' : 'MAX') : `⚙ ${cost}`}</button>
  </div>`;
}
function groupCards(names) {
  const cls = meta.botClass === 'tank' ? 'tank' : 'attack';
  return names.map(g => {
    const list = UPGRADES.filter(u => u.group === g && (!u.cls || u.cls === cls));
    return list.length ? `<div class="ugroup"><h3>${g}</h3>${list.map(upgradeCard).join('')}</div>` : '';
  }).join('');
}

function panelHtml(kind, msg) {
  const bank = `<div class="bank">보유 부품 <b>⚙ ${Math.floor(meta.scrap)}</b></div>${msg ? `<div class="msg">${msg}</div>` : ''}`;
  const close = `<div class="row"><button class="btn primary" data-act="close">닫기 (Esc)</button></div>`;
  if (kind === 'hero') return `<div class="panel hub"><h1>주인공 단련</h1>${bank}<div class="ugrid">${groupCards(['해금 · 무기고', '뱀돌이 · 기본', '뱀돌이 · 무기', '뱀돌이 · 기술'])}</div>${close}</div>`;
  if (kind === 'bot') {
    const cls = meta.botClass === 'tank' ? 'tank' : 'attack';
    const pick = `<div class="clspick">${Object.entries(BOT.classes).map(([k, c]) => `<button class="cls ${k === cls ? 'on' : ''}" data-cls="${k}"><b>${c.name}</b><span>${c.desc}</span></button>`).join('')}</div>`;
    return `<div class="panel hub"><h1>볼트 업그레이드 <small class="dim">Lv ${botLevel(meta)} · ${BOT.classes[cls].name}</small></h1>${bank}${pick}<div class="ugrid">${groupCards(['볼트'])}</div>${close}</div>`;
  }
  if (kind === 'diff') return `<div class="panel hub"><h1>난이도 선택</h1>${bank}${heatRow()}<div class="ugrid">${groupCards(['해금 · 지역·적'])}</div>${close}</div>`;
  if (kind === 'trophy') {
    const got = TROPHIES.filter(t => meta.trophies[t.id]).length;
    const cards = TROPHIES.map(t => {
      const has = meta.trophies[t.id], on = meta.equip.includes(t.id), isTitle = meta.title === t.id;
      return `<div class="ucard tcard ${has ? '' : 'locked'} ${on ? 'on' : ''}">
        <div class="uname">${has ? t.name : '???'} <span class="pips">${t.kind === 'title' ? '호칭' : '전리품'}</span></div>
        <div class="udesc">${has ? '' : '조건: '}${t.cond}${t.fx ? `<br><span class="fx">효과: ${t.fxDesc}</span>` : ''}</div>
        <div class="tbtns">${has && t.fx ? `<button class="btn small" data-equip="${t.id}" ${!on && meta.equip.length >= TROPHY_SLOTS ? 'disabled' : ''}>${on ? '장착 해제' : '장착'}</button>` : ''}
        ${has && t.kind === 'title' ? `<button class="btn small ghost" data-title="${t.id}">${isTitle ? '호칭 해제' : '호칭 달기'}</button>` : ''}</div>
      </div>`;
    }).join('');
    return `<div class="panel hub"><h1>전리품 진열대 <small class="dim">${got} / ${TROPHIES.length}</small></h1>
      <div class="bank">효과 장착 <b>${meta.equip.length} / ${TROPHY_SLOTS}</b> <span class="dim">· 호칭은 체력바 옆에 표시됩니다</span></div>${msg ? `<div class="msg">${msg}</div>` : ''}
      <div class="ugrid tgrid">${cards}</div>${close}</div>`;
  }
  return '';
}

function showHub(msg = '') {
  mode = 'hub';
  hud.classList.add('hidden');
  $('banner').classList.add('hidden'); bannerT = 0;
  hideout.setState(meta, BOT.classes[meta.botClass === 'tank' ? 'tank' : 'attack'].model, unlocked(meta).bosses);
  const ch = game.run?.chapter || 1;
  hubUI.innerHTML = `
    <div class="hinfo"><b>⚙ ${Math.floor(meta.scrap)}</b> <span class="dim">· 출동 ${meta.runs}회 · 최고 챕터 ${meta.bestChapter || 0}</span>
      ${hubCont ? `<div class="hcont">CHAPTER ${ch} 클리어! 업그레이드 후 다음 챕터로</div>` : ''}${!panel && msg ? `<div class="msg">${msg}</div>` : ''}</div>
    <button class="hbtn" data-open="hero" data-anchor="hero">💪 주인공 단련</button>
    <button class="hbtn" data-open="bot" data-anchor="bot">🔧 볼트 업그레이드</button>
    <button class="hbtn" data-open="diff" data-anchor="wanted">☠ 난이도 선택${meta.heat ? ` (${meta.heat})` : ''}</button>
    <button class="hbtn" data-open="trophy" data-anchor="trophy">🏆 전리품 진열대</button>
    <button class="btn primary hgo" data-act="start">${hubCont ? `다음 스테이지로 ▶ CHAPTER ${ch + 1}` : '새 게임 시작'} (Enter)</button>
    <button class="btn ghost small hreset" data-act="reset">기록 초기화</button>`;
  if (IS_MOBILE) hubUI.innerHTML = hubUI.innerHTML.replace(/ \((Enter|Esc)\)/g, '');
  hubUI.classList.remove('hidden');
  if (panel) setScreen(panelHtml(panel, msg), 'wide hubpanel');
  else setScreen('');
}
function openPanel(kind, msg = '') { panel = kind; showHub(msg); }
function leaveHub() { panel = null; hubUI.classList.add('hidden'); }

// 난이도 선택 (클리어할 때마다 한 단계씩 열림)
function heatRow() {
  const mx = heatMax(meta), h = meta.heat || 0;
  if (!mx) return `<div class="heat dim">난이도: 보스를 처음 잡으면 해금 — 적이 강해지는 대신 부품을 더 얻음</div>`;
  return `<div class="heat">난이도 <button class="btn small" data-heat="-1" ${h <= 0 ? 'disabled' : ''}>◀</button>
    <b class="hv">${h}</b> / ${mx} <button class="btn small" data-heat="1" ${h >= mx ? 'disabled' : ''}>▶</button>
    <span class="dim">적 체력 +${Math.round(HEAT.enemyHp * h * 100)}% · 공격력 +${Math.round(HEAT.enemyPow * h * 100)}% · 부품 +${Math.round(HEAT.scrap * h * 100)}%</span></div>`;
}

function startRun() {
  leaveHub(); hubCont = false;
  game.startRun(computeStats(meta));
  mode = 'run';
  setScreen('');
  hud.classList.remove('hidden');
  helpT = meta.runs < 3 ? 75 : 0; // 처음 세 판은 75초 동안 조작법 표시
}

// 화면 아래 조작법 안내
const HELP_DESKTOP = `<b>이동</b> WASD · <b>공격</b> J · <b>점프</b> K · <b>대쉬</b> Shift · <b>줍기·잡기/던지기</b> L · <b>전술</b> T · <b>도움말 끄기</b> H`;
const HELP_MOBILE = `적에게 붙어 <b>줍기</b> = 잡기 → <b>공격</b> 무릎 / <b>줍기</b> 던지기`;
// 한 번에 하나씩 돌아가며 보여주는 팁
const HELP_TIPS = IS_MOBILE ? [] : [
  '적에게 붙어 L = 멱살 잡기 → J 무릎(3번째는 니킥) / L 던지기 (반대 방향+L = 뒤로)', '청록색으로 번쩍이며 ! 가 뜨면 강한 공격 예고', '대쉬 중 J = 숄더 태클', '무기·팔다리·머리는 L로 줍고 J로 휘두르기', '드럼통·오토바이는 L로 들어 던지기',
  '날아차기·내려찍기·더블 점프는 정비소에서 해금', '주차된 차는 때리면 폭발한다',
];
let helpT = 0;
const helpBar = document.createElement('div');
helpBar.id = 'helpbar';
helpBar.className = 'hidden';
const helpTip = document.createElement('div');
helpTip.className = 'dim';
helpBar.innerHTML = IS_MOBILE ? HELP_MOBILE : HELP_DESKTOP;
if (HELP_TIPS.length) helpBar.appendChild(helpTip);
$('stage').appendChild(helpBar);

function showPerks() {
  mode = 'perk';
  const owned = game.run.perks;
  perkChoices = shuffle(PERKS.filter(p => !owned.has(p.id))).slice(0, 3);
  setScreen(`
    <div class="panel">
      <h1>STAGE ${game.run.stage + 1} 클리어!</h1>
      <p class="dim">다음 스테이지에 가져갈 특성을 하나 고르세요 (1·2·3)</p>
      <div class="perks">${perkChoices.map((p, i) => `
        <button class="perk" data-perk="${i}"><div class="pk">${i + 1}</div><div class="pn">${p.name}</div><div class="pd">${p.desc}</div></button>`).join('')}
      </div>
    </div>`);
}

function choosePerk(i) {
  const p = perkChoices[i];
  if (!p) return;
  game.run.perks.add(p.id);
  game.applyPerks(p.id);
  setScreen('');
  mode = 'run';
  game.loadStage(game.run.stage + 1);
}

// 결과 공통: 부품을 저장하고 기록을 누적, 새 전리품 표시
function bankRun(bonus) {
  const r = game.run;
  const gained = Math.floor(r.scrap) + bonus;
  meta.scrap += gained;
  r.banked = (r.banked || 0) + gained;
  r.scrap = 0;
  return gained;
}
function trophyLine(got) {
  return got.length ? `<div class="newt">🏆 새 전리품: ${got.map(t => `<b>${t.name}</b>`).join(', ')} <span class="dim">(아지트 진열대에서 확인)</span></div>` : '';
}
function runStats(r) {
  const t = Math.floor(r.time);
  return `<div>처치 <b>${r.kills}</b> · 부위 파괴 <b>${r.severs}</b> · 최대 콤보 <b>${r.maxCombo}</b></div>
    <div>플레이 시간 <b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b></div>
    <div class="dim">특성: ${[...r.perks].map(id => PERKS.find(p => p.id === id).name).join(', ') || '없음'}</div>`;
}

// 보스를 잡음 → 챕터 클리어 → 아지트에서 정비 후 다음 챕터로
function finishChapter() {
  mode = 'result';
  const r = game.run;
  const gained = bankRun(25);
  meta.wins++;
  meta.bestChapter = Math.max(meta.bestChapter || 0, r.chapter);
  const got = mergeRunStats(meta, r);
  saveMeta(meta);
  hubCont = true;
  setScreen(`
    <div class="panel">
      <h1 class="win">CHAPTER ${r.chapter} 클리어!</h1>
      <div class="stats">
        <div>이번 챕터 부품 <b>⚙ ${gained}</b> <span class="dim">(보스 보너스 25 포함)</span></div>
        ${runStats(r)}
      </div>
      ${trophyLine(got)}
      <p class="dim">아지트에서 정비하고 다음 챕터로. 챕터가 오를수록 적이 강해집니다.</p>
      <button class="btn primary" data-act="hub">아지트로 (Enter)</button>
    </div>`);
}

function finishRun(win) {
  mode = 'result';
  const r = game.run;
  const gained = bankRun(0);
  meta.runs++;
  meta.bestStage = Math.max(meta.bestStage, r.stage + 1);
  meta.bestChapter = Math.max(meta.bestChapter || 0, (r.chapter || 1) - 1);
  const got = mergeRunStats(meta, r);
  saveMeta(meta);
  hubCont = false;
  setScreen(`
    <div class="panel">
      <h1 class="lose">뱀돌이 쓰러짐…</h1>
      <div class="stats">
        <div>도달 <b>CHAPTER ${r.chapter || 1} · STAGE ${r.stage + 1} / ${STAGE_COUNT}</b></div>
        ${runStats(r)}
        <div>획득 부품 <b>⚙ ${(r.banked || 0)}</b> <span class="dim">(이번 판 전체)</span></div>
      </div>
      ${trophyLine(got)}
      <p class="dim">죽어도 부품은 남습니다. 아지트에서 뱀돌이와 볼트를 강화하고 처음부터 다시.</p>
      <button class="btn primary" data-act="hub">아지트로 (Enter)</button>
    </div>`);
}

function togglePause() {
  if (mode === 'run') {
    mode = 'pause';
    setScreen(`<div class="panel"><h1>일시정지</h1>
      <p class="dim">볼트 전술: <b>${game.bot.tacticDef.name}</b> — ${game.bot.tacticDef.desc}</p>
      <div class="controls">${IS_MOBILE ? HELP_MOBILE : HELP_DESKTOP}</div>
      <button class="btn small" data-act="mute">효과음: ${isMuted() ? '꺼짐' : '켜짐'} (M)</button>
      <div class="row"><button class="btn primary" data-act="resume">계속 (Esc)</button>
      <button class="btn ghost" data-act="giveup">포기하고 정비소로</button></div></div>`);
  } else if (mode === 'pause') {
    mode = 'run';
    setScreen('');
  }
}

function showBanner(text, dur) {
  const b = $('banner');
  b.textContent = text;
  b.classList.remove('hidden');
  bannerT = dur;
}

// ------------------------------------------------------------ 입력 (메뉴)
screen.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-buy],[data-perk],[data-cls],[data-heat],[data-open],[data-equip],[data-title]');
  if (!t) return;
  playSfx('ui');
  if (t.dataset.open) { openPanel(t.dataset.open); return; }
  if (t.dataset.equip) { toggleEquip(meta, t.dataset.equip); showHub(); return; }
  if (t.dataset.title) { meta.title = meta.title === t.dataset.title ? null : t.dataset.title; saveMeta(meta); showHub(); return; }
  if (t.dataset.cls) { meta.botClass = t.dataset.cls; saveMeta(meta); showHub(`볼트를 ${BOT.classes[t.dataset.cls].name}으로 바꿨습니다.`); return; }
  if (t.dataset.heat) { meta.heat = Math.max(0, Math.min(heatMax(meta), (meta.heat || 0) + +t.dataset.heat)); saveMeta(meta); showHub(); return; }
  if (t.dataset.buy) { if (buyUpgrade(meta, t.dataset.buy)) showHub('업그레이드 완료!'); return; }
  if (t.dataset.perk) { choosePerk(+t.dataset.perk); return; }
  act(t.dataset.act);
});


hubUI.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-open]');
  if (!t) return;
  playSfx('ui');
  if (t.dataset.open) { openPanel(t.dataset.open); return; }
  act(t.dataset.act);
});

function act(a) {
  if (a !== 'reset') resetArmed = false;
  switch (a) {
    case 'hub': panel = null; showHub(); break;
    case 'close': panel = null; showHub(); break;
    case 'start':
      if (mode === 'hub' && hubCont && game.run) { leaveHub(); setScreen(''); hubCont = false; game.continueRun(computeStats(meta)); mode = 'run'; hud.classList.remove('hidden'); }
      else startRun();
      break;
    case 'resume': togglePause(); break;
    case 'mute': setMuted(!isMuted()); mode = 'run'; togglePause(); break;
    case 'giveup': game.running = false; finishRun(false); break;
    case 'reset':
      if (resetArmed) { resetArmed = false; meta = resetMeta(); hubCont = false; showHub('기록을 초기화했습니다.'); }
      else { resetArmed = true; showHub('한 번 더 누르면 부품과 업그레이드 기록이 모두 지워집니다.'); }
      break;
  }
}

addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'KeyP') {
    const order = [2, 3, 4, 1];
    renderer.pixelScale = order[(order.indexOf(renderer.pixelScale) + 1) % order.length];
    showBanner(`픽셀 크기 x${renderer.pixelScale}`, 1);
  }
  if (e.code === 'Escape') { if (mode === 'hub' && panel) { panel = null; showHub(); } else togglePause(); }
  if (e.code === 'KeyH' && mode === 'run') helpT = helpT > 0 ? 0 : 9999;
  if (e.code === 'KeyM') { setMuted(!isMuted()); showBanner(isMuted() ? '효과음 꺼짐' : '효과음 켜짐', 1); }
  if (e.code === 'Enter') {
    if (mode === 'title') startRun();
    else if (mode === 'result') { panel = null; showHub(); }
    else if (mode === 'hub' && !panel) act('start');
  }
  if (mode === 'perk' && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) choosePerk(+e.code.slice(5) - 1);
});

// ------------------------------------------------------------ HUD
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function setWidth(id, ratio) {
  const v = Math.max(0, Math.min(1, ratio)) * 100;
  const key = id + 'w';
  if (Math.abs((hudCache[key] ?? -1) - v) > 0.2) { hudCache[key] = v; $(id).style.width = v + '%'; }
}

function updateHud(dt) {
  if (mode === 'run' && helpT > 0) helpT -= dt;
  if (HELP_TIPS.length) { const tip = '팁: ' + HELP_TIPS[Math.floor(performance.now() / 7000) % HELP_TIPS.length]; if (helpTip.textContent !== tip) helpTip.textContent = tip; }
  helpBar.classList.toggle('hidden', !((mode === 'run' || mode === 'pause') && helpT > 0));
  helpBar.style.opacity = String(Math.min(1, helpT / 2));
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').classList.add('hidden'); }
  if (touch) {
    touch.show(mode === 'run');
    if (mode === 'run') {
      const p = game.player;
      touch.setGrabLabel(p.carry || p.weapon ? '던지기' : '줍기');
    }
  }
  if (mode !== 'run' && mode !== 'pause') return;
  const p = game.player, b = game.bot;
  setWidth('hp-player', p.hp / p.maxHp);
  setWidth('hp-bot', b.hp / b.maxHp);
  setText('hp-player-t', `${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`);
  setText('weapon', p.carry?.kind === 'barrel' ? '폭탄 드럼통 (J/L 던지기)' : p.carry?.kind === 'moto' ? '오토바이 (J/L 던지기 — 폭발!)' : p.carry ? (p.carry.limb ? `${CARRY_NAME[p.carry.part] ?? '조각'} (${p.carry.dur}) J 휘두르기 · L 던지기` : `${CARRY_NAME[p.carry.part] ?? '조각'} 들고 있음 (J/L 던지기)`) : p.weapon ? `${WEAPONS[p.weapon.type].name} (${WEAPONS[p.weapon.type].ammo ? '탄 ' : WEAPONS[p.weapon.type].fuel ? '연료 ' : ''}${p.weapon.dur})` : '맨손');
  setText('bot-lv', `${botLevel(meta)} ${BOT.classes[game.stats.bot.cls].name}`);
  setText('tactic', b.state === 'ko' ? `수리 중 ${Math.ceil(b.koT)}s` : game.rescuePending ? '구조 중!' : b.tacticDef.name);
  setText('scrap-n', String(Math.floor(game.run.scrap)));
  const z = game.stage.zones.length;
  setText('stage-info', `CHAPTER ${game.run.chapter || 1} · STAGE ${game.run.stage + 1}/${STAGE_COUNT} · ${game.stage.biome.name} · 구역 ${Math.min(game.zoneIdx + 1, z)}/${z}`);
  setText('ptitle', game.stats.title ? `「${game.stats.title}」 ` : '');
  const boss = game.enemies.find(e => e.isBoss && !e.dead);
  $('boss').classList.toggle('hidden', !boss);
  if (boss) { setText('boss-name', boss.def.name); setWidth('hp-boss', boss.hp / boss.maxHp); }
  $('go').classList.toggle('hidden', !(game.goT > 0 && Math.floor(game.time * 3) % 2 === 0));
  const c = $('combo');
  c.classList.toggle('hidden', game.combo < 2);
  if (game.combo >= 2) setText('combo', `${game.combo} HIT`);
  $('perks-hud').textContent = [...game.run.perks].map(id => PERKS.find(x => x.id === id).name).join(' · ');
}

// 아지트 버튼을 3D 장면 속 위치에 붙임
function placeHubButtons() {
  const st = $('stage'), W = st.clientWidth, H = st.clientHeight, A = hideout.anchors();
  for (const b of hubUI.querySelectorAll('[data-anchor]')) {
    const [x, y] = hideout.project(A[b.dataset.anchor], W, H);
    b.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  }
}

// ------------------------------------------------------------ 루프
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // 전기톱을 돌리는 동안 엔진 소리
  const pa = game.player?.attack;
  sawLoop(mode === 'run' && !!pa?.def.hold && pa.t >= pa.def.startup && pa.t < pa.def.startup + pa.def.active);
  if (mode === 'run') {
    if (game.update(dt)) input.endFrame();
  } else {
    input.endFrame();
    if (mode !== 'pause' && mode !== 'perk' && game.stage) {
      game.time += dt;
      game.camX += dt * 0.4;
      if (game.camX > game.stage.L - 12) game.camX = 9;
    }
  }
  if (mode === 'hub') {
    hideout.update(dt);
    hideout.render(renderer.resize());
    placeHubButtons();
  } else if (game.stage) {
    game.render();
    texts.update(mode === 'run' ? dt : 0, game.vp);
  }
  updateHud(dt);
  requestAnimationFrame(frame);
}

preview();
showTitle(); // 타이틀 → 바로 게임 (정비소는 런이 끝난 뒤에)
requestAnimationFrame(frame);
