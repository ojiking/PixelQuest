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
  // 예전 저장: 체력 12레벨, 근력 9레벨, 2회 클리어
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', 1); localStorage.setItem('pixelquest_meta_v1', JSON.stringify({ scrap: 10, up: { p_hp: 12, p_pow: 9 }, runs: 5, wins: 2, bestStage: 2, botClass: 'attack' })); } });
  await page.goto('http://game.test/index.html'); await page.waitForTimeout(1200);
  const ev = (f, a) => page.evaluate(f, a);
  const m0 = await ev(() => JSON.parse(localStorage.getItem('pixelquest_meta_v1')));
  // 런 하나 시작 → 구성 확인
  await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  console.log('fresh run:', await ev(() => { const g = window.__game; return JSON.stringify({ biomes: g.run.biomes, boss: g.run.boss, heat: g.heat, pool: g.stats.unlocked.weapons }); }));
  const rolls = await ev(async () => { const m = await import('./js/game.js'); const s = new Set(); for (let i = 0; i < 300; i++) s.add(m.rollWeapon()); return [...s].sort(); });
  console.log('rolled weapons:', rolls.join(','));
  // 정비소로
  await ev(() => { window.__game.running = false; });
  await page.evaluate(() => document.querySelector('[data-act]') ? null : null);
  await ev(async () => { const btn = document.createElement('button'); btn.dataset.act = 'hub'; document.getElementById('screen')?.appendChild(btn); btn.click(); });
  await page.waitForTimeout(400);
  const metaNow = await ev(() => JSON.parse(localStorage.getItem('pixelquest_meta_v1') || '{}'));
  console.log('hub visible:', await ev(() => !!document.querySelector('.panel.hub')), 'heat row:', await ev(() => document.querySelector('.heat')?.textContent.replace(/\s+/g, ' ').trim()));
  console.log('groups:', await ev(() => [...document.querySelectorAll('.ugroup h3')].map(h => h.textContent.trim()).join(' | ')));
  console.log('bank text:', await ev(() => document.querySelector('.bank')?.textContent.replace(/\s+/g, ' ')));
  // 위험 등급 올리기, 해금 구매
  await ev(() => document.querySelector('[data-heat="1"]').click()); await page.waitForTimeout(150);
  await ev(() => document.querySelector('[data-heat="1"]').click()); await page.waitForTimeout(150);
  await ev(() => document.querySelector('[data-buy="u_guns"]').click()); await page.waitForTimeout(150);
  await ev(() => document.querySelector('[data-buy="u_snow"]').click()); await page.waitForTimeout(150);
  await ev(() => document.querySelector('[data-buy="u_cyborg"]').click()); await page.waitForTimeout(150);
  console.log('after: heat row', await ev(() => document.querySelector('.heat')?.textContent.replace(/\s+/g, ' ').trim()), 'up', await ev(() => JSON.stringify(JSON.parse(localStorage.getItem('pixelquest_meta_v1')).up)));
  await page.screenshot({ path: SP + '/79_hub.png' });
  await ev(() => document.querySelector('[data-act="start"]').click()); await page.waitForTimeout(800);
  console.log('run2:', await ev(() => { const g = window.__game; const e = g.spawnEnemy('grunt', 1); return JSON.stringify({ biomes: g.run.biomes, boss: g.run.boss, heat: g.heat, gruntHp: e.maxHp, gruntPow: e.power.toFixed(2), guns: g.stats.unlocked.weapons.includes('shotgun') }); }));
  console.log('errors', errs.length ? errs : 'none');
  await browser.close();
})();
