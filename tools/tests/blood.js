// 차량 폭발 / 폭주족 / 오토바이 던지기
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
    route.fulfill({ status: 200, contentType: TYPES[path.extname(rel)], body: fs.readFileSync(path.join(ROOT, rel)) });
  });
  await page.goto('http://game.test/index.html');
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  const ev = (f, a) => page.evaluate(f, a);
  await page.waitForTimeout(2500);
  if (errs.length) { console.log(errs); return browser.close(); }
  // 벽이 있는 곳을 찾아 그 앞에서 적을 터뜨림
  await ev(() => { const g = window.__game, p = g.player, st = g.stage; for (const e of g.enemies) { e.remove = true; e.dead = true; } g.zoneIdx = st.zones.length; g.lock = null; g.items.length = 0;
    p.maxHp = p.hp = 9999; g.bot.koT = 999; g.bot.setState('ko'); g.bot.x = -5;
    // 실제 벽 찾기: 높이 2 칸의 바로 오른쪽이 평지인 곳 (벽의 오른쪽 옆면)
    let W = null;
    for (const [k, v] of st.hmap) { if (v !== 2) continue; const [x, z] = k.split(',').map(Number); if (z < -2 || z > 3 || x < 8) continue; if ((st.hmap.get((x + 1) + ',' + z) ?? 0) === 0) { W = { x, z }; break; } }
    window.__W = W; const bx = W ? W.x + 1 : 12; window.__bx = bx;
    p.x = bx + 0.6; p.z = W ? W.z + 0.5 : 0.8; p.facing = -1; g.camX = bx + 3; });
  if (process.env.WALL) { await ev(() => { const g = window.__game, p = g.player, bx = window.__bx; p.x = bx + 4; for (let i = 0; i < 3; i++) { const e = g.spawnEnemy('grunt', 1); e.x = bx + 0.9 + i * .3; e.z = p.z; e.cool = 99; e.dead = true; e.blastApart?.(-1, {}); g.kill(e, { dir: -1, knock: 3 }); } }); await page.waitForTimeout(1500);
    console.log('wall test stains on wall', await ev(() => { const S = window.__game.stains, bx = window.__bx; const ix = Math.floor((bx - 0.03 - S.o[0]) * S.res); let c = 0; for (let iz = 0; iz < S.D; iz++) for (let iy = 6; iy < S.H; iy++) if (S.data[ix + S.W * (iy + S.H * iz)] > 15) c++; return c; }));
    await ev(() => { window.__game.camX = window.__bx + 2; }); await page.waitForTimeout(200); await page.screenshot({ path: SP + '/73_wall.png' }); await browser.close(); return; }
  console.log('wall', await ev(() => JSON.stringify(window.__W)));
  await page.waitForTimeout(300);
  const kills = [['blastApart', 2.0, 0], ['bisect', 2.6, .2], ['shatter', 1.8, -.2]];
  for (const [how, dx, dz] of kills) {
    await ev(([how, dx, dz]) => { const g = window.__game, p = g.player, x = window.__bx + dx, z = p.z + dz; const e = g.spawnEnemy('grunt', 1); e.x = x; e.z = z; e.cool = 99;
      if (how === 'blastApart') { e.dead = true; e.blastApart?.(-1, {}); g.kill(e, { dir: 1, knock: 3 }); }
      else if (how === 'bisect') { g.kill(e, { dir: -1, knock: 3, bisect: 1, attacker: p }); e.bisect?.(-1, {}); }
      else { e.shatter(); g.kill(e, { dir: 1, knock: 3 }); } }, [how, dx, dz]);
    await page.waitForTimeout(900);
  }
  // 잘라서 출혈
  await ev(() => { const g = window.__game; const e = g.spawnEnemy('brute', 1); e.x = window.__bx + 1.6; e.z = g.player.z; e.cool = 99; window.__e = e; g.severPart(e, 'head', -1, { mode: 'cut' }); g.severPart(e, 'armF', -1, { mode: 'saw' }); });
  await page.waitForTimeout(1500);
  console.log('wall stains', await ev(() => { return window.__game.stains.n; }));
  const info = await ev(() => { const g = window.__game; return { stains: g.stains.n, hero: JSON.stringify(Object.fromEntries(Object.entries(g.player.blood || {}).map(([k, v]) => [k, +v.toFixed(2)]))), brute: Object.keys(window.__e.blood || {}).length }; });
  console.log('after gore', JSON.stringify(info));
  await page.screenshot({ path: SP + '/71_blood.png' });
  await page.waitForTimeout(5000);
  console.log('5s later hero', JSON.stringify(Object.fromEntries(Object.entries(await ev(() => window.__game.player.blood || {})).map(([k, v]) => [k, +v.toFixed(2)]))), 'stains', await ev(() => window.__game.stains.n));
  await page.screenshot({ path: SP + '/72_blood_fade.png' });
  console.log('errors', errs.length ? errs : 'none');
  await browser.close();
})();
