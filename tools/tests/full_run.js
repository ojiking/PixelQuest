// 전체 루프 검증: 전투(부위 파괴/처치) → 구역 진행 → 스테이지 클리어 → 특성 → 보스 → 결과 → 정비소 구매
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SP = path.join(__dirname, 'out'); require('fs').mkdirSync(SP, { recursive: true });
const ROOT = path.resolve(__dirname, '../../static/game');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message + '\n' + e.stack));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.route('http://game.test/**', route => {
    const rel = new URL(route.request().url()).pathname.replace(/^\/+/, '') || 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'nf' });
    route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await page.addInitScript(() => { window.__flat = true; });
  await page.goto('http://game.test/index.html');
  await page.waitForFunction(() => window.__game);
  await page.evaluate(() => { const g = window.__game; const orig = g.loadStage.bind(g); g.loadStage = i => { orig(i); g.stage.hmap.clear(); }; });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  await page.keyboard.press('Enter'); await page.waitForTimeout(800);

  const state = () => page.evaluate(() => {
    const g = window.__game;
    return { stage: g.run.stage, zone: g.zoneIdx, lock: !!g.lock, px: +g.player.x.toFixed(1), hp: g.player.hp, pstate: g.player.state,
      enemies: g.enemies.map(e => `${e.type}:${e.hp}:${e.state}:${Object.entries(e.parts).filter(([k, p]) => !p.alive).map(([k]) => k).join('/')}`),
      kills: g.run.kills, severs: g.run.severs, scrap: +g.run.scrap.toFixed(1), bot: `${g.bot.state}:${g.bot.hp}`, running: g.running, debris: g.debris.n };
  });

  // 1) 실제 전투: 적에게 다가가서 공격 연타 (플레이어 무적 처리로 진행 보장)
  await page.evaluate(() => { const g = window.__game; g.player.maxHp = g.player.hp = 99999; });
  for (let step = 0; step < 160; step++) {
    await page.evaluate(() => {
      const g = window.__game, p = g.player;
      const t = g.enemies.filter(e => !e.dead).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      const keys = new Set();
      if (t) {
        const dx = t.x - p.x, dz = t.z - p.z;
        if (Math.abs(dx) > 1.0) keys.add(dx > 0 ? 'KeyD' : 'KeyA');
        else if (Math.abs(dx) < 0.5) keys.add(dx > 0 ? 'KeyA' : 'KeyD');
        if (Math.abs(dz) > 0.25) keys.add(dz > 0 ? 'KeyS' : 'KeyW');
        if (Math.abs(dx) < 1.4 && Math.abs(dz) < 0.4) { p.facing = dx > 0 ? 1 : -1; g.input.just.add('KeyJ'); }
      } else keys.add('KeyD');
      g.input.down = keys;
    });
    await page.waitForTimeout(100);
  }
  const s1 = await state();
  console.log('after combat:', JSON.stringify(s1));
  await page.screenshot({ path: SP + '/05_combat.png' });

  // 2) 남은 구역을 치트로 정리하며 스테이지 끝까지
  for (let i = 0; i < 400; i++) {
    const done = await page.evaluate(() => {
      const g = window.__game;
      if (!g.running) return true;
      for (const e of g.enemies) if (!e.dead) g.kill(e, { dir: 1, knock: 3 });
      if (g.lock) g.lock.queue.length = 0;
      g.player.x += 2.5;
      g.input.down = new Set(['KeyD']);
      return false;
    });
    await page.waitForTimeout(120);
    if (done) break;
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: SP + '/06_perk.png' });
  console.log('screen after stage1:', await page.evaluate(() => document.querySelector('#screen h1')?.textContent));
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(1200);
  console.log('stage2:', JSON.stringify(await state()));
  await page.screenshot({ path: SP + '/07_stage2.png' });

  // 3) 보스 구역까지 이동
  for (let i = 0; i < 400; i++) {
    const r = await page.evaluate(() => {
      const g = window.__game;
      const z = g.stage.zones[g.zoneIdx];
      if (z && z.boss && g.lock && g.enemies.some(e => e.isBoss)) return 'boss';
      for (const e of g.enemies) if (!e.dead) g.kill(e, { dir: 1, knock: 3 });
      if (g.lock) g.lock.queue = g.lock.queue.filter(t => t === 'boss' || t === 'cyborg');
      g.player.x += 2.5;
      return 'go';
    });
    await page.waitForTimeout(150);
    if (r === 'boss') break;
  }
  await page.evaluate(() => { const g = window.__game; g.input.down = new Set(); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: SP + '/08_boss.png' });
  console.log('boss fight:', JSON.stringify(await state()));

  // 4) 보스 처치 → 결과 → 정비소
  await page.evaluate(() => { const g = window.__game; for (const e of g.enemies) if (!e.dead) g.kill(e, { dir: 1, knock: 3 }); g.lock && (g.lock.queue.length = 0); });
  for (let i = 0; i < 400; i++) {
    const end = await page.evaluate(() => { const g = window.__game; if (!g.running) return true; for (const e of g.enemies) if (!e.dead) g.kill(e, { dir: 1, knock: 3 }); g.player.x += 2; return false; });
    await page.waitForTimeout(150);
    if (end) break;
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: SP + '/09_result.png' });
  console.log('result:', await page.evaluate(() => document.querySelector('#screen h1')?.textContent));
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  console.log('hub go:', await page.evaluate(() => document.querySelector('.hgo')?.textContent.trim()));
  await page.evaluate(() => document.querySelector('[data-open="hero"]').click()); await page.waitForTimeout(200);
  const buy = await page.evaluate(() => { const b = document.querySelector('[data-buy]:not([disabled])'); if (!b) return 'none'; const id = b.dataset.buy; b.click(); return id; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: SP + '/10_hub.png' });
  console.log('bought:', buy, 'meta:', await page.evaluate(() => localStorage.getItem('pixelquest_meta_v1')));
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
  console.log('chapter 2:', await page.evaluate(() => { const g = window.__game; return g.running + ' ch' + g.run.chapter + ' ' + document.getElementById('stage-info').textContent; }));
  console.log('ERRORS:', errs.length ? errs.join('\n') : 'none');
  await browser.close();
})();
