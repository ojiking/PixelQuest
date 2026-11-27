// 폐허 뉴욕 거리(도심 바이옴) 화면 확인: 스테이지를 도심으로 바꿔 불러와 스크린샷
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../static/game'), SP = path.join(__dirname, 'out');
fs.mkdirSync(SP, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
(async () => { const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await page.route('http://game.test/**', route => { const rel = new URL(route.request().url()).pathname.replace(/^\/+/, '') || 'index.html'; route.fulfill({ status: 200, contentType: TYPES[path.extname(rel)], body: fs.readFileSync(path.join(ROOT, rel)) }); });
  await page.addInitScript(() => { window.__forceHQ = true; });   // 그래픽카드 없는 환경에서도 고품질(그림자·후처리)로 확인
  await page.goto('http://game.test/index.html'); await page.waitForTimeout(1200);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150); await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
  const t0 = Date.now();
  await page.evaluate(() => { const g = window.__game; g.run.biomes = ['city', 'city']; g.loadStage(0); });
  const build = Date.now() - t0;
  await page.waitForTimeout(2500);
  await page.screenshot({ path: SP + '/nyc_1.png' });
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(3500); await page.keyboard.up('ArrowRight'); await page.waitForTimeout(1500);
  await page.screenshot({ path: SP + '/nyc_2.png' });
  const info = await page.evaluate(() => { const s = window.__game.stage; return { biome: s.biome.name, facades: s.facades?.length, signs: s.signs?.length, decor: s.decor?.length, towers: s.towers?.length, fog: s.fogCards?.length }; });
  console.log(JSON.stringify(info), 'build ms', build, 'errs', errs);
  await browser.close(); })();
