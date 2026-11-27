// 피칠갑 광폭화: 피가 묻으면 게이지↑ → 가득 차면 광폭(무기방 4번으로 즉시), 맨주먹 절단, 공격 속도↑, 처치 시 연장, 시간 끝나면 종료 + 재충전 대기
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../static/game');
const SP = path.join(__dirname, 'out'); fs.mkdirSync(SP, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message + '\n' + e.stack));
  await page.route('http://game.test/**', route => { const rel = new URL(route.request().url()).pathname.replace(/^\/+/, '') || 'index.html'; route.fulfill({ status: 200, contentType: TYPES[path.extname(rel)], body: fs.readFileSync(path.join(ROOT, rel)) }); });
  await page.goto('http://game.test/index.html'); await page.waitForTimeout(1200);
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => document.querySelector('[data-act="lab"]').click()); await page.waitForTimeout(1500);
  const st = () => ev(() => { const p = window.__game.player; return { berserk: p.berserk, rage: +p.rage.toFixed(2), left: +(p.berserkT || 0).toFixed(1), cd: +(p.rageCd || 0).toFixed(1), bar: document.getElementById('rage-fill').style.width, vig: (+getComputedStyle(document.getElementById('rage-vig')).opacity).toFixed(2) }; });
  console.log('1 start:', JSON.stringify(await st()));
  // 평소 맨주먹 절단 정도 (광폭 전) — 적 하나를 콤보로 패기
  const punch = async (label) => {
    await ev(() => { const g = window.__game, p = g.player; const e = g.enemies.find(e => !e.dead); p.x = 10; p.z = 0.5; p.facing = 1; e.x = 11.0; e.z = 0.5; e.hp = 9999; e.maxHp = 9999; e.ai = 'idle'; window.__e = e; window.__sev0 = g.run.stat?.severs || 0; });
    for (let i = 0; i < 12; i++) { await ev(() => { const e = window.__e, p = window.__game.player; e.x = p.x + 1.0; e.z = p.z; }); await page.keyboard.press('KeyJ'); await page.waitForTimeout(140); }
    const r = await ev(() => { const e = window.__e; return { lost: Object.keys(e.parts).filter(k => !e.parts[k].alive).join(',') || '-', severs: (window.__game.run.stat?.severs || 0) - window.__sev0 }; });
    console.log(label, JSON.stringify(r));
  };
  console.log('1b gauge from 20 drops of blood:', await ev(() => { const p = window.__game.player; for (let i = 0; i < 20; i++) p.addBlood('torso', .2); return p.rage.toFixed(3); }));
  await punch('2 normal fists 12 presses -> lost parts:');
  // 무기방 옵션 4: 피 뒤집어쓰기
  await page.keyboard.press('Digit4'); await page.waitForTimeout(400);
  console.log('3 after option 4:', JSON.stringify(await st()), 'spd', await ev(() => { const p = window.__game.player; return (p.spd / p.baseSpd).toFixed(2); }));
  await page.screenshot({ path: SP + '/berserk_1.png' });
  // 눈빛 확대 스크린샷
  await ev(() => { const g = window.__game; g.running = false; });
  const box = await ev(() => { const g = window.__game, p = g.player, s = g.project ? g.project(p.x, p.y + 1.5, p.z) : null; return s; });
  await ev(() => { window.__game.running = true; });
  await punch('4 berserk fists 12 presses -> lost parts:');
  await page.screenshot({ path: SP + '/berserk_2.png' });
  // 공격 속도 측정: 잽 한 번이 끝나는 시간
  const atkDur = await ev(() => new Promise(res => { const g = window.__game, p = g.player; p.attack = null; p.setState('idle'); p.startAttack('jab'); window.__ok = !!p.attack; const t0 = performance.now(); const iv = setInterval(() => { if (!p.attack || performance.now() - t0 > 3000) { clearInterval(iv); res(Math.round(performance.now() - t0)); } }, 10); }));
  console.log('5 jab duration while berserk ms:', atkDur);
  // 처치하면 연장
  const before = (await st()).left;
  await ev(() => { const g = window.__game; const e = g.enemies.find(e => !e.dead); e.hp = 1; g.kill(e, { dir: 1, knock: 3, attacker: g.player }); });
  console.log('6 kill extends time', before, '->', (await st()).left);
  // 마를 때까지 기다리기 (적 공격 끔, 적 수 0으로)
  await page.keyboard.press('Digit2'); await page.keyboard.press('Digit2');
  const t0 = Date.now(); let last;
  while (Date.now() - t0 < 16000) { last = await st(); if (!last.berserk) break; await page.waitForTimeout(500); }
  console.log('7 berserk ended after', ((Date.now() - t0) / 1000).toFixed(1), 's:', JSON.stringify(last));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await browser.close();
})();
