// 무기방(개발자 전용): 진열·집기·버리면 재생성·실험용 적·옵션
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
  const s0 = await ev(() => { const g = window.__game; return { lab: !!g.run.lab, L: g.stage.L, segs: g.stage.segments.map(s => s.type).join(','), slots: g.lab.slots.length, items: g.items.filter(i => i.kind === 'weapon').length, enemies: g.enemies.filter(e => !e.dead).length, panel: document.getElementById('labui').textContent.replace(/\s+/g, ' ').trim(), tags: document.querySelectorAll('#labtags span').length }; });
  console.log('1 enter:', JSON.stringify(s0));
  await page.screenshot({ path: SP + '/lab_1.png' });
  // 진열대의 '마체테' 앞으로 가서 L로 집기
  await ev(() => { const g = window.__game, p = g.player, s = g.lab.slots.find(s => s.type === 'machete'); p.x = s.x; p.z = s.z + 0.3; });
  await page.waitForTimeout(300); await page.keyboard.press('KeyL'); await page.waitForTimeout(300);
  console.log('2 picked:', await ev(() => window.__game.player.weapon?.type), 'slot item still on floor:', await ev(() => { const s = window.__game.lab.slots.find(s => s.type === 'machete'); return !!(s.item && !s.item.remove); }));
  // 옆의 다른 무기를 집으면 들고 있던 마체테는 사라지고 진열대에 다시 생김
  await ev(() => { const g = window.__game, p = g.player, s = g.lab.slots.find(s => s.type === 'golf'); p.x = s.x; p.z = s.z + 0.3; });
  await page.waitForTimeout(300); await page.keyboard.press('KeyL'); await page.waitForTimeout(500);
  console.log('3 swap -> holding', await ev(() => window.__game.player.weapon?.type), '| machete back on rack:', await ev(() => { const s = window.__game.lab.slots.find(s => s.type === 'machete'); return !!(s.item && !s.item.remove); }), '| loose machetes:', await ev(() => window.__game.items.filter(i => i.type === 'machete' && !i.remove).length));
  // 던지기 → 사라지고 진열대에 재생성
  await ev(() => { const g = window.__game, p = g.player; p.z = 1.5; p.facing = 1; p.setState('idle'); p.attack = null; });
  await page.keyboard.press('KeyL'); await page.waitForTimeout(1600);
  console.log('4 thrown golf back on rack:', await ev(() => { const s = window.__game.lab.slots.find(s => s.type === 'golf'); return !!(s.item && !s.item.remove); }), 'loose golf clubs:', await ev(() => window.__game.items.filter(i => i.type === 'golf' && !i.remove).length));
  // 실험용 적: 공격 끔 상태에서 5초 동안 피해 0, 옵션 켜면 공격
  await ev(() => { const g = window.__game, p = g.player; p.x = 14; p.z = 0.5; window.__hits = 0; const od = g.onDamage.bind(g); g.onDamage = (v, d, h, b) => { if (v === p) window.__hits++; return od(v, d, h, b); }; for (const e of g.enemies) { e.x = 15; e.z = 0.5; } });
  await page.waitForTimeout(5000);
  console.log('5 attack OFF hits on player in 5s:', await ev(() => window.__hits), 'enemy alive:', await ev(() => window.__game.enemies.filter(e => !e.dead).length));
  await page.keyboard.press('Digit1'); await page.waitForTimeout(5000);
  console.log('  attack ON hits in 5s:', await ev(() => window.__hits), 'player hp', await ev(() => window.__game.player.hp + '/' + window.__game.player.maxHp));
  // 적 수 3, 죽이면 다시 등장
  await page.keyboard.press('Digit2'); await page.waitForTimeout(4000);
  console.log('6 count 3 ->', await ev(() => window.__game.enemies.filter(e => !e.dead).length));
  await ev(() => { const g = window.__game; for (const e of g.enemies.filter(e => !e.dead)) g.kill(e, { dir: 1, knock: 3 }); });
  await page.waitForTimeout(4500);
  console.log('  after killing all ->', await ev(() => window.__game.enemies.filter(e => !e.dead).length), 'panel:', await ev(() => document.getElementById('labui').textContent.replace(/\s+/g, ' ').trim()));
  await page.screenshot({ path: SP + '/lab_2.png' });
  // 나가기 → 타이틀, 기록 남지 않음
  await ev(() => document.querySelector('[data-lab="exit"]').click()); await page.waitForTimeout(600);
  console.log('7 exit -> title:', await ev(() => !!document.querySelector('.panel.title')), 'meta runs', await ev(() => JSON.parse(localStorage.getItem('pixelquest_meta_v1') || '{}').runs ?? 0));
  console.log('errors', errs.length ? errs : 'none');
  await browser.close();
})();
