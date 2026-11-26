// 잡기·무릎·던지기 / 예고 / L 라벨
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
  const key = async k => { await page.keyboard.down(k); await page.waitForTimeout(40); await page.keyboard.up(k); };
  const reset = () => ev(() => { const g = window.__game, p = g.player; for (const e of g.enemies) { e.remove = true; e.dead = true; } g.zoneIdx = g.stage.zones.length; g.lock = null;
    g.items.length = 0; g.props.length = 0; g.gibs.list.length = 0; p.maxHp = p.hp = 9999; p.x = 10; p.z = 0.5; p.y = 0; p.facing = 1; p.weapon = null; p.carry = null; p.setState('idle'); p.attack = null; g.camX = 12;
    g.stage.hmap.clear(); g.bot.koT = 999; g.bot.setState('ko'); g.bot.x = -5; });
  await reset();
  // 1) 잡기 → 무릎 3번
  await ev(() => { const g = window.__game; const e = g.spawnEnemy('grunt', 1); e.x = 10.6; e.z = 0.5; e.cool = 99; e.think = 99; window.__e = e; window.__h0 = e.hp; });
  await page.waitForTimeout(100);
  console.log('hint:', await ev(() => document.getElementById('lhint')?.textContent));
  await key('KeyL'); await page.waitForTimeout(150);
  console.log('1 grab: player', await ev(() => window.__game.player.state), 'enemy grabbed', await ev(() => !!window.__e.grabbedBy));
  await page.screenshot({ path: SP + '/75_grab.png' });
  for (let i = 0; i < 3; i++) { await key('KeyJ'); await page.waitForTimeout(330); console.log('   knee', i, await ev(() => { const p = window.__game.player; return JSON.stringify({ k: p.knees, st: p.state, hp: window.__e.hp, gt: p.grabT.toFixed(2), grab: !!p.grabbing }); })); if (i === 1) await page.screenshot({ path: SP + '/76_knee.png' }); }
  console.log('  after 3 knees hp', await ev(() => `${window.__h0} → ${window.__e.hp} state ${window.__e.state} grabbed ${!!window.__e.grabbedBy}`));
  // 2) 잡아서 던지기 → 다른 적과 충돌
  await reset();
  await ev(() => { const g = window.__game; const e = g.spawnEnemy('grunt', 1); e.x = 10.6; e.z = 0.5; e.cool = 99; e.think = 99; window.__e = e;
    const o = g.spawnEnemy('thrower', 1); o.x = 13.5; o.z = 0.5; o.cool = 99; o.think = 99; window.__o = o; window.__oh = o.hp; });
  await page.waitForTimeout(80);
  await key('KeyL'); await page.waitForTimeout(150); await key('KeyL'); await page.waitForTimeout(250);
  await page.screenshot({ path: SP + '/77_throw.png' });
  await page.waitForTimeout(600);
  console.log('2 throw: thrown state', await ev(() => window.__e.state), 'x', await ev(() => window.__e.x.toFixed(1)), 'other hp', await ev(() => `${window.__oh} → ${window.__o.hp} ${window.__o.state}`));
  // 3) 뒤로 던지기
  await reset();
  await ev(() => { const g = window.__game; const e = g.spawnEnemy('grunt', 1); e.x = 10.6; e.z = 0.5; e.cool = 99; e.think = 99; window.__e = e; });
  await page.waitForTimeout(80);
  await key('KeyL'); await page.waitForTimeout(150);
  await page.keyboard.down('KeyA'); await key('KeyL'); await page.keyboard.up('KeyA'); await page.waitForTimeout(700);
  console.log('3 back throw: enemy x', await ev(() => window.__e.x.toFixed(1)), '(player 10)');
  // 4) 덩치는 금방 뿌리침
  await reset();
  await ev(() => { const g = window.__game; const e = g.spawnEnemy('brute', 1); e.x = 10.7; e.z = 0.5; e.cool = 99; e.think = 99; window.__e = e; });
  await page.waitForTimeout(80); await key('KeyL'); for (let i = 0; i < 6; i++) { await page.waitForTimeout(220); console.log('   brute', await ev(() => { const p = window.__game.player, e = window.__e; return JSON.stringify({ ps: p.state, pg: !!p.grabbing, eg: !!e.grabbedBy, es: e.state, gt: (p.grabT || 0).toFixed(2), esc: e.grabEscape }); })); }
  console.log('4 brute after 1.3s grabbed', await ev(() => !!window.__e.grabbedBy), 'player', await ev(() => window.__game.player.state));
  // 5) 방패병 정면은 막힘, 보스 불가
  await reset();
  await ev(() => { const g = window.__game; const e = g.spawnEnemy('shield', 1); e.x = 10.6; e.z = 0.5; e.facing = -1; e.cool = 99; e.think = 99; window.__e = e; });
  await page.waitForTimeout(80);
  console.log('5 shield hint:', await ev(() => document.getElementById('lhint')?.textContent)); await key('KeyL'); await page.waitForTimeout(100);
  console.log('  grabbed?', await ev(() => !!window.__e.grabbedBy));
  // 6) 우선순위: 무기와 적이 같이 있으면 무기
  await reset();
  await ev(() => { const g = window.__game; const e = g.spawnEnemy('grunt', 1); e.x = 10.6; e.z = 0.5; e.cool = 99; e.think = 99; g.dropWeapon ? null : null; const it = new (g.items.constructor)(); });
  await ev(() => { const g = window.__game, p = g.player; p.weapon = { type: 'bat', dur: 5 }; g.dropWeapon(p); });
  await page.waitForTimeout(700);
  console.log('6 priority hint:', await ev(() => document.getElementById('lhint')?.textContent));
  // 7) 예고 '!'
  await reset();
  await ev(() => { const g = window.__game; const e = g.spawnEnemy('brute', 1); e.x = 11.2; e.z = 0.5; e.doAttack('eSlam'); });
  await page.waitForTimeout(250);
  console.log('7 warn marks', await ev(() => [...document.querySelectorAll('.ftext.warn')].length));
  await page.screenshot({ path: SP + '/78_warn.png' });
  console.log('errors', errs.length ? errs : 'none');
  await browser.close();
})();
