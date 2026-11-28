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
  // 아지트로: 판 종료 → 결과 화면 → Enter → 3D 아지트 (예전 2D 정비소 화면은 v0.6에서 아지트로 바뀜)
  await ev(() => { const g = window.__game; g.running = false; g.hooks.onRunEnd(); });
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  const metaHub = await ev(() => JSON.parse(localStorage.getItem('pixelquest_meta_v1') || '{}'));
  const hubBtns = await ev(() => [...document.querySelectorAll('#hubui [data-open]')].map(b => b.dataset.open).join(','));
  console.log('hub buttons:', hubBtns);
  // 예전 저장 환불: 상한(6)을 넘친 체력·근력 레벨은 부품으로 돌려받음
  console.log('refund: up', JSON.stringify(metaHub.up), 'scrap', m0.scrap, '→', metaHub.scrap);
  const fails = [];
  if (!(metaHub.up.p_hp <= 6 && metaHub.up.p_pow <= 6)) fails.push('levels not capped');
  if (!(metaHub.scrap > m0.scrap)) fails.push('no refund');
  if (!/hero/.test(hubBtns) || !/diff/.test(hubBtns)) fails.push('hub buttons missing');
  // 주인공 단련 창: 무기고 해금(화기) 구매
  const click = sel => ev(s => { const e = document.querySelector(s); if (!e) return false; e.click(); return true; }, sel);
  await click('#hubui [data-open="hero"]'); await page.waitForTimeout(300);
  console.log('hero groups:', await ev(() => [...document.querySelectorAll('.ugroup h3')].map(h => h.textContent.trim()).join(' | ')));
  console.log('bank text:', await ev(() => document.querySelector('.bank')?.textContent.replace(/\s+/g, ' ').trim()));
  if (!(await click('[data-buy="u_guns"]'))) fails.push('u_guns button missing');
  await page.waitForTimeout(200);
  await click('[data-act="close"]'); await page.waitForTimeout(300);
  // 난이도 선택 창: 난이도 두 단계 올리기(클리어 2회 → 최대 2), 지역·현상수배 해금
  await click('#hubui [data-open="diff"]'); await page.waitForTimeout(300);
  console.log('heat row before:', await ev(() => document.querySelector('.heat')?.textContent.replace(/\s+/g, ' ').trim()));
  for (let i = 0; i < 3; i++) { await click('[data-heat="1"]:not([disabled])'); await page.waitForTimeout(150); }   // 세 번 눌러도 최대 2에서 멈춰야 함
  for (const id of ['u_snow', 'u_cyborg']) { if (!(await click(`[data-buy="${id}"]`))) fails.push(id + ' button missing'); await page.waitForTimeout(200); }
  const after = await ev(() => JSON.parse(localStorage.getItem('pixelquest_meta_v1')));
  console.log('after: heat row', await ev(() => document.querySelector('.heat')?.textContent.replace(/\s+/g, ' ').trim()), 'up', JSON.stringify(after.up), 'scrap', after.scrap);
  await page.screenshot({ path: SP + '/79_hub.png' });
  await click('[data-act="close"]'); await page.waitForTimeout(300);
  // 새 런: 해금·난이도가 반영되는지
  await click('#hubui [data-act="start"]'); await page.waitForTimeout(800);
  const run2 = await ev(() => { const g = window.__game; const e = g.spawnEnemy('grunt', 1); return { biomes: g.run.biomes, boss: g.run.boss, heat: g.heat, gruntHp: e.maxHp, gruntPow: +e.power.toFixed(2), guns: g.stats.unlocked.weapons.includes('shotgun'), snow: g.stats.unlocked.biomes.includes('snow'), cyborg: g.stats.unlocked.bosses.includes('cyborg') }; });
  console.log('run2:', JSON.stringify(run2));
  if (after.heat !== 2 || run2.heat !== 2) fails.push(`heat ${after.heat}/${run2.heat} (expected 2)`);
  for (const [id, ok] of [['u_guns', run2.guns], ['u_snow', run2.snow], ['u_cyborg', run2.cyborg]]) if (!(after.up[id] === 1 && ok)) fails.push(id + ' not unlocked');
  console.log('checks:', fails.length ? 'FAIL ' + fails.join(', ') : 'all ok');
  console.log('errors', errs.length ? errs : 'none');
  await browser.close();
})();
