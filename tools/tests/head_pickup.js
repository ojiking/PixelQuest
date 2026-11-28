// 기본 졸개(골목 깡패)가 잘린 머리통을 주워 들고 휘두르는지: 무기방(개발자)과 본 게임 둘 다
// 줍기 → 휘둘러 뱀돌이를 때림 → 들고 있다 죽으면 떨어뜨림 → 뱀돌이가 다시 주울 수 있음
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../../static/game'), SP = path.join(__dirname, 'out');
fs.mkdirSync(SP, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
(async () => {
  const browser = await chromium.launch(); const fails = [];
  for (const where of ['lab', 'run']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('http://game.test/**', route => { const rel = new URL(route.request().url()).pathname.replace(/^\/+/, '') || 'index.html'; route.fulfill({ status: 200, contentType: TYPES[path.extname(rel)], body: fs.readFileSync(path.join(ROOT, rel)) }); });
    if (process.env.HQ) await page.addInitScript(() => { window.__forceHQ = true; });
    await page.goto('http://game.test/index.html'); await page.waitForTimeout(1500);
    const ev = (f, a) => page.evaluate(f, a);
    // 게임 시간 기준 대기 (느린 테스트 환경에서도 안정)
    const wait = async ms => { const t0 = await ev(() => window.__game?.time ?? 0), w0 = Date.now(); while (Date.now() - w0 < ms * 6) { await page.waitForTimeout(100); const t = await ev(() => window.__game?.time ?? 0); if (t - t0 >= ms / 1000) break; } };
    if (where === 'lab') { await ev(() => document.querySelector('[data-act="lab"]').click()); await page.waitForTimeout(1500); }
    else { await page.keyboard.press('Enter'); await page.waitForTimeout(300); await page.keyboard.press('Enter'); await page.waitForTimeout(1200); }
    // 무대 정리: 평지, 아이템·적 제거, 뱀돌이는 안 죽게
    await ev(() => { const g = window.__game; g.stage.hmap.clear(); g.items.length = 0; g.props.length = 0; g.traps.length = 0; for (const e of g.enemies) { e.remove = true; e.dead = true; }
      if (g.lab) { g.lab.attack = true; g.lab.count = 0; }
      const p = g.player; p.hp = p.maxHp = 99999; p.x = Math.max(p.x, 12); p.z = 0; g.camX = p.x + 2; });
    // 1) 깡패 하나의 머리를 잘라 바닥에 떨어뜨림
    await ev(() => { const g = window.__game, p = g.player; const v = g.spawnEnemy('grunt', 1); v.weapon = null; v.x = p.x + 3; v.z = 0; v.severPart('head', 1, { mode: 'cut' }); g.kill(v, { dir: 1, knock: 1 }); });
    for (let i = 0; i < 40; i++) { await wait(300); if (await ev(() => window.__game.gibs.list.some(g => g.part === 'head' && g.rest))) break; }   // 머리통은 4초쯤 튀고 구르다 멈춤
    const heads = await ev(() => window.__game.gibs.list.filter(g => g.part === 'head').map(g => [+g.pos[0].toFixed(1), g.rest]));
    console.log(where, 'heads on floor:', JSON.stringify(heads));
    // 2) 맨손 깡패가 등장 → 머리통을 주우러 감
    // 볼트는 쉬게 하고(깡패를 때리지 않게), 깡패는 머리통에서 3m 떨어진 곳에 등장
    await ev(() => { const g = window.__game; if (g.bot) { g.bot.koT = 999; g.bot.setState('ko'); g.bot.x = g.player.x - 6; } const h = g.gibs.list.find(g => g.part === 'head'); const e = g.spawnEnemy('grunt', 1); e.weapon = null; e.x = h.pos[0] + 3; e.z = 0.4; window.__e = e; });
    let got = false;
    for (let i = 0; i < 40 && !got; i++) { await wait(250); got = await ev(() => window.__e.carry?.limb === 'head'); }
    console.log(where, 'grunt picked up head:', got, 'heldDef:', await ev(() => window.__e.heldDef()?.name));
    if (!got) fails.push(where + ': no pickup');
    if (process.env.HQ) { await ev(() => { const g = window.__game; g.camX = window.__e.x - 1; }); await wait(300); await page.screenshot({ path: SP + '/head_pickup.png' }); }
    if (process.env.HQ) { await page.close(); continue; }   // 고품질 모드는 아주 느려서 스크린샷만 (확인 항목은 일반 모드로)
    // 3) 머리통으로 뱀돌이를 때림 (머리통 내구도가 줄어듦)
    const hp0 = await ev(() => window.__game.player.hp), dur0 = await ev(() => window.__e.carry?.dur);
    await ev(() => { const g = window.__game, e = window.__e; e.x = g.player.x + 0.9; e.z = g.player.z; });
    let swung = false;
    for (let i = 0; i < 40 && !swung; i++) { await wait(250); swung = await ev(() => { const e = window.__e; return !e.carry || (e.carry.dur < 5) || (e.attack && /eWeapon/.test(e.attack.key || '')); }); }
    await wait(400);   // 맞은 피해가 반영될 때까지
    const hp1 = await ev(() => window.__game.player.hp), dur1 = await ev(() => window.__e.carry?.dur ?? 0);
    console.log(where, 'hit hero with head: hp', hp0, '→', hp1, 'head durability', dur0, '→', dur1);
    if (!(hp1 < hp0 || dur1 < dur0)) fails.push(where + ': no head swing');
    // 4) 들고 있던 깡패를 죽이면 머리통을 떨어뜨림 → 뱀돌이가 L로 주울 수 있음
    await ev(() => { const g = window.__game, e = window.__e; if (e.carry) g.kill(e, { dir: 1, knock: 2 }); });
    await wait(2500);
    const dropped = await ev(() => window.__game.gibs.list.some(g => g.part === 'head'));
    await ev(() => { const g = window.__game, p = g.player, h = g.gibs.list.find(g => g.part === 'head' && g.rest); if (h) { p.x = h.pos[0] - 0.3; p.z = h.pos[2]; p.weapon = null; p.carry = null; p.setState('idle'); g.interact(p); } });
    const heroHas = await ev(() => window.__game.player.carry?.limb === 'head');
    console.log(where, 'head dropped on death:', dropped, '| hero picked it up:', heroHas);
    if (!dropped || !heroHas) fails.push(where + ': drop/repick');
    if (errs.length) fails.push(where + ': errors ' + errs.join(' | '));
    await page.close();
  }
  console.log('checks:', fails.length ? 'FAIL ' + fails.join(', ') : 'all ok');
  await browser.close();
})();
