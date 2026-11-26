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
  await page.keyboard.press('Enter'); await page.waitForTimeout(1000);
  const ev = (f, a) => page.evaluate(f, a);
  // 1) 낭떠러지 경고: 낭떠러지 있는 스테이지를 찾을 때까지 다시 생성
  const pit = await ev(() => { const g = window.__game; for (let k = 0; k < 12; k++) { if (g.stage.hazardN) break; g.loadStage(0); }
    const st = g.stage; let px = null; for (let x = 6; x < st.L && px == null; x++) for (let z = -3; z <= 4; z++) if (st.heightAt(x + .5, z + .5) === -100) { px = x; break; }
    for (const e of g.enemies) { e.remove = true; e.dead = true; } g.zoneIdx = st.zones.length; g.lock = null;
    if (px != null) { g.player.x = px - 3; g.camX = px + 1; } return { hazard: st.hazardN, pitX: px, segs: st.segments.map(s => s.type).join(',') }; });
  console.log('pit warn:', JSON.stringify(pit));
  await page.waitForTimeout(600); await page.screenshot({ path: SP + '/80_pit.png' });
  // 2) 구역 회복
  const heal = await ev(() => { const g = window.__game, p = g.player; g.zoneIdx = 0; p.x = g.stage.zones[0].trigger + 1; p.hp = 40; return p.hp; });
  await page.waitForTimeout(400);
  await ev(() => { const g = window.__game; if (g.lock) { g.lock.queue = []; g.lock.wave = 99; for (const e of g.enemies) { e.remove = true; e.dead = true; } } });
  await page.waitForTimeout(1500);
  console.log('zone heal: hp 40 →', await ev(() => window.__game.player.hp), '/', await ev(() => window.__game.player.maxHp), 'zoneIdx', await ev(() => window.__game.zoneIdx));
  // 3) 첫 스테이지 돌격 헬멧 동시 1명
  await ev(() => { const g = window.__game, p = g.player; p.maxHp = p.hp = 9999; g.zoneIdx = 1; p.x = g.stage.zones[1].trigger + 1; });
  await page.waitForTimeout(300);
  await ev(() => { const g = window.__game; g.lock.queue = ['charger', 'charger', 'charger', 'grunt']; g.lock.spawnT = 0; for (const e of g.enemies) { e.cool = 99; } window.__maxC = 0;
    setInterval(() => { const n = g.enemies.filter(e => e.type === 'charger' && !e.dead).length; window.__maxC = Math.max(window.__maxC, n); }, 50); });
  await page.waitForTimeout(2500);
  console.log('charger alive max:', await ev(() => window.__maxC), 'queue left:', await ev(() => window.__game.lock?.queue.join(',')));
  await ev(() => { const g = window.__game; const c = g.enemies.find(e => e.type === 'charger' && !e.dead); if (c) g.kill(c, { dir: 1, knock: 3 }); });
  await page.waitForTimeout(1500);
  console.log('after killing one: alive chargers', await ev(() => window.__game.enemies.filter(e => e.type === 'charger' && !e.dead).length), 'queue', await ev(() => window.__game.lock?.queue.join(',')), 'max', await ev(() => window.__maxC));
  console.log('errors', errs.length ? errs : 'none');
  await browser.close();
})();
