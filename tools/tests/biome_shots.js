// 바이옴 4종 배경 확인: 각 바이옴을 불러와 구간 종류(벽·잔해·바리케이드·틈·절벽)마다 카메라를 옮겨 스크린샷
// 사용: NODE_PATH=$(npm root -g) node biome_shots.js   (BIOMES=plains,snow 로 일부만)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../static/game'), SP = path.join(__dirname, 'out');
fs.mkdirSync(SP, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const BIOMES = (process.env.BIOMES || 'city,plains,desert,snow').split(',');
const WANT = (process.env.WANT || 'walls,platforms,barrier,gaps,cliffFront,cliffBack,bridge').split(',');
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await page.route('http://game.test/**', route => { const rel = new URL(route.request().url()).pathname.replace(/^\/+/, '') || 'index.html'; route.fulfill({ status: 200, contentType: TYPES[path.extname(rel)], body: fs.readFileSync(path.join(ROOT, rel)) }); });
  if (process.env.HQ !== '0') await page.addInitScript(() => { window.__forceHQ = true; });   // 고품질 렌더 (느림)
  await page.goto('http://game.test/index.html'); await page.waitForTimeout(1200);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150); await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
  const ev = (f, a) => page.evaluate(f, a);
  await page.addStyleTag({ content: '#banner{display:none!important}' });
  await ev(() => { const g = window.__game, f = g.fallOut.bind(g); g.fallOut = a => a === g.player ? (a.y = 0, a.vy = 0) : f(a); });   // 촬영 중 추락 사망 방지
  // 카메라를 x로 옮기고 적·볼트를 치움
  const goto = async x => { await ev(x => { const g = window.__game, p = g.player, st = g.stage;
    for (const e of g.enemies) { e.remove = true; e.dead = true; } g.zoneIdx = st.zones.length; g.lock = null;
    p.maxHp = p.hp = 99999; const s = st.safeSpot(x, 1); p.x = s.x; p.z = s.z; p.vx = p.vz = 0; g.camX = x; g.camMax = x;
    g.bot.x = s.x - 1.5; g.bot.z = s.z - 1; }, x); await page.waitForTimeout(450); await ev(x => { window.__game.camX = x; }, x); await page.waitForTimeout(120); };
  for (const biome of BIOMES) {
    const done = new Set();
    for (let attempt = 0; attempt < 7 && done.size < WANT.length; attempt++) {
      const ms = await ev(([b, i]) => { const g = window.__game; g.run.biomes = [b, b]; const t = performance.now(); g.loadStage(i); return Math.round(performance.now() - t); }, [biome, attempt % 2]).catch(e => 'ERR ' + e.message);
      const segs = await ev(() => window.__game.stage.segments.map(s => [s.type, s.a, s.b])); const bm = await ev(() => JSON.stringify(window.__game.stage.buildMs));
      console.log(biome, 'build ms', ms, bm, segs.map(s => s[0]).join(' '));
      if (attempt === 0) { await page.waitForTimeout(800); await goto(9); await page.screenshot({ path: `${SP}/biome_${biome}_start.png` }); if (!process.env.NOMID) { await goto(52); await page.screenshot({ path: `${SP}/biome_${biome}_mid.png` }); } }
      for (const [type, a, b] of segs) {
        if (!WANT.includes(type) || done.has(type)) continue;
        done.add(type);
        await goto((a + b) / 2);
        await page.screenshot({ path: `${SP}/biome_${biome}_${type}.png` });
      }
    }
    console.log(biome, 'shots', [...done].join(','));
  }
  console.log('errors', errs.length ? errs : 'none');
  await browser.close(); })();
