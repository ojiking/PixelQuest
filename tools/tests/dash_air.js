// 대쉬 / 대쉬 어택 볼링 / 내려찍기 / 날아차기 / 더블탭 검증
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SP = path.join(__dirname, 'out'); require('fs').mkdirSync(SP, { recursive: true });
const ROOT = path.resolve(__dirname, '../../static/game');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message + '\n' + e.stack));
  await page.route('http://game.test/**', route => {
    const rel = new URL(route.request().url()).pathname.replace(/^\/+/, '') || 'index.html';
    const file = path.join(ROOT, rel);
    route.fulfill({ status: 200, contentType: TYPES[path.extname(file)], body: fs.readFileSync(file) });
  });
  await page.addInitScript(() => localStorage.setItem('pixelquest_meta_v1', JSON.stringify({ scrap: 0, up: { p_flykick: 1, p_stomp: 1 }, runs: 5, wins: 0, bestStage: 0, botClass: 'attack' })));
  await page.goto('http://game.test/index.html');
  await page.waitForTimeout(1200);
  if (errs.length) { console.log(errs); return browser.close(); }
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => { const g = window.__game, st = g.stage; st.hmap.clear(); g.items.length = 0; g.props.length = 0; g.traps.length = 0; g.player.maxHp = g.player.hp = 9999; g.bot.koT = 999; g.bot.setState('ko'); g.bot.x = -3; });

  // 1) 대쉬 거리
  const x0 = await ev(() => { const p = window.__game.player; p.x = 5; p.z = 0; p.facing = 1; return p.x; });
  await page.keyboard.press('ShiftLeft');
  await page.waitForTimeout(400);
  console.log('1 dash distance:', (await ev(() => window.__game.player.x) - x0).toFixed(2));

  // 2) 더블탭 대쉬
  await ev(() => { const p = window.__game.player; p.x = 5; p.setState('idle'); });
  await page.keyboard.press('KeyD'); await page.waitForTimeout(60); await page.keyboard.press('KeyD');
  await page.waitForTimeout(80);
  console.log('2 double tap state:', await ev(() => window.__game.player.state));
  await page.waitForTimeout(400);

  // 3) 대쉬 어택 → 볼링 (깡패 3명 일렬)
  await ev(() => {
    const g = window.__game, p = g.player; p.x = 5; p.z = 0; p.facing = 1; p.setState('idle');
    window.__es = [0, 1, 2].map(i => { const e = g.spawnEnemy('grunt', 1); e.x = 7 + i * 1.3; e.z = 0; e.cool = 99; e.facing = -1; return e; });
    window.__hp0 = window.__es.map(e => e.hp);
  });
  await page.keyboard.press('ShiftLeft'); await page.waitForTimeout(70); await page.keyboard.press('KeyJ');
  await page.waitForTimeout(250);
  await page.screenshot({ path: SP + '/41_bowling.png' });
  await page.waitForTimeout(900);
  console.log('3 bowling hp:', JSON.stringify(await ev(() => window.__es.map((e, i) => `${window.__hp0[i]}→${e.hp}:${e.state}`))));

  // 4) 내려찍기: 쓰러진 적에게 착지
  await ev(() => {
    const g = window.__game, p = g.player;
    for (const e of g.enemies) { e.remove = true; e.dead = true; }
    const e = g.spawnEnemy('grunt', 1); e.x = 9; e.z = 0; e.setState('down'); e.downT = -5; window.__d = e; window.__dh = e.hp;
    p.x = 8.7; p.z = 0; p.setState('idle');
    g.input.just.add('KeyK');
  });
  await page.waitForTimeout(250);
  await ev(() => { const g = window.__game; g.input.down = new Set(['KeyS']); g.input.just.add('KeyJ'); });
  await page.waitForTimeout(500);
  await ev(() => { window.__game.input.down = new Set(); });
  console.log('4 stomp on downed enemy:', await ev(() => `${window.__dh}→${window.__d.hp} dead=${window.__d.dead}`), 'player state', await ev(() => window.__game.player.state));

  // 5) 날아차기 전진
  await page.waitForTimeout(500);
  const fx0 = await ev(() => { const g = window.__game, p = g.player; for (const e of g.enemies) { e.remove = true; e.dead = true; } p.x = 5; p.setState('idle'); p.facing = 1; g.input.just.add('KeyK'); return p.x; });
  await page.waitForTimeout(150);
  await ev(() => window.__game.input.just.add('KeyJ'));
  await page.waitForTimeout(600);
  console.log('5 flykick travel:', (await ev(() => window.__game.player.x) - fx0).toFixed(2));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await browser.close();
})();
