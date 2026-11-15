// 1~N일차 자동 플레이 시뮬레이션 (실제 게임 코드를 그대로 돌림)
// 사용법: templates/dynamite.html 을 http://localhost:5056/ 으로 띄운 뒤  node tools/dynamite_sim.js <novice|normal|skilled> <runs> <maxDay> <gamble|sell>
const { chromium } = require('playwright');
const fs = require('fs');
const SKILL = {
  novice: { name: '초보', sp: 16, sd: 0.2, gap: 3.6 },
  normal: { name: '보통', sp: 9, sd: 0.1, gap: 3.0 },
  skilled: { name: '고수', sp: 4, sd: 0.045, gap: 2.2 },
};
const profile = process.argv[2] || 'normal', runs = +(process.argv[3] || 1), maxDay = +(process.argv[4] || 20), policy = process.argv[5] || 'gamble';
(async () => {
  const b = await chromium.launch();
  const all = [];
  for (let run = 0; run < runs; run++) {
    const p = await b.newPage({ viewport: { width: 390, height: 780 } });
    const errs = []; p.on('pageerror', x => errs.push(x.message));
    await p.goto('http://localhost:5056/'); await p.waitForTimeout(300);
    await p.evaluate(() => __sim.begin({ upVer: 2, coins: 0, up: { bag: 0, power: 0, fuse: 0, charm: 0, cluster: 0, bait: 0, remote: 0, sniper: 0 }, dex: {}, nukes: 0, ammo: { remote: 2, cluster: 2, bait: 2 }, chips: 40, jp: { mini: 8, major: 80, grand: 800 }, fever: 0, bestMile: 0, crew: {}, equip: [], tur: { open: 1, mounts: [null, null, null] } }));
    const days = [];
    for (let d = 1; d <= maxDay; d++) {
      const r = await p.evaluate(sk => {
        const diag = { fishN: 0, n: 0, swim: 0, big: {}, vals: [] }; const DT = 1 / 30; let t = 0, nextT = 1.2, throws = 0, simT = 0;
        const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
        __sim.resetStolen();
        const k0 = __sim.kills;
        while (__sim.state === 'play' && simT < 600) {
          __sim.step(3, DT); simT += 3 * DT; t += 3 * DT;
          if (t < nextT || __sim.stun || __sim.busyBomb && !__sim.fever) continue;
          if (__sim.dyn <= 0 && !__sim.fever) continue;
          const w = __sim.world(), R = __sim.R, DZ = __sim.DZ;
          if (!w.fish.length) { nextT = t + 0.5; continue; }
          // 후보: 물고기 위치들 (0.6초 뒤 예측) 중 반경 안 점수 합이 최대인 곳
          const cand = w.fish.length > 70 ? w.fish.filter((_, i) => i % Math.ceil(w.fish.length / 70) === 0) : w.fish;
          let best = null, bv = 0; diag.fishN += w.fish.length; diag.n++; if (w.swimmer) diag.swim++; if (w.big) diag.big[w.big.t] = (diag.big[w.big.t] || 0) + 1;
          for (const c of cand) {
            const cx = c[0] + c[5] * 0.6, cy = c[1] + c[6] * 0.6, cd = c[2];
            if (w.swimmer && Math.hypot(w.swimmer[0] - cx, w.swimmer[1] - cy) < R + 14) continue;
            if (w.big && w.big.t === 'whale' && Math.hypot(w.big.x - cx, w.big.y - cy) < R + 20) continue;
            let v = 0;
            for (const f of w.fish) { const fx = f[0] + f[5] * 0.6, fy = f[1] + f[6] * 0.6; if (Math.hypot(fx - cx, fy - cy, (f[2] - cd) * DZ) < R * 0.9) v += f[3] * (f[4] > 1 ? 0.35 : 1); }
            if (v > bv) { bv = v; best = [cx, cy, cd]; }
          }
          if (!best) { nextT = t + 0.5; continue; } diag.vals.push(Math.round(bv));
          if (__sim.throwAt(best[0] + gauss() * sk.sp, best[1] + gauss() * sk.sp, best[2] + gauss() * sk.sd)) throws++;
          nextT = t + (__sim.fever ? 0.7 : sk.gap * (0.8 + Math.random() * 0.4));
        }
        return { diag: { fish: Math.round(diag.fishN / Math.max(1, diag.n)), swim: diag.swim, big: JSON.stringify(diag.big), vals: diag.vals.join(' ') }, simT: Math.round(simT), throws, state: __sim.state, score: __sim.dayScore, target: __sim.target, stolen: __sim.stolen, kills: __sim.kills - k0 };
      }, SKILL[profile]);
      if (r.state !== 'clear') { days.push({ day: d, ...r, note: 'stuck/ended' }); break; }
      // 저녁: 도박(기댓값) 또는 헐값 판매, 그리고 쇼핑
      const ev = await p.evaluate(pol => {
        const e = __sim.evening(); const cpc = __sim.cpc(20000);
        const gain = pol === 'sell' ? __sim.sell() : __sim.gamble(cpc);
        const m = __sim.meta, bought = [];
        const actions = () => {
          const a = [];
          for (const id of ['bag', 'power', 'sniper']) { const u = __sim.UP.find(x => x.id === id); if (u && m.up[id] < u.costs.length) a.push({ cost: u.costs[m.up[id]], name: id + (m.up[id] + 1), go: () => { m.up[id]++; if (id === 'sniper' && !m.equip.includes('sniper')) m.equip.push('sniper'); } }); }
          const T = m.tur, plan = ['mg', 'ms', 'mg'];
          if (m.coins >= 0 && __sim.day >= 1) {
            for (let i = 0; i < T.open; i++) { const t2 = T.mounts[i];
              if (!t2) a.push({ cost: __sim.TUR[plan[i]].costs[0], name: `T${i}:${plan[i]}1`, go: () => { T.mounts[i] = { type: plan[i], lv: 1 }; } });
              else if (t2.lv < 3) a.push({ cost: __sim.TUR[t2.type].costs[t2.lv], name: `T${i}:${t2.type}${t2.lv + 1}`, go: () => { t2.lv++; } }); }
            if (T.open < 3) a.push({ cost: __sim.MOUNT_COST[T.open], name: `open${T.open}`, go: () => { T.open++; } });
          }
          return a.sort((x, y) => x.cost - y.cost);
        };
        for (let k = 0; k < 30; k++) { const a = actions()[0]; if (!a || a.cost > m.coins) break; m.coins -= a.cost; a.go(); bought.push(a.name); }
        return { chips: e.chips, free: e.free, fail: e.fail, cpc, gain, coins: m.coins, bought, up: { ...m.up }, tur: m.tur.mounts.map(x => x ? x.type + x.lv : '-').join(' ') + ` open${m.tur.open}` };
      }, policy);
      days.push({ day: d, ...r, ...ev });
      const ok = await p.evaluate(() => __sim.sleep());
      if (!ok) break;
    }
    all.push({ run, days, errs: errs.slice(0, 3) });
    await p.close();
    const last = days[days.length - 1];
    console.log(`run ${run}: reached day ${last.day} (${last.fail ? 'failed target' : last.note || 'ok'})`);
  }
  fs.writeFileSync(`./sim_${profile}_${policy}.json`, JSON.stringify(all, null, 1));
  // 표
  for (const r of all) {
    console.log(`\n=== ${SKILL[profile].name} / ${policy} / run ${r.run} ===`);
    console.log('day | score/target | throws | chips | stolen | raidKills | cpc | +coins | coins | bought | turrets');
    for (const d of r.days) console.log(`${d.day} | fish~${d.diag && d.diag.fish} swim${d.diag && d.diag.swim} big${d.diag && d.diag.big} vals[${d.diag && d.diag.vals}] | ${d.score}/${d.target}${d.fail ? ' FAIL' : ''} | ${d.throws} | ${d.chips ?? ''} | ${d.stolen} | ${d.kills} | ${d.cpc ?? ''} | ${d.gain ?? ''} | ${d.coins ?? ''} | ${(d.bought || []).join(',')} | ${d.tur || ''}`);
    if (r.errs.length) console.log('errors', r.errs);
  }
  await b.close();
})();
