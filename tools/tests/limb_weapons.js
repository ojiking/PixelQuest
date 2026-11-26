// 신체 부위 무기 검증: 팔/다리/머리를 들고 휘두르기, 내구도, 박살
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
  await page.goto('http://game.test/index.html');
  await page.waitForTimeout(1200);
  if (errs.length) { console.log(errs); return browser.close(); }
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => { const g = window.__game; g.stage.hmap.clear(); g.items.length = 0; g.props.length = 0; g.traps.length = 0; g.player.maxHp = g.player.hp = 9999; g.bot.koT = 999; g.bot.setState('ko'); g.bot.x = -3; });
  // 적 처치 → 조각들
  await ev(() => { const g = window.__game; const e = g.spawnEnemy('grunt', 1); e.x = 8; e.z = 0; g.kill(e, { dir: 1, knock: 2 }); });
  await page.waitForTimeout(2500);
  for (const want of ['leg', 'arm', 'head']) {
    const r = await ev(want => {
      const g = window.__game, p = g.player;
      const re = { leg: /^(leg|shin)/, arm: /^(arm|hand)/, head: /^head$/ }[want];
      const gib = g.gibs.list.find(x => x.rest && re.test(x.part));
      if (!gib) return 'none';
      p.weapon = null; p.carry = null; p.setState('idle');
      p.x = gib.pos[0]; p.z = gib.pos[2];
      g.input.just.add('KeyL');
      return gib.part;
    }, want);
    await page.waitForTimeout(150);
    const info = await ev(() => { const c = window.__game.player.carry; return c ? `${c.part} limb=${c.limb} dur=${c.dur}` : 'nothing'; });
    console.log(want, 'picked', r, '→', info);
    if (r === 'none') continue;
    // 앞에 적 배치 후 휘두르기
    await ev(() => { const g = window.__game, p = g.player; p.facing = 1; const t = g.spawnEnemy('brute', 1); t.x = p.x + 1.2; t.z = p.z; t.cool = 99; window.__t = t; window.__th = t.hp; });
    let shot = false;
    for (let i = 0; i < 14; i++) {
      await ev(() => { const g = window.__game, p = g.player, t = window.__t; if (!t.dead) { p.z = t.z; p.x = Math.min(p.x, t.x - 1.0); } p.facing = 1; g.input.just.add('KeyJ'); });
      await page.waitForTimeout(120);
      if (!shot && want === 'leg') { const ph = await ev(() => window.__game.player.attackPhase()); if (ph === 'active') { await page.screenshot({ path: SP + '/42_limb_swing.png' }); shot = true; } }
    }
    console.log('   target hp', await ev(() => `${window.__th}→${window.__t.hp}`), 'carry now:', await ev(() => { const c = window.__game.player.carry; return c ? `${c.part} dur=${c.dur}` : 'broken/none'; }));
    await ev(() => { const t = window.__t; t.remove = true; t.dead = true; });
    await page.waitForTimeout(300);
  }
  console.log('ERRORS:', errs.length ? errs : 'none');
  await browser.close();
})();
