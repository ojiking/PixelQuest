const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../static/game');
require('fs').mkdirSync(path.join(__dirname, 'out'), { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('http://game.test/**', route => { const rel = new URL(route.request().url()).pathname.replace(/^\/+/, '') || 'index.html'; route.fulfill({ status: 200, contentType: TYPES[path.extname(rel)], body: fs.readFileSync(path.join(ROOT, rel)) }); });
  await page.goto('http://game.test/index.html'); await page.waitForTimeout(1200);
  await page.keyboard.press('Enter'); await page.waitForTimeout(2600);
  await page.evaluate(() => { const g = window.__game, p = g.player; for (const e of g.enemies) { e.remove = true; e.dead = true; } g.zoneIdx = g.stage.zones.length; g.lock = null; g.stage.hmap.clear(); g.props.length = 0; g.items.length = 0;
    p.x = 12; p.z = 0.5; p.hp = p.maxHp = 9999; g.camX = 13; p.weapon = { type: 'machete', dur: 99 }; p.facing = 1; });
  // 실제 공격으로 바로 앞 적 6명을 베어 죽임
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => { const g = window.__game, p = g.player; const e = g.spawnEnemy('grunt', 1); e.x = p.x + 0.9; e.z = p.z; e.cool = 99; e.think = 99; e.hp = 8; });
    for (let k = 0; k < 4; k++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(160); }
    await page.waitForTimeout(400);
  }
  const r = await page.evaluate(() => { const p = window.__game.player; const b = p.blood || {}; return { blood: Object.fromEntries(Object.entries(b).map(([k, v]) => [k, +v.toFixed(2)])), shown: Object.keys(b).map(k => k + ':' + (p.splatFor(k)?.[0] ?? 0).toFixed(2)).join(' '), kills: window.__game.run.kills }; });
  console.log(JSON.stringify(r));
  await page.screenshot({ path: path.join(__dirname, 'out', 'hero_blood.png'), clip: { x: 420, y: 200, width: 400, height: 320 } });
  console.log(errs.length ? errs : 'ok');
  await browser.close();
})();
