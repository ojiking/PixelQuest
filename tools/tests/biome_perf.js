// 바이옴별 스테이지 생성 시간·삼각형 수·프레임 시간 (빠른 모드)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../static/game');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('http://game.test/**', route => { const rel = new URL(route.request().url()).pathname.replace(/^\/+/, '') || 'index.html'; route.fulfill({ status: 200, contentType: TYPES[path.extname(rel)], body: fs.readFileSync(path.join(ROOT, rel)) }); });
  await page.goto('http://game.test/index.html'); await page.waitForTimeout(1200);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150); await page.keyboard.press('Enter'); await page.waitForTimeout(1000);
  for (const b of (process.env.BIOMES || 'city,plains,desert,snow').split(',')) {
    const info = await page.evaluate(b => { const g = window.__game; g.run.biomes = [b, b]; const t = performance.now(); g.loadStage(0); const ms = Math.round(performance.now() - t);
      const st = g.stage, tri = l => Math.round((l ?? []).reduce((a, c) => a + c.mesh.count / 3, 0) / 1000) + 'k';
      for (const e of g.enemies) { e.remove = true; e.dead = true; } g.zoneIdx = st.zones.length;
      return { ms, parts: st.buildMs, terrain: Math.round(st.terrain.count / 3000) + 'k', obstacles: tri(st.obstacles), edges: tri(st.pitEdges), near: tri(st.envNear), far: tri(st.envFar), ground: tri(st.envGround) }; }, b);
    await page.waitForTimeout(500);
    const fr = await page.evaluate(() => new Promise(res => { const g = window.__game; let f = 0, t0 = performance.now(); const step = () => { if (++f < 30) requestAnimationFrame(step); else res(+((performance.now() - t0) / 30).toFixed(1)); }; requestAnimationFrame(step); }));
    console.log(b, JSON.stringify(info), 'frame ms', fr);
  }
  console.log('errors', errs.length ? errs : 'none');
  await browser.close(); })();
