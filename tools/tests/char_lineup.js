// 캐릭터 라인업: 주인공·모든 적·보스 둘·로봇 셋을 평평한 무기방에 나란히 세워 스크린샷 (실루엣 비교용)
// + 모델 생성 시간(캐릭터별 ms) 기록. 고품질 렌더(__forceHQ)라 느리므로 장면 수를 적게 유지
// 결과: out/lineup_small.png, lineup_big.png, lineup_*_close.png, lineup_*_front.png, lineup_*_side.png, lineup_bike.png
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../static/game'), SP = path.join(__dirname, 'out');
fs.mkdirSync(SP, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const HQ = process.env.LQ ? false : true;
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await page.route('http://game.test/**', route => { const rel = new URL(route.request().url()).pathname.replace(/^\/+/, '') || 'index.html'; route.fulfill({ status: 200, contentType: TYPES[path.extname(rel)], body: fs.readFileSync(path.join(ROOT, rel)) }); });
  if (HQ) await page.addInitScript(() => { window.__forceHQ = true; });
  await page.goto('http://game.test/index.html'); await page.waitForTimeout(1200);
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => document.querySelector('[data-act="lab"]').click()); await page.waitForTimeout(1500);
  await page.addStyleTag({ content: '#labui,#banner,#hud,#texts,#labtags{display:none!important}' });
  // 모델 생성 시간 (캐시 비우고 새로 만듦)
  const times = await ev(async () => {
    const M = await import('/js/models.js'); const g = window.__game, out = {};
    for (const k of ['player', 'grunt', 'charger', 'thrower', 'shielder', 'biker', 'ninja', 'bomber', 'brute', 'boss', 'cyborg', 'bot', 'bot_tank', 'bot_atk']) {
      const t0 = performance.now(); M.getModel(g.r, k); out[k] = Math.round(performance.now() - t0);
    }
    return out;
  });
  console.log('model build ms (cached models show ~0):', JSON.stringify(times));
  const setup = (o) => ev(async (o) => {
    const g = window.__game, C = await import('/js/config.js');
    g.lab.count = 0;
    for (const it of g.items) if (Math.abs(it.x - 36) < 15) it.remove = true;
    for (const a of g.actors) if (a.team === 'enemy') a.remove = true;
    const Enemy = window.__EnemyCls ??= g.spawnEnemy('grunt', 1).constructor;
    const Comp = g.bot.constructor;
    g.actors = g.actors.filter(a => a.team === 'hero');
    const X0 = 30, p = g.player; p.weapon = null;
    const list = [];
    let x = X0;
    for (const k of o.keys) {
      let a;
      if (k === 'hero') a = p;
      else if (k === 'bot' && !o.allBots) a = g.bot;
      else if (k.startsWith('bot')) a = new Comp(g, { ...g.bot.stats, model: k, scale: k === 'bot_tank' ? 1.08 : 1 });
      else a = new Enemy(g, k, x, 0.6);
      if (k !== 'hero' && !(k === 'bot' && !o.allBots)) g.actors.push(a);
      if (k === 'bot' && !o.allBots) { a.modelKey = 'bot'; a.model = (await import('/js/models.js')).getModel(g.r, 'bot'); }
      const w = (o.gap ?? 1.5) * Math.max(1, a.scale * .85);
      x += w / 2; a.x = x; a.z = o.z ?? 0.6; a.y = 0; x += w / 2;
      if (!['ninja', 'cyborg'].includes(k)) a.weapon = null;
      a.facing = 1; a.mounted = o.bike && k === 'biker'; a.hp = 9999;
      const tw = o.twist ?? 0;
      a.update = function (dt) { this.state = 'idle'; this.attack = null; this.vx = this.vz = this.vy = 0; this.invuln = 0; this.flash = 0; this.pose(dt); this.twist = tw; };
      list.push(a);
    }
    for (const a of g.actors) if (!list.includes(a)) { a.x = -80; a.update = function () {}; }
    g.enemies = g.actors.filter(a => a.team === 'enemy');
    if (!o.keys.includes('hero')) p.x = -80;
    if (o.keys.includes('hero')) { /* 주인공은 줄 안의 자리 */ const h = list[o.keys.indexOf('hero')]; window.__heroX = h.x; }
    C.CAMERA.zoom = o.zoom ?? 1;
    window.__cam0 ??= { eye: [...C.CAMERA.eye], look: [...C.CAMERA.look] };
    C.CAMERA.eye = o.eye ?? [...window.__cam0.eye]; C.CAMERA.look = o.look ?? [...window.__cam0.look];
    // 카메라는 주인공을 따라가므로 주인공을 카메라 중심용으로 잠깐 씀
    g.camX = (X0 + x) / 2 + (o.camDx ?? 0);
    window.__camHold = g.camX;
    const ou = g.update.bind(g);
    g.update = function (dt) { ou(dt); this.camX = window.__camHold; };
    return list.map(a => a.modelKey + '@' + a.x.toFixed(1) + ' s' + a.scale);
  }, o);
  const shot = async (name, o) => {
    await page.evaluate(() => { const g = window.__game; if (g.__origUpdate) g.update = g.__origUpdate; else g.__origUpdate = g.update; });
    const info = await setup(o);
    await page.waitForTimeout(HQ ? 2500 : 600);
    await page.screenshot({ path: `${SP}/${name}.png`, clip: o.clip });
    console.log(name, info.join(' '));
  };
  if (process.env.ONLY) {   // 빠른 확인: ONLY=grunt,charger → 낮은 카메라로 가까이
    const keys = process.env.ONLY.split(',');
    for (const tw of (process.env.TW || '0,-1.15').split(',').map(Number)) await shot('portrait_' + keys.join('_') + '_' + tw, { keys, allBots: true, gap: 1.6, zoom: +(process.env.Z || 1.9), eye: [3.2, 15.5], look: [1.15, -0.6], twist: tw, camDx: +(process.env.DX || 0) });
    console.log('errors', errs.length ? errs : 'none'); await browser.close(); return;
  }
  const SMALL = ['hero', 'grunt', 'charger', 'thrower', 'shield', 'biker', 'ninja', 'bomber'];
  const BIGL = ['hero', 'brute', 'boss', 'cyborg', 'bot', 'bot_tank', 'bot_atk'];
  // 주인공은 하나뿐이라 줄의 자리에 넣고, 카메라는 중앙을 봄
  await shot('lineup_small', { keys: SMALL, gap: 1.55 });
  await shot('lineup_small_close', { keys: SMALL, gap: 1.55, zoom: 1.9, camDx: -3.1 });
  await shot('lineup_small_close2', { keys: SMALL, gap: 1.55, zoom: 1.9, camDx: 3.1 });
  await shot('lineup_small_front', { keys: SMALL, gap: 1.55, twist: -1.15 });
  await shot('lineup_small_side', { keys: SMALL, gap: 1.55, twist: 0.42 });
  await shot('lineup_big', { keys: BIGL, gap: 1.7, allBots: true });
  await shot('lineup_big_close', { keys: BIGL, gap: 1.7, allBots: true, zoom: 1.7, camDx: -2.4 });
  await shot('lineup_big_close2', { keys: BIGL, gap: 1.7, allBots: true, zoom: 1.7, camDx: 3.4 });
  await shot('lineup_big_front', { keys: BIGL, gap: 1.7, allBots: true, twist: -1.15 });
  await shot('lineup_big_side', { keys: BIGL, gap: 1.7, allBots: true, twist: 0.42 });
  await shot('lineup_bike', { keys: ['hero', 'biker', 'shield', 'ninja'], gap: 2.2, bike: true, zoom: 1.8 });
  console.log('errors', errs.length ? errs : 'none');
  await browser.close();
})();
