// 휴대폰(가로)에서 무기방 옵션 패널: 접힌 상태 → 펼침 → 옵션 누르기 → 접기, 조이스틱·공격 버튼과 겹치지 않는지
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../static/game'), SP = path.join(__dirname, 'out');
fs.mkdirSync(SP, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 915, height: 412 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('http://game.test/**', route => { const rel = new URL(route.request().url()).pathname.replace(/^\/+/, '') || 'index.html'; route.fulfill({ status: 200, contentType: TYPES[path.extname(rel)], body: fs.readFileSync(path.join(ROOT, rel)) }); });
  await page.goto('http://game.test/index.html'); await page.waitForTimeout(1500);
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => document.querySelector('[data-act="lab"]').click()); await page.waitForTimeout(1500);
  const rect = sel => ev(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; }, sel);
  const overlap = (a, b) => a && b && a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  console.log('collapsed panel', await rect('#labui'), 'text:', await ev(() => document.getElementById('labui').textContent.trim()));
  await page.screenshot({ path: SP + '/lab_mobile_closed.png' });
  await page.tap('[data-lab="toggle"]'); await page.waitForTimeout(400);
  const open = await rect('#labui'), btns = await rect('#tbtns'), pad = await rect('#stick') ?? await rect('#joy');
  console.log('open panel', open, 'buttons', btns, 'overlap buttons:', overlap(open, btns), 'options:', await ev(() => document.querySelectorAll('#labui [data-lab]').length));
  await page.screenshot({ path: SP + '/lab_mobile_open.png' });
  await page.tap('[data-lab="attack"]'); await page.waitForTimeout(300);
  console.log('after tapping attack: still open', await ev(() => document.getElementById('labui').classList.contains('open')), 'attack', await ev(() => window.__game.lab.attack));
  await page.tap('[data-lab="toggle"]'); await page.waitForTimeout(300);
  console.log('closed again', !(await ev(() => document.getElementById('labui').classList.contains('open'))));
  console.log('errors', errs.length ? errs : 'none');
  await browser.close();
})();
