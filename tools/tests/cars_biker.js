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
  await ev(() => { window.__game.run.biomes[1] = 'city'; window.__game.loadStage(1); });
  await page.waitForTimeout(2500);
  if (errs.length) { console.log(errs); return browser.close(); }
  const reset = () => ev(() => { const g = window.__game, p = g.player; g.items.length = 0; g.props.length = 0; g.traps.length = 0; g.lock = null; g.zoneIdx = g.stage.zones.length;
    for (const e of g.enemies) { e.remove = true; e.dead = true; } p.maxHp = p.hp = 9999; p.facing = 1; p.setState('idle'); p.attack = null; p.weapon = null; p.carry = null;
    g.bot.koT = 999; g.bot.setState('ko'); g.bot.x = -4; });

  // 1) 차를 주먹으로 → 폭발 → 잔해, 옆 차 연쇄
  await reset();
  const c1 = await ev(() => { const g = window.__game, p = g.player; const car = g.cars()[0]; window.__car = car; p.x = car.x - 0.7; p.z = car.z + 1; p.y = 0; g.camX = car.x + 2;
    const e = g.spawnEnemy('grunt', 1); e.x = car.x + 2; e.z = car.z + 2.2 > 4.5 ? car.z - 1 : car.z + 2.2; e.cool = 99; window.__e = e; return { model: car.model, hp: car.hp, x: car.x, z: car.z }; });
  console.log('car', JSON.stringify(c1));
  for (let i = 0; i < 12 && await ev(() => window.__car.fuse < 0 && !window.__car.wreck); i++) {
    await ev(() => { const p = window.__game.player; p.setState('idle'); p.attack = null; p.facing = 1; p.startAttack('cross'); });
    await page.waitForTimeout(280);
  }
  console.log(' after punches hp', await ev(() => window.__car.hp), 'fuse', await ev(() => window.__car.fuse.toFixed(2)));
  await ev(() => { window.__game.player.x -= 3; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: SP + '/61_car_fuse.png' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: SP + '/62_car_boom.png' });
  console.log(' wreck', await ev(() => window.__car.wreck), 'model', await ev(() => window.__car.model), 'grunt hp', await ev(() => window.__e.dead ? 'dead' : window.__e.hp), 'solid h', await ev(() => window.__game.stage.solid.get(window.__car.x + ',' + window.__car.z)));
  // 연쇄: 두 차를 붙여 놓고 폭발
  const chain = await ev(() => { const g = window.__game; const cs = g.cars(); if (cs.length < 2) return 'n/a'; const a = cs[0], b = cs[1]; const old = { x: b.x, z: b.z };
    b.x = a.x + 5; b.z = a.z; g.explodeCar(a); return { a: a.wreck, bFuse: b.fuse }; });
  console.log(' chain', JSON.stringify(chain));
  await page.waitForTimeout(1200);

  // 2) 폭주족 돌진
  await reset();
  await ev(() => { const g = window.__game, p = g.player; const cs = new Set(); for (const s of g.stage.solids) if (s.car) s.wreck = true;
    p.x = 40; p.z = 0; g.camX = 42; const b = g.spawnEnemy('biker', 1); b.x = 47; b.z = 1.2; b.cool = 0; window.__b = b; window.__log = { phases: [], hitP: 0 };
    const ah = p.state; });
  let lastPh = null, hits = 0, h0 = await ev(() => window.__game.player.hp);
  for (let i = 0; i < 70; i++) {
    const s = await ev(() => { const b = window.__b, p = window.__game.player; if (p.state === 'down' || p.state === 'hurt') { p.setState('idle'); p.y = 0; } return [b.bikePhase, b.mounted, +b.x.toFixed(1), p.hp]; });
    if (s[0] !== lastPh) { console.log('  phase', s[0], 'x', s[2], 'mounted', s[1]); lastPh = s[0]; }
    if (i === 8) await page.screenshot({ path: SP + '/63_biker.png' });
    await page.waitForTimeout(100);
  }
  console.log(' player hp', h0, '→', await ev(() => window.__game.player.hp));
  // 강하게 맞으면 낙차 → 오토바이 오브젝트
  await ev(() => { const g = window.__game, p = g.player, b = window.__b; b.bikePhase = 'rev'; b.bikeT = -99; b.vx = 0; p.x = b.x - 1; p.z = b.z; p.facing = 1; p.setState('idle'); p.attack = null; p.comboIdx = 2; p.startAttack('kick'); window.__dbg = JSON.stringify({bx: b.x, bz: b.z, px: p.x, pz: p.z, st: b.state, ps: p.state, inv: b.invuln}); });
  console.log(await ev(() => window.__dbg));
  await page.waitForTimeout(500);
  console.log(' after kick mounted', await ev(() => window.__b.mounted), 'motos', await ev(() => window.__game.props.filter(p => p.kind === 'moto').length), 'weapon', await ev(() => window.__b.weapon?.type ?? '-'));
  await page.screenshot({ path: SP + '/64_dismount.png' });

  // 3) 오토바이 줍기 → 던지기 → 폭발
  await ev(() => { const g = window.__game, p = g.player; const m = g.props.find(q => q.kind === 'moto'); window.__b.remove = true; window.__b.dead = true;
    p.x = m.x - 0.4; p.z = m.z; p.setState('idle'); p.attack = null; p.weapon = null; g.interact(p);
    const e = g.spawnEnemy('brute', 1); e.x = p.x + 5; e.z = p.z; e.cool = 99; window.__e = e; window.__eh = e.hp; });
  console.log(' carry', await ev(() => window.__game.player.carry?.kind));
  await page.waitForTimeout(300);
  await page.screenshot({ path: SP + '/65_carry_moto.png' });
  await ev(() => { const g = window.__game, p = g.player; p.facing = 1; g.interact(p); });
  await page.waitForTimeout(250);
  await page.screenshot({ path: SP + '/66_throw_moto.png' });
  await page.waitForTimeout(600);
  console.log(' brute hp', await ev(() => `${window.__eh} → ${window.__e.dead ? 'dead' : window.__e.hp}`), 'projectiles', await ev(() => window.__game.projectiles.length));
  console.log('errors', errs.length ? errs : 'none');
  await browser.close();
})();
