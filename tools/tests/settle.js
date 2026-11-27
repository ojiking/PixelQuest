// 가라앉는 시체·조각: 멈추면 어두워져 바닥 피색에 반쯤 섞이고, 들거나 맞으면 원래 색으로
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
  await ev(async () => { window.__settleK = (await import('./js/gibs.js')).settleK; });
  const st = () => ev(() => { const g = window.__game; const c = g.actors.filter(e => e.team === 'enemy' && e.dead && !e.remove); return { corpses: c.map(e => (e.tint()?.[3] ?? 0).toFixed(2) + (e.hidden ? 'H' : '')).join(','), all: g.enemies.length, gibs: g.gibs.list.map(x => x.part + ':' + (window.__settleK(x.settle)).toFixed(2) + (x.rest ? 'R' : '')).join(' ') }; });
  // 실험용 적 둘: 하나는 통째 시체, 하나는 토막
  await ev(() => { const g = window.__game, p = g.player; p.x = 8; p.z = 0.5; window.__labCount = g.lab.count; g.lab.count = 0;
    for (const e of g.enemies) { e.x = 11; e.z = 0.5; g.kill(e, { dir: 1, knock: 2, attacker: p }); }
    const e2 = g.spawnEnemy('grunt', 1); e2.x = 13; e2.z = 1; e2.shatter?.(); g.kill(e2, { dir: 1, knock: 2, attacker: p }); });
  await page.waitForTimeout(600); console.log('0.6s (moving):', JSON.stringify(await st()));
  await page.screenshot({ path: SP + '/settle_0.png' });
  await page.waitForTimeout(5000); console.log('5.6s (settled):', JSON.stringify(await st()));
  await page.screenshot({ path: SP + '/settle_1.png' });
  // 조각 하나를 골프채로 치듯 날리기 (튀어 오르면 원래 색)
  await ev(() => { const g = window.__game, x = g.gibs.list.find(q => q.rest); if (x) { x.rest = false; x.vel = [6, 5, 0]; window.__kicked = x.part; } });
  await page.waitForTimeout(50); console.log('kicked', await ev(() => window.__kicked), JSON.stringify(await st()));
  // 시체를 차서 다시 움직이게 하면 원래 색
  await ev(() => { const g = window.__game, c = g.enemies.find(e => e.dead && !e.remove); if (c) { c.vx = 5; c.vy = 4; c.grounded = false; } });
  await page.waitForTimeout(50); console.log('corpse kicked:', JSON.stringify(await st()));
  await page.waitForTimeout(4000); console.log('settled again:', JSON.stringify(await st()));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await browser.close();
})();
