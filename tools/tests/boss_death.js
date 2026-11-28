// 머리 즉사 규칙(체력 40% 이하일 때만) + 보스 처치 슬로우 모션·산산조각 (무기방 0번 = 보스 소환)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../static/game'), SP = path.join(__dirname, 'out');
fs.mkdirSync(SP, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('http://game.test/**', route => { const rel = new URL(route.request().url()).pathname.replace(/^\/+/, '') || 'index.html'; route.fulfill({ status: 200, contentType: TYPES[path.extname(rel)], body: fs.readFileSync(path.join(ROOT, rel)) }); });
  if (process.env.HQ) await page.addInitScript(() => { window.__forceHQ = true; });
  await page.goto('http://game.test/index.html'); await page.waitForTimeout(1500);
  const ev = (f, a) => page.evaluate(f, a), fails = [];
  await ev(() => document.querySelector('[data-act="lab"]').click()); await page.waitForTimeout(1500);
  await ev(() => { const g = window.__game; g.lab.count = 0; for (const e of g.enemies) { e.remove = true; e.dead = true; } if (g.bot) { g.bot.koT = 999; g.bot.setState('ko'); } });
  // 1) 머리 즉사 규칙: 체력이 가득일 때 머리를 부숴도 버팀, 40% 이하면 목이 날아가며 죽음
  const head = await ev(() => { const g = window.__game, p = g.player, out = {};
    const a = g.spawnEnemy('grunt', 1); a.x = p.x + 3; a.cool = 99; a.parts.head.hp = 0; g.severPart(a, 'head', 1, { mode: 'cut' });
    out.full = { dead: a.dead, headAlive: a.parts.head.alive, hp: a.hp };
    const b = g.spawnEnemy('grunt', 1); b.x = p.x + 4; b.cool = 99; b.hp = b.maxHp * 0.35; g.severPart(b, 'head', 1, { mode: 'cut' });
    out.low = { dead: b.dead, headAlive: b.parts.head.alive };
    a.remove = b.remove = true; a.dead = b.dead = true; return out; });
  console.log('head rule: full hp →', JSON.stringify(head.full), '| 35% hp →', JSON.stringify(head.low));
  if (head.full.dead || !head.full.headAlive) fails.push('head killed at full hp');
  if (!head.low.dead || head.low.headAlive) fails.push('head not severed at low hp');
  // 2) 보스 처치: 무기방 0번으로 소환 → 처치 → 슬로우 모션 + 산산조각
  for (const type of ['boss', 'cyborg']) {
    await page.keyboard.press('Digit0'); await page.waitForTimeout(800);
    const r = await ev(type => { const g = window.__game, p = g.player, b = g.enemies.find(e => e.type === type && !e.dead);
      if (!b) return { found: false };
      b.x = p.x + 3; b.z = p.z; g.camX = p.x + 2; const t0 = g.time, g0 = g.gibs.list.length;
      g.kill(b, { dir: 1, knock: 3, attacker: p, mode: 'knock' });
      return { found: true, slowT: +g.slowT.toFixed(2), slowK: g.slowK, blasted: b.remove, gibs: g.gibs.list.length - g0, t0 }; }, type);
    // 실제 시간 1초 동안 게임 시간이 얼마나 흐르는지 (슬로우면 훨씬 적게)
    await page.waitForTimeout(150);
    const ta = await ev(() => window.__game.time), wa = Date.now();
    if (process.env.HQ) await page.screenshot({ path: `${SP}/boss_death_${type}.png` });
    await page.waitForTimeout(1000);
    const tb = await ev(() => window.__game.time), ratio = (tb - ta) / ((Date.now() - wa) / 1000);
    console.log(type, JSON.stringify(r), 'game-time speed during slowmo ≈', ratio.toFixed(2));
    if (!r.found || !(r.slowT > 0) || !r.blasted || r.gibs < 5) fails.push(type + ': no slowmo/shatter');
    await page.waitForTimeout(3500);
  }
  if (errs.length) fails.push('errors ' + errs.join(' | '));
  console.log('checks:', fails.length ? 'FAIL ' + fails.join(', ') : 'all ok');
  await browser.close();
})();
