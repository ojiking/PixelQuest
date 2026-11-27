// 바이옴별 피색 가시성 확인: 4개 바이옴에서 같은 조건으로 적을 터뜨려 바닥·벽·캐릭터에 피를 묻히고 고품질 스크린샷
// 사용: NODE_PATH=$(npm root -g) node blood_biomes.js   (BIOMES=city,snow 로 일부만, TAG=after 로 파일 이름 꼬리표)
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../static/game'), SP = path.join(__dirname, 'out');
fs.mkdirSync(SP, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const BIOMES = (process.env.BIOMES || 'city,plains,desert,snow').split(','), TAG = process.env.TAG || 'now';
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('http://game.test/**', route => { const rel = new URL(route.request().url()).pathname.replace(/^\/+/, '') || 'index.html'; route.fulfill({ status: 200, contentType: TYPES[path.extname(rel)], body: fs.readFileSync(path.join(ROOT, rel)) }); });
  await page.addInitScript(() => { window.__forceHQ = true; });   // 그래픽카드 없는 환경에서도 고품질(그림자·후처리)로
  await page.goto('http://game.test/index.html'); await page.waitForTimeout(2500);
  await page.keyboard.press('Enter'); await page.waitForTimeout(300); await page.keyboard.press('Enter'); await page.waitForTimeout(2500);
  for (const b of BIOMES) {
    await page.evaluate(b => {
      const g = window.__game; g.run.biomes = [b, b]; g.loadStage(0); g.stage.hmap.clear();
      g.props.length = 0; g.traps.length = 0; g.items.length = 0;
      const p = g.player; p.x = 12; p.z = 0.5; p.facing = 1; p.hp = p.maxHp = 99999; g.camX = 14;
    }, b);
    await page.waitForTimeout(1500);
    // 같은 조건: 적 3명을 터뜨림(산산조각·두 동강·박살) + 바닥 웅덩이 + 피 묻은 적 1명은 살려 둠
    await page.evaluate(() => {
      const g = window.__game, p = g.player, fy = 0;
      const kills = [['blastApart', 2.2, -.6], ['bisect', 3.4, .8], ['shatter', 4.6, -.2]];
      for (const [how, dx, dz] of kills) {
        const e = g.spawnEnemy('grunt', 1); e.x = p.x + dx; e.z = p.z + dz; e.cool = 99;
        if (how === 'blastApart') { e.dead = true; e.blastApart(-1, {}); g.kill(e, { dir: 1, knock: 3 }); }
        else if (how === 'bisect') { g.kill(e, { dir: -1, knock: 3, bisect: 1, attacker: p }); e.bisect?.(-1, {}); }
        else { e.shatter(); g.kill(e, { dir: 1, knock: 3 }); }
      }
      for (let i = 0; i < 18; i++) g.stains.add(p.x + 1.5 + Math.random() * 3.5, fy, p.z - 1 + Math.random() * 2.2, 1, 1, 0.5 + Math.random() * 0.4);
      const live = g.spawnEnemy('biker', 1); live.x = p.x + 6.5; live.z = p.z - 1.2; live.cool = 99; live.ai = () => {};
      if (live.blood) for (const k of Object.keys(live.blood)) live.blood[k] = 0.25;
    });
    await page.waitForTimeout(9000);   // 파편이 다 떨어지고 바닥에 자국이 남은 뒤
    await page.evaluate(() => document.querySelectorAll('.banner, #banner').forEach(e => e.style.display = 'none'));
    await page.screenshot({ path: `${SP}/blood_${b}_${TAG}.png` });
    console.log(b, 'stains', await page.evaluate(() => window.__game.stains.n));
  }
  console.log('errors', errs.length ? errs : 'none');
  await browser.close();
})();
