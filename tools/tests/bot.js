// 브라우저 안에서 도는 자동 플레이어: 실제 키보드 이벤트만으로 조작
(() => {
  const held = new Set(), tapQ = [];
  const send = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  const hold = (code, on) => { if (on && !held.has(code)) { held.add(code); send('keydown', code); } else if (!on && held.has(code)) { held.delete(code); send('keyup', code); } };
  const tap = code => { if (held.has(code)) hold(code, false); send('keydown', code); tapQ.push([code, 2]); };
  const L = window.__log = { ev: [], dmg: {}, deaths: [], perf: [], zone: [], stuck: 0, t0: performance.now() };
  const log = (type, o = {}) => L.ev.push({ t: +((performance.now() - L.t0) / 1000).toFixed(1), type, ...o });
  let hooked = null, lastT = performance.now(), frames = [], nextAtk = 0, grabStep = 0, lastProg = { x: 0, t: 0 }, lastZone = -1, zoneT0 = 0;
  function hook(g) {
    if (hooked) return; hooked = g.player;
    const od = g.onDamage.bind(g);
    g.onDamage = (v, dmg, h, back) => { if (v === g.player) { const k = h.attacker ? (h.attacker.type || h.attacker.team) + (h.attacker.weapon ? ':' + h.attacker.weapon.type : '') + (h.attacker.attack ? '/' + (h.attacker.attack.key || h.attacker.attack.def?.anim) : '') : h.explosion ? 'explosion' : 'trap/other'; L.dmg[k] = (L.dmg[k] || 0) + dmg; } return od(v, dmg, h, back); };
    const hd = g.heroDown.bind(g);
    g.heroDown = (v, h) => { if (v === g.player) { const k = h?.attacker ? h.attacker.type : h?.explosion ? 'explosion' : 'other'; L.deaths.push({ t: +((performance.now() - L.t0) / 1000).toFixed(0), by: k, stage: g.run.stage, zone: g.zoneIdx, x: +g.player.x.toFixed(1) }); log('death', { by: k }); } return hd(v, h); };
    const fo = g.fallOut.bind(g);
    g.fallOut = a => { if (a === g.player) { L.deaths.push({ t: +((performance.now() - L.t0) / 1000).toFixed(0), by: 'FALL', stage: g.run.stage, zone: g.zoneIdx, x: +a.x.toFixed(1) }); log('fall'); } return fo(a); };
  }
  function frame(now) {
    requestAnimationFrame(frame);
    frames.push(now - lastT); lastT = now;
    if (frames.length >= 300) { const s = frames.slice().sort((a, b) => a - b); const g = window.__game; L.perf.push({ avg: +(frames.reduce((a, b) => a + b) / frames.length).toFixed(1), p95: +s[Math.floor(s.length * .95)].toFixed(1), max: +s[s.length - 1].toFixed(0), debris: g?.debris.n, stains: g?.stains.n, gibs: g?.gibs.list.length, actors: g?.actors.length }); frames = []; }
    for (let i = tapQ.length - 1; i >= 0; i--) if (--tapQ[i][1] <= 0) { send('keyup', tapQ[i][0]); tapQ.splice(i, 1); }
    const g = window.__game;
    if (!g || !g.running || !g.player || window.__botOff) { for (const c of [...held]) hold(c, false); return; }
    hook(g);
    const p = g.player, T = g.time;
    if (g.zoneIdx !== lastZone) { if (lastZone >= 0) L.zone.push({ stage: g.run.stage, zone: lastZone, sec: +(T - zoneT0).toFixed(0), hp: Math.round(p.hp) }); lastZone = g.zoneIdx; zoneT0 = T; }
    let mx = 0, mz = 0;
    const want = { KeyD: false, KeyA: false, KeyW: false, KeyS: false };
    if (p.state === 'ko' || p.state === 'down' || p.state === 'dying') { for (const c of [...held]) hold(c, false); return; }
    if (p.state === 'grab') {
      if (T > nextAtk) { nextAtk = T + 0.28; if (grabStep++ < 2) tap('KeyJ'); else { tap('KeyL'); grabStep = 0; } }
      for (const c of [...held]) hold(c, false); return;
    }
    const foes = g.enemies.filter(e => !e.dead && e.state !== 'dying' && Math.abs(e.x - g.camX) < g.viewHalf + 1);
    // 위험: 예고 중인 적이 가까이
    const danger = foes.find(e => e.attack?.def.telegraph && e.attackPhase?.() === 'startup' && Math.abs(e.x - p.x) < 2.6 * e.scale && Math.abs(e.z - p.z) < 0.7)
      || foes.find(e => e.bikePhase === 'rev' && Math.abs(e.z - p.z) < 0.8);
    const fl = (x, z) => g.floorAt(x, z);
    const reach = p.weapon ? 1.6 : 1.05;
    if (danger) {
      mz = p.z > 0.5 ? -1 : 1; mx = Math.sign(p.x - danger.x) * 0.0;
    } else if (!p.weapon && !p.carry) {
      const it = g.items.find(i => i.kind === 'weapon' && Math.abs(i.x - p.x) < 4 && Math.abs(i.z - p.z) < 3 && fl(i.x, i.z) <= p.y + 0.3 && fl(i.x, i.z) > -50);
      const t = foes.sort((a, b) => (Math.abs(a.x - p.x) + 2 * Math.abs(a.z - p.z)) - (Math.abs(b.x - p.x) + 2 * Math.abs(b.z - p.z)))[0];
      if (it && (!t || Math.abs(t.x - p.x) > 2.2)) {
        const dx = it.x - p.x, dz = it.z - p.z;
        if (Math.abs(dx) < 0.6 && Math.abs(dz) < 0.4) { if (T > nextAtk) { nextAtk = T + 0.3; tap('KeyL'); } }
        else { mx = Math.abs(dx) > 0.3 ? Math.sign(dx) : 0; mz = Math.abs(dz) > 0.25 ? Math.sign(dz) : 0; }
      } else if (t) fight(t);
      else roam();
    } else {
      const t = foes.sort((a, b) => (Math.abs(a.x - p.x) + 2 * Math.abs(a.z - p.z)) - (Math.abs(b.x - p.x) + 2 * Math.abs(b.z - p.z)))[0];
      if (t) fight(t); else roam();
    }
    function fight(t) {
      const dx = t.x - p.x, dz = t.z - p.z, side = Math.sign(dx) || 1;
      const ideal = reach * 0.75 * Math.max(1, t.scale * .8);
      if (Math.abs(dz) > 0.22) mz = Math.sign(dz);
      if (Math.abs(dx) > ideal + 0.35) mx = side; else if (Math.abs(dx) < ideal - 0.45) mx = -side;
      if (Math.abs(dz) < 0.32 && Math.abs(dx) < reach + 0.35 * t.scale) {
        if (p.facing !== side) mx = side;
        else if (T > nextAtk) {
          nextAtk = T + 0.13;
          if (!p.weapon && !p.carry && Math.abs(dx) < 0.85 && !t.isBoss && !t.mounted && Math.random() < 0.05) tap('KeyL');
          else tap('KeyJ');
        }
      }
    }
    function roam() {
      if (p.carry && T > nextAtk) { nextAtk = T + 0.4; tap('KeyJ'); return; }
      mx = 1;
      if (T - lastProg.t > 3) mz = Math.floor((T - lastProg.t) / 2) % 2 ? -1 : 1;   // 막히면 라인을 바꿔 봄
      const zc = 0.5; if (Math.abs(p.z - zc) > 0.6 && fl(p.x + 1, p.z) < -50) mz = Math.sign(zc - p.z);
    }
    // 지형: 앞이 낭떠러지거나 올라설 블록이면 점프
    if (mx && p.grounded) {
      const ax = p.x + mx * 0.7;
      const f1 = fl(ax, p.z), f2 = fl(p.x + mx * 1.6, p.z);
      if (f1 < -50 || (f1 > p.y + 0.4 && f1 <= p.y + 1.1)) tap('KeyK');
      else if (f1 > p.y + 1.1) { mz = mz || (p.z > 0.5 ? -1 : 1); }
    }
    want.KeyD = mx > 0; want.KeyA = mx < 0; want.KeyS = mz > 0; want.KeyW = mz < 0;
    for (const k in want) hold(k, want[k]);
    // 진행 막힘 감지
    if (Math.abs(p.x - lastProg.x) > 1.5) lastProg = { x: p.x, t: T };
    else if (T - lastProg.t > 25) { L.stuck++; log('stuck', { x: +p.x.toFixed(1), zone: g.zoneIdx, lock: !!g.lock, enemies: g.enemies.filter(e => !e.dead).map(e => `${e.type}@${e.x.toFixed(0)},${e.z.toFixed(1)}:${e.state}`).join(' ') }); lastProg = { x: p.x, t: T }; }
  }
  requestAnimationFrame(frame);
})();
