// 낭떠러지 로직 검증: 플레이어 추락사, 점프로 건너기, 볼트/적의 틈 점프, 적 넉백 추락
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
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
  // 틈(10~12) 만들고 주변은 평지로
  const setup = () => ev(() => {
    const g = window.__game, st = g.stage;
    st.hmap.clear();
    for (let x = 10; x < 12; x++) for (let z = -5; z <= 7; z++) st.hmap.set(x + ',' + z, -100);
    g.items.length = 0; g.props.length = 0; g.traps.length = 0;
    for (const e of g.enemies) { e.remove = true; e.dead = true; }
  });
  await setup();

  // 1) 걸어가다 추락 (구조 프로토콜 없음)
  await ev(() => { const g = window.__game; g.player.x = 8; g.player.z = 0; g.bot.x = 6; g.input.down = new Set(['KeyD']); });
  await page.waitForTimeout(1600);
  console.log('1 walk into pit:', await ev(() => { const g = window.__game, p = g.player; return `y=${p.y.toFixed(1)} state=${p.state} hidden=${p.hidden} endTimer=${g.endTimer.toFixed(2)}`; }));
  await page.waitForTimeout(1800);
  console.log('  result screen:', await ev(() => document.querySelector('#screen h1')?.textContent));

  // 2) 새 런: 점프로 건너기
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  await setup();
  await ev(() => { const g = window.__game; g.player.x = 9.2; g.player.z = 0; g.bot.x = 6.5; g.bot.z = 0; g.input.down = new Set(['KeyD']); g.input.just.add('KeyK'); });
  await page.waitForTimeout(700);
  await ev(() => { window.__game.input.down = new Set(); });
  await page.waitForTimeout(300);
  console.log('2 jump across:', await ev(() => { const p = window.__game.player; return `x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} state=${p.state}`; }));

  // 3) 볼트가 틈을 점프해서 따라옴
  await ev(() => { const g = window.__game; g.player.x = 15; });
  await page.waitForTimeout(2500);
  console.log('3 bot follows:', await ev(() => { const b = window.__game.bot; return `x=${b.x.toFixed(2)} y=${b.y.toFixed(2)} state=${b.state} hp=${b.hp}`; }));

  // 4) 적이 건너편 플레이어에게 점프해서 옴
  await ev(() => { const g = window.__game; g.player.x = 8; g.bot.x = 6; g.bot.koT = 999; g.bot.setState('ko'); const e = g.spawnEnemy('grunt', 1); e.x = 14; e.z = 0; window.__e = e; });
  await page.waitForTimeout(3000);
  console.log('4 enemy crosses:', await ev(() => { const e = window.__e; return `x=${e.x.toFixed(2)} y=${e.y.toFixed(2)} state=${e.state} removed=${e.remove}`; }));

  // 5) 넉백으로 적을 낭떠러지에 밀어넣기
  await ev(() => { const g = window.__game; const e = g.spawnEnemy('grunt', 1); e.x = 9.4; e.z = 0; e.cool = 99; window.__k0 = g.run.kills; window.__e2 = e; e.setState('down'); e.downT = 0; e.vx = 5; e.vy = 3; e.grounded = false; });
  await page.waitForTimeout(1500);
  console.log('5 knocked into pit:', await ev(() => { const g = window.__game, e = window.__e2; return `removed=${e.remove} kills+${g.run.kills - window.__k0}`; }));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await browser.close();
})();
