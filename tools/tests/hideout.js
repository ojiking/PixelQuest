// 아지트 화면 확인: 쓰러진 뒤 / 보스 잡은 뒤, 창 열기
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../static/game');
const SP = path.join(__dirname, 'out'); require('fs').mkdirSync(SP, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message + '\n' + e.stack));
  await page.route('http://game.test/**', route => { const rel = new URL(route.request().url()).pathname.replace(/^\/+/, '') || 'index.html'; route.fulfill({ status: 200, contentType: TYPES[path.extname(rel)], body: fs.readFileSync(path.join(ROOT, rel)) }); });
  await page.addInitScript(() => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', 1); localStorage.setItem('pixelquest_meta_v1', JSON.stringify({ scrap: 300, up: {}, runs: 2, wins: 1, botClass: 'attack', seen: ['grunt', 'thrower', 'charger', 'bomber', 'shield'], stats: { boss_boss: 1, severs: 160 }, trophies: { rookie: true, demo: true, butcher: true }, equip: ['demo'], title: 'butcher' })); } });
  await page.goto('http://game.test/index.html'); await page.waitForTimeout(1200);
  const ev = (f, a) => page.evaluate(f, a);
  await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  console.log('run title HUD:', await ev(() => document.getElementById('ptitle').textContent), 'maxHp', await ev(() => window.__game.player.maxHp));
  // 쓰러짐 → 결과 → 아지트
  await ev(() => { const g = window.__game; g.running = false; g.hooks.onRunEnd(); });
  await page.waitForTimeout(300);
  console.log('result:', await ev(() => document.querySelector('.panel h1')?.textContent));
  await page.keyboard.press('Enter'); await page.waitForTimeout(900);
  console.log('hub buttons:', await ev(() => [...document.querySelectorAll('#hubui button')].map(b => b.textContent.trim()).join(' | ')));
  await page.screenshot({ path: SP + '/81_hideout.png' });
  for (const k of ['hero', 'bot', 'diff', 'trophy']) {
    await ev(k => document.querySelector(`[data-open="${k}"]`).click(), k); await page.waitForTimeout(300);
    console.log(' panel', k, ':', await ev(() => document.querySelector('.panel h1')?.textContent), '| cards', await ev(() => document.querySelectorAll('.ucard').length));
    if (k === 'trophy') await page.screenshot({ path: SP + '/82_trophy.png' });
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  }
  // 새 게임 → 보스 잡은 척 → 챕터 클리어 → 아지트 → 다음 스테이지
  await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  await ev(() => { const g = window.__game; g.run.stage = 1; g.running = false; g.run.scrap = 40; g.hooks.onStageClear(true); });
  await page.waitForTimeout(300);
  console.log('chapter result:', await ev(() => document.querySelector('.panel h1')?.textContent));
  await page.keyboard.press('Enter'); await page.waitForTimeout(700);
  console.log('hub go button:', await ev(() => document.querySelector('.hgo')?.textContent.trim()), 'info', await ev(() => document.querySelector('.hcont')?.textContent));
  await page.screenshot({ path: SP + '/83_hideout_next.png' });
  await page.keyboard.press('Enter'); await page.waitForTimeout(900);
  console.log('next run:', await ev(() => { const g = window.__game; return JSON.stringify({ mode: g.running, chapter: g.run.chapter, stage: g.run.stage, info: document.getElementById('stage-info').textContent }); }));
  console.log('errors', errs.length ? errs : 'none');
  await browser.close();
})();
