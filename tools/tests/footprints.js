// 피 발자국: 무기방에서 발밑 피 웅덩이(5) → 걸어가면 점점 옅어지는 발자국이 찍히고 몇 걸음 뒤 끊김
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../static/game');
const SP = path.join(__dirname, 'out'); fs.mkdirSync(SP, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message + '\n' + e.stack));
  await page.route('http://game.test/**', route => { const rel = new URL(route.request().url()).pathname.replace(/^\/+/, '') || 'index.html'; route.fulfill({ status: 200, contentType: TYPES[path.extname(rel)], body: fs.readFileSync(path.join(ROOT, rel)) }); });
  await page.goto('http://game.test/index.html'); await page.waitForTimeout(1200);
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => document.querySelector('[data-act="lab"]').click()); await page.waitForTimeout(1500);
  await page.keyboard.press('Digit2'); await page.keyboard.press('Digit2');   // 적 0명
  await ev(() => { const p = window.__game.player; p.x = 6; p.z = 1.2; });
  await page.waitForTimeout(400);
  // 바닥에 칠해진 양(합계)을 재는 함수
  const total = () => ev(() => { let s = 0; for (const v of window.__game.stains.data) s += v; return s; });
  const t0 = await total();
  await page.keyboard.press('Digit5'); await page.waitForTimeout(200);
  const t1 = await total();
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(1500); await page.keyboard.up('ArrowRight'); await page.waitForTimeout(300); await page.screenshot({ path: SP + '/footprints_trail.png' }); await page.keyboard.down('ArrowRight'); await page.waitForTimeout(1100); await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(300);
  const t2 = await total();
  const p = await ev(() => { const p = window.__game.player; return { x: +p.x.toFixed(1), steps: p.bloodySteps }; });
  console.log('stain total: before', t0, '| puddle', t1, '| after walk', t2, '| player', JSON.stringify(p));
  // 경로를 따라 발자국이 찍힌 x 위치
  const prints = await ev(() => { const g = window.__game, st = g.stains, out = []; for (let x = 7.2; x < 20; x += 0.1) { const v = Math.max(st.sample(x, g.floorAt(x, 1.1), 1.1), st.sample(x, g.floorAt(x, 1.3), 1.3)); if (v > 0) out.push(x.toFixed(1) + ':' + v); } return out.join(' '); });
  console.log('prints along path:', prints);
  await page.screenshot({ path: SP + '/footprints.png' });
  // 걸어 돌아와도(자기 발자국 위) 무한히 이어지지 않는지
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(3000); await page.keyboard.up('ArrowRight');
  console.log('far away steps left:', await ev(() => window.__game.player.bloodySteps));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await browser.close();
})();
