const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../static/game');
const SP = path.join(__dirname, 'out'); require('fs').mkdirSync(SP, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message + '\n' + e.stack));
  await page.route('http://game.test/**', route => { const rel = new URL(route.request().url()).pathname.replace(/^\/+/, '') || 'index.html'; route.fulfill({ status: 200, contentType: TYPES[path.extname(rel)], body: fs.readFileSync(path.join(ROOT, rel)) }); });
  await page.goto('http://game.test/index.html'); await page.waitForTimeout(1200);
  await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => { const g = window.__game, p = g.player; for (const e of g.enemies) { e.remove = true; e.dead = true; } g.zoneIdx = g.stage.zones.length; g.lock = null; g.stage.hmap.clear(); g.props.length = 0; p.maxHp = p.hp = 9999; p.x = 8; p.z = 0.5; g.camX = 12; g.bot.koT = 999; g.bot.setState('ko'); g.bot.x = -5;
    window.__es = [0, 1, 2].map(i => { const e = g.spawnEnemy('grunt', 1); e.x = 12 + i * 1.1; e.z = 0.5; e.cool = 99; e.think = 99; return e; }); window.__h0 = window.__es.map(e => e.hp); });
  await page.waitForTimeout(200);
  // 실제 입력: 오른쪽 두 번(대쉬) → J
  await page.keyboard.press('KeyD'); await page.waitForTimeout(60); await page.keyboard.press('KeyD'); await page.waitForTimeout(70); await page.keyboard.press('KeyJ');
  await page.waitForTimeout(110); await page.screenshot({ path: SP + '/86_tackle.png' });
  await page.waitForTimeout(140); await page.screenshot({ path: SP + '/87_tackle_hit.png' });
  await page.waitForTimeout(900);
  console.log('enemies hp', await ev(() => window.__es.map((e, i) => `${window.__h0[i]}→${e.dead ? 'dead' : e.hp}`).join(', ')), 'anim seen', await ev(() => window.__game.player.state));
  // 돌진 중 무적
  const inv = await ev(() => { const g = window.__game, p = g.player; p.setState('idle'); p.attack = null; p.startAttack('dashAtk'); p.attack.t = 0.1; const hp = p.hp; const e = g.spawnEnemy('brute', 1); e.x = p.x + 0.8; e.z = p.z; e.facing = -1;
    const { applyHit } = window.__ah || {}; return hp; });
  console.log('errors', errs.length ? errs : 'none');
  await browser.close();
})();
