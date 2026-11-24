// 진입점: 화면 흐름(타이틀 → 정비소 → 런 → 특성 선택 → 결과), HUD, 메인 루프
import { Renderer } from './gl.js';
import { Input } from './input.js';
import { Texts } from './fx.js';
import { Game } from './game.js';
import { PERKS, UPGRADES, WEAPONS, BOT } from './config.js';
import { STAGE_COUNT } from './level.js';
import { loadMeta, saveMeta, resetMeta, computeStats, upgradeCost, buyUpgrade, level, botLevel } from './meta.js';
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

const game = new Game(renderer, input, texts, {
  banner: (text, dur) => showBanner(text, dur),
  onStageClear: final => (final ? finishRun(true) : showPerks()),
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
        <div><b>대쉬</b> 대쉬 중 공격 = 몸통 박치기 (적이 날아가 다른 적과 충돌) · 대쉬 중 점프 = 멀리뛰기</div>
        <div><b>점프</b> 낭떠러지와 벽을 넘기 · <b>줍기/던지기</b> 팔·다리·머리는 들고 공격으로 휘두르기 · 폭탄 드럼통도 던질 수 있음</div>
        <div><b>전술</b> 볼트 전술 변경 · <b>❚❚</b> 일시정지</div>
        <div class="dim">가로 화면으로 플레이하세요</div>
      </div>` : `<div class="controls">
        <div><b>WASD / 방향키</b> 이동 (위아래 = 라인 이동)</div>
        <div><b>J</b> 공격 (연타 콤보, 전기톱은 누르고 있기)</div>
        <div><b>K</b> 점프 · 날아차기·내려찍기·더블 점프는 정비소에서 해금</div>
        <div><b>Shift</b> 또는 좌우 두 번: 대쉬 · 대쉬 중 <b>J</b> 몸통 박치기 · 대쉬 중 <b>K</b> 멀리뛰기</div>
        <div><b>L</b> 줍기/던지기 · 팔·다리·머리를 들면 <b>J</b>로 휘두르기 · 폭탄 드럼통도 들어서 던지기</div>
        <div><b>T</b> 볼트 전술 · <b>M</b> 효과음 · <b>Esc</b> 일시정지</div>
        <div class="dim"><b>P</b> 픽셀 크기 · <b>B</b> (테스트) 적 소환</div>
      </div>`}
      <button class="btn primary" data-act="start">시작 (Enter)</button>
    </div>`);
}

function showHub(msg = '') {
  mode = 'hub';
  hud.classList.add('hidden');
  const groups = {};
  const cls = meta.botClass === 'tank' ? 'tank' : 'attack';
  for (const u of UPGRADES) if (!u.cls || u.cls === cls) (groups[u.group] ||= []).push(u);
  const clsPick = `<div class="clspick">${Object.entries(BOT.classes).map(([k, c]) => `
      <button class="cls ${k === cls ? 'on' : ''}" data-cls="${k}"><b>${c.name}</b><span>${c.desc}</span></button>`).join('')}</div>`;
  const cards = Object.entries(groups).map(([g, list]) => `
    <div class="ugroup"><h3>${g}${g === '볼트' ? ` <small>Lv ${botLevel(meta)} · ${BOT.classes[cls].name}</small>` : ''}</h3>
      ${g === '볼트' ? clsPick : ''}
      ${list.map(u => {
        const lv = level(meta, u.id), cost = upgradeCost(meta, u);
        const can = cost != null && meta.scrap >= cost;
        return `<div class="ucard ${cost == null ? 'max' : ''}">
          <div class="uname">${u.name} <span class="pips">${u.max > 5 ? `Lv ${lv}/${u.max}` : '■'.repeat(lv) + '□'.repeat(u.max - lv)}</span></div>
          <div class="udesc">${u.desc}</div>
          <button class="btn small" data-buy="${u.id}" ${can ? '' : 'disabled'}>${cost == null ? 'MAX' : `⚙ ${cost}`}</button>
        </div>`;
      }).join('')}
    </div>`).join('');
  setScreen(`
    <div class="panel hub">
      <h1>정비소</h1>
      <div class="bank">보유 부품 <b>⚙ ${Math.floor(meta.scrap)}</b> <span class="dim">· 출동 ${meta.runs}회 · 클리어 ${meta.wins}회</span></div>
      ${msg ? `<div class="msg">${msg}</div>` : ''}
      <div class="ugrid">${cards}</div>
      <div class="row">
        <button class="btn primary" data-act="start">출동 (Enter)</button>
        <button class="btn ghost" data-act="reset">기록 초기화</button>
      </div>
    </div>`, 'wide');
}

function startRun() {
  game.startRun(computeStats(meta));
  mode = 'run';
  setScreen('');
  hud.classList.remove('hidden');
  helpT = meta.runs < 3 ? 75 : 0; // 처음 세 판은 75초 동안 조작법 표시
}

// 화면 아래 조작법 안내
const HELP_DESKTOP = `<div><b>이동</b> WASD/방향키 · <b>공격</b> J 연타 · <b>점프</b> K · <b>대쉬</b> Shift(좌우 두 번) · <b>줍기/던지기</b> L · <b>볼트 전술</b> T · <b>일시정지</b> Esc · <b>도움말</b> H</div>
  <div class="dim">대쉬 중 J = 몸통 박치기 · 무기·팔다리·머리는 L로 줍고 J로 휘두르기 · 드럼통은 L로 들고 던지기 · 날아차기·내려찍기·더블 점프는 정비소에서 해금</div>`;
const HELP_MOBILE = `<div><b>조이스틱</b> 이동 · <b>공격</b> 연타(전기톱은 누르기) · <b>점프</b> · <b>대쉬</b> · <b>줍기</b> 줍기/던지기</div>
  <div class="dim">대쉬 중 공격 = 몸통 박치기 · 날아차기 등은 정비소에서 해금</div>`;
let helpT = 0;
const helpBar = document.createElement('div');
helpBar.id = 'helpbar';
helpBar.className = 'hidden';
helpBar.innerHTML = IS_MOBILE ? HELP_MOBILE : HELP_DESKTOP;
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
  const pl = game.player, bot = game.bot;
  if (p.id === 'tough') { pl.maxHp += 25; pl.hp = pl.maxHp; }
  if (p.id === 'overclock') { bot.atkSpeed *= 1.25; bot.speed *= 1.25; }
  if (p.id === 'botpower') bot.power *= 1.35;
  setScreen('');
  mode = 'run';
  game.loadStage(game.run.stage + 1);
}

function finishRun(win) {
  mode = 'result';
  const r = game.run;
  const bonus = win ? 25 : 0;
  const gained = Math.floor(r.scrap) + bonus;
  meta.scrap += gained;
  meta.runs++;
  if (win) meta.wins++;
  meta.bestStage = Math.max(meta.bestStage, r.stage + (win ? 1 : 0));
  saveMeta(meta);
  const t = Math.floor(r.time);
  setScreen(`
    <div class="panel">
      <h1 class="${win ? 'win' : 'lose'}">${win ? '작전 성공!' : '뱀돌이 쓰러짐…'}</h1>
      <div class="stats">
        <div>도달 스테이지 <b>${r.stage + 1} / ${STAGE_COUNT}</b></div>
        <div>처치 <b>${r.kills}</b> · 부위 파괴 <b>${r.severs}</b> · 최대 콤보 <b>${r.maxCombo}</b></div>
        <div>플레이 시간 <b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b></div>
        <div>획득 부품 <b>⚙ ${Math.floor(r.scrap)}</b>${bonus ? ` + 클리어 보너스 ${bonus}` : ''}</div>
        <div class="dim">특성: ${[...r.perks].map(id => PERKS.find(p => p.id === id).name).join(', ') || '없음'}</div>
      </div>
      <p class="dim">죽어도 부품은 남습니다. 정비소에서 뱀돌이와 볼트를 강화하세요.</p>
      <button class="btn primary" data-act="hub">정비소로 (Enter)</button>
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
  const t = e.target.closest('[data-act],[data-buy],[data-perk],[data-cls]');
  if (!t) return;
  playSfx('ui');
  if (t.dataset.cls) { meta.botClass = t.dataset.cls; saveMeta(meta); preview(); showHub(`볼트를 ${BOT.classes[t.dataset.cls].name}으로 바꿨습니다.`); return; }
  if (t.dataset.buy) { if (buyUpgrade(meta, t.dataset.buy)) showHub('업그레이드 완료!'); return; }
  if (t.dataset.perk) { choosePerk(+t.dataset.perk); return; }
  act(t.dataset.act);
});

function act(a) {
  if (a !== 'reset') resetArmed = false;
  switch (a) {
    case 'hub': showHub(); break;
    case 'start': startRun(); break;
    case 'resume': togglePause(); break;
    case 'mute': setMuted(!isMuted()); mode = 'run'; togglePause(); break;
    case 'giveup': game.running = false; finishRun(false); break;
    case 'reset':
      if (resetArmed) { resetArmed = false; meta = resetMeta(); showHub('기록을 초기화했습니다.'); }
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
  if (e.code === 'Escape') togglePause();
  if (e.code === 'KeyH' && mode === 'run') helpT = helpT > 0 ? 0 : 9999;
  if (e.code === 'KeyM') { setMuted(!isMuted()); showBanner(isMuted() ? '효과음 꺼짐' : '효과음 켜짐', 1); }
  if (e.code === 'Enter') {
    if (mode === 'title') startRun();
    else if (mode === 'result') showHub();
    else if (mode === 'hub') startRun();
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
  setText('weapon', p.carry?.kind === 'barrel' ? '폭탄 드럼통 (J/L 던지기)' : p.carry ? (p.carry.limb ? `${CARRY_NAME[p.carry.part] ?? '조각'} (${p.carry.dur}) J 휘두르기 · L 던지기` : `${CARRY_NAME[p.carry.part] ?? '조각'} 들고 있음 (J/L 던지기)`) : p.weapon ? `${WEAPONS[p.weapon.type].name} (${WEAPONS[p.weapon.type].ammo ? '탄 ' : WEAPONS[p.weapon.type].fuel ? '연료 ' : ''}${p.weapon.dur})` : '맨손');
  setText('bot-lv', `${botLevel(meta)} ${BOT.classes[game.stats.bot.cls].name}`);
  setText('tactic', b.state === 'ko' ? `수리 중 ${Math.ceil(b.koT)}s` : game.rescuePending ? '구조 중!' : b.tacticDef.name);
  setText('scrap-n', String(Math.floor(game.run.scrap)));
  const z = game.stage.zones.length;
  setText('stage-info', `STAGE ${game.run.stage + 1}/${STAGE_COUNT} · ${game.stage.biome.name} · 구역 ${Math.min(game.zoneIdx + 1, z)}/${z}`);
  const boss = game.enemies.find(e => e.isBoss && !e.dead);
  $('boss').classList.toggle('hidden', !boss);
  if (boss) { setText('boss-name', boss.def.name); setWidth('hp-boss', boss.hp / boss.maxHp); }
  $('go').classList.toggle('hidden', !(game.goT > 0 && Math.floor(game.time * 3) % 2 === 0));
  const c = $('combo');
  c.classList.toggle('hidden', game.combo < 2);
  if (game.combo >= 2) setText('combo', `${game.combo} HIT`);
  $('perks-hud').textContent = [...game.run.perks].map(id => PERKS.find(x => x.id === id).name).join(' · ');
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
  if (game.stage) {
    game.render();
    texts.update(mode === 'run' ? dt : 0, game.vp);
  }
  updateHud(dt);
  requestAnimationFrame(frame);
}

preview();
showTitle(); // 타이틀 → 바로 게임 (정비소는 런이 끝난 뒤에)
requestAnimationFrame(frame);
