// 진행 막힘 재현 테스트: (A) 블록 위 무기 (B) 벽 뒤에 갇힌 적 (C) 죽는 중 상태로 공중에 남은 적
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
    route.fulfill({ status: 200, contentType: TYPES[path.extname(rel)], body: fs.readFileSync(path.join(ROOT, rel)) });
  });
  await page.goto('http://game.test/index.html');
  await page.waitForTimeout(1200);
  if (errs.length) { console.log(errs); return browser.close(); }
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  const ev = (f, a) => page.evaluate(f, a);
  // 게임 시간 기준 대기: 그래픽카드 없는 느린 환경에서도 실제 시간 대신 게임 안의 시간이 ms만큼 흐를 때까지 기다림
  // (메뉴처럼 게임 시간이 멈춘 화면이면 실제 시간 ms×6까지만 기다림)
  const wait = async ms => {
    const t0 = await page.evaluate(() => window.__game?.time ?? 0), w0 = Date.now();
    while (Date.now() - w0 < ms * 6) {
      await page.waitForTimeout(Math.min(100, ms));
      const t = await page.evaluate(() => window.__game?.time ?? 0);
      if (t - t0 >= ms / 1000 || (t === t0 && Date.now() - w0 >= ms)) break;
    }
  };
  const setup = () => ev(() => {
    const g = window.__game, p = g.player, st = g.stage;
    st.hmap.clear(); g.items.length = 0; g.props.length = 0; g.traps.length = 0;
    for (const e of g.enemies) { e.remove = true; e.dead = true; }
    p.maxHp = p.hp = 99999; p.x = 10; p.z = 0; p.setState('idle'); g.bot.koT = 999; g.bot.setState('ko'); g.bot.x = 6;
    g.camX = 12;
    // 전투 구역 잠금 (웨이브 1개, 이미 다 나온 상태)
    g.lock = { cx: 12, zone: { waves: [['grunt']], trigger: 10 }, wave: 0, queue: [], spawnT: 0, nextT: 0.4 };
  });

  // (A) 높이 1 블록 위에 무기, 깡패가 주우러 감
  await setup();
  await ev(() => {
    const g = window.__game, st = g.stage;
    for (let x = 14; x < 16; x++) for (let z = -1; z <= 0; z++) st.hmap.set(x + ',' + z, 1);
    g.dropWeapon({ weapon: { type: 'pipe', dur: 9 }, x: 14.8, z: -0.5, facing: 1 });
    const e = g.spawnEnemy('grunt', 1); e.weapon = null; e.x = 17; e.z = -0.5; window.__a = e;
  });
  await wait(5500);
  console.log('A weapon on block: enemy goItem', await ev(() => window.__a.goItem ? 'still going' : 'gave up/none'), 'state', await ev(() => window.__a.state), 'dist to player', await ev(() => Math.abs(window.__a.x - window.__game.player.x).toFixed(1)));

  // (B) 벽(높이 2)이 길을 완전히 막고 그 뒤에 적
  await setup();
  await ev(() => {
    const g = window.__game, st = g.stage;
    for (let z = -5; z <= 7; z++) st.hmap.set('21,' + z, 2);
    const e = g.spawnEnemy('grunt', 1); e.x = 23; e.z = 0; window.__b = e;
  });
  await wait(5000);
  console.log('B trapped behind wall: enemy x', await ev(() => window.__b.x.toFixed(1)), '(screen right edge', await ev(() => (window.__game.lock.cx + window.__game.viewHalf).toFixed(1)) + ')');

  // (C) 죽는 중인데 착지하지 못한 적
  await setup();
  await ev(() => { const g = window.__game; const e = g.spawnEnemy('grunt', 1); e.x = 13; e.z = 0; g.kill(e, { dir: 1, knock: 3 }); e.vy = 0; e.y = 3; e.grounded = false; e.update = function (dt) { this.st += dt; this.updateCommon(dt); }; window.__c = e; });
  await wait(3200);
  console.log('C stuck dying removed:', await ev(() => window.__c.remove));

  // 잠금 해제까지
  await ev(() => { const g = window.__game; for (const e of g.enemies) if (!e.dead) g.kill(e, { dir: 1, knock: 3 }); });
  await wait(2500);
  console.log('lock released:', await ev(() => !window.__game.lock));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await browser.close();
})();
