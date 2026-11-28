// 오래 걸리는 보스전: 25초가 지나도 싸우는 중이면 보스가 사라지지 않아야 함 (예전엔 적 수가 25초간 안 바뀌면 지워짐)
// + 진짜로 아무도 싸우지 않는 남은 적은 25초 뒤 여전히 정리 (진행 막힘 방지 유지)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../static/game');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('http://game.test/**', route => { const rel = new URL(route.request().url()).pathname.replace(/^\/+/, '') || 'index.html'; route.fulfill({ status: 200, contentType: TYPES[path.extname(rel)], body: fs.readFileSync(path.join(ROOT, rel)) }); });
  await page.goto('http://game.test/index.html'); await page.waitForTimeout(1500);
  await page.keyboard.press('Enter'); await page.waitForTimeout(300); await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
  const ev = (f, a) => page.evaluate(f, a), fails = [];
  const runGame = async sec => { const t0 = await ev(() => window.__game.time); for (let i = 0; i < 2000; i++) { await page.waitForTimeout(100); if ((await ev(() => window.__game.time)) - t0 >= sec) break; } };
  // 전투 구역을 하나 잠그고 보스 혼자 남은 상황을 만듦 (적이 공격하지 않게, 뱀돌이는 안 죽게)
  await ev(() => { const g = window.__game, p = g.player; g.stage.hmap.clear(); g.items.length = 0; g.props.length = 0; g.traps.length = 0;
    for (const e of g.enemies) { e.remove = true; e.dead = true; }
    p.hp = p.maxHp = 99999; if (g.bot) { g.bot.koT = 9999; g.bot.setState('ko'); }
    g.lock = { cx: p.x + 2, zone: { trigger: p.x, waves: [['boss']] }, wave: 0, queue: [], spawnT: 0, nextT: 99 };
    const b = g.spawnEnemy('boss', 1); b.x = p.x + 3; b.z = p.z; window.__b = b;
    // 3초마다 보스를 조금씩 때림 (실제 보스전처럼 오래 싸우는 중)
    window.__hitter = setInterval(() => { const b = window.__b; if (!b.dead) { b.hp -= 1; g.onDamage(b, 1, { attacker: p }, false); b.cool = 9; } }, 50);
  });
  await runGame(32);
  const boss = await ev(() => ({ removed: window.__b.remove, dead: window.__b.dead, hp: window.__b.hp, max: window.__b.maxHp, idleT: +(window.__game.lock?.idleT ?? -1).toFixed(1) }));
  console.log('boss after 32s of fighting:', JSON.stringify(boss));
  if (boss.removed || boss.dead) fails.push('boss removed during fight');
  // 아무도 안 싸우는 남은 졸개 → 25초 뒤 정리 (보스는 남김)
  await ev(() => { clearInterval(window.__hitter); const g = window.__game, p = g.player; for (const o of g.enemies) { o.remove = true; o.dead = true; }   // 보스가 불러낸 지원 졸개까지 모두 정리
    const e = g.spawnEnemy('grunt', 1); e.x = p.x + 4; e.cool = 999; e.update = function (dt) { this.updateCommon?.(dt); }; window.__e = e; g.lock.idleT = 0; });
  await runGame(27);
  const grunt = await ev(() => ({ removed: window.__e.remove, lock: !!window.__game.lock, idleT: window.__game.lock?.idleT, alive: window.__game.enemies.filter(e => !e.remove).length, running: window.__game.running }));
  console.log('idle leftover grunt after 27s:', JSON.stringify(grunt));
  if (!grunt.removed) fails.push('idle enemy not cleared');
  if (errs.length) fails.push('errors ' + errs.join(' | '));
  console.log('checks:', fails.length ? 'FAIL ' + fails.join(', ') : 'all ok');
  await browser.close();
})();
