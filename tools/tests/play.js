const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../static/game');
const SP = path.join(__dirname, 'out'); require('fs').mkdirSync(SP, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const RUNS = +(process.env.RUNS || 3), MAXMIN = +(process.env.MAXMIN || 20);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message + ' @ ' + (e.stack || '').split('\n')[1]));
  await page.route('http://game.test/**', route => { const rel = new URL(route.request().url()).pathname.replace(/^\/+/, '') || 'index.html'; route.fulfill({ status: 200, contentType: TYPES[path.extname(rel)], body: fs.readFileSync(path.join(ROOT, rel)) }); });
  if (process.env.META) await page.addInitScript(m => { localStorage.setItem('pixelquest_meta_v1', m); }, process.env.META);
  await page.goto('http://game.test/index.html'); await page.waitForTimeout(1200);
  await page.addScriptTag({ path: path.join(__dirname, 'bot.js') });
  await page.keyboard.press('Enter');
  const t0 = Date.now(); let runs = 0, shot = 0, lastShot = 0;
  const results = [];
  while (runs < RUNS && Date.now() - t0 < MAXMIN * 60000) {
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => ({ perk: !!document.querySelector('[data-perk]'), hubBtn: !!document.querySelector('[data-act="hub"]'), hub: !!document.querySelector('.panel.hub'), title: !!document.querySelector('[data-act="start"]') && !document.querySelector('.panel.hub'), running: window.__game?.running, h1: document.querySelector('.panel h1')?.textContent }));
    if (st.perk) { await page.screenshot({ path: `${SP}/play_perk_${runs}.png` }); await page.evaluate(() => document.querySelectorAll('[data-perk]')[Math.floor(Math.random() * 3)].click()); continue; }
    if (st.hubBtn) {
      const g = await page.evaluate(() => { const g = window.__game; return { stage: g.run.stage, kills: g.run.kills, scrap: Math.floor(g.run.scrap), time: Math.round(g.run.time || 0), biomes: g.run.biomes.join('>'), boss: g.run.boss }; });
      results.push({ result: st.h1, ...g, min: ((Date.now() - t0) / 60000).toFixed(1) });
      await page.screenshot({ path: `${SP}/play_result_${runs}.png` });
      runs++;
      await page.evaluate(() => document.querySelector('[data-act="hub"]').click()); await page.waitForTimeout(500);
      // 정비소: 살 수 있는 것 중 가장 싼 것부터 구매 (해금 우선)
      await page.evaluate(() => { for (let k = 0; k < 6; k++) { const b = [...document.querySelectorAll('[data-buy]:not([disabled])')]; if (!b.length) break; b[0].click(); } });
      await page.screenshot({ path: `${SP}/play_hub_${runs}.png` });
      await page.evaluate(() => document.querySelector('[data-act="start"]')?.click());
      continue;
    }
    if (st.running && Date.now() - lastShot > 15000) { lastShot = Date.now(); await page.screenshot({ path: `${SP}/play_s${String(shot++).padStart(3, '0')}.png` }); }
  }
  const log = await page.evaluate(() => window.__log);
  fs.writeFileSync(`${SP}/play_log.json`, JSON.stringify({ results, log, errs }, null, 1));
  console.log(JSON.stringify({ results, deaths: log.deaths, dmg: log.dmg, zone: log.zone, stuck: log.stuck, perfTail: log.perf.slice(-4), errs: errs.slice(0, 5) }, null, 1));
  await browser.close();
})();
