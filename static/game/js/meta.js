// 영구 성장(로그라이트 메타) 저장/계산
import { PLAYER, BOT, UPGRADES, BASE_UNLOCKS, HEAT, TROPHIES, TROPHY_SLOTS } from './config.js';

const KEY = 'pixelquest_meta_v1';
const DEFAULT = () => ({ scrap: 0, up: {}, runs: 0, wins: 0, bestStage: 0, botClass: 'attack', heat: 0, bestChapter: 0, stats: {}, trophies: {}, equip: [], title: null, seen: [] });

export function loadMeta() {
  let m;
  try { m = { ...DEFAULT(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { m = DEFAULT(); }
  // 예전 볼트 업그레이드를 새 체계로 옮김
  const mv = { b_hp: 't_hp', b_pow: 'a_pow', b_spin: 'a_spin' };
  for (const [o, n] of Object.entries(mv)) if (m.up[o]) { m.up[n] = Math.max(m.up[n] || 0, m.up[o]); delete m.up[o]; }
  // 최대 레벨이 줄어든 업그레이드: 넘친 레벨은 부품으로 돌려줌
  for (const u of UPGRADES) {
    const lv = m.up[u.id] || 0;
    if (lv > u.max) { m.scrap += u.cost.slice(u.max, lv).reduce((a, b) => a + b, 0); m.up[u.id] = u.max; }
  }
  m.heat = Math.min(m.heat || 0, heatMax(m));
  m.stats ||= {}; m.trophies ||= {}; m.equip ||= []; m.seen ||= [];
  return m;
}

// 판에서 쌓인 기록을 누적하고 새로 얻은 전리품 목록을 돌려줌
export function mergeRunStats(m, run) {
  const s = m.stats;
  for (const [k, v] of Object.entries(run.stat || {})) s[k] = (k.startsWith('boss_') || k === 'clutch' || k === 'bath') ? Math.max(s[k] || 0, 0) + v : (s[k] || 0) + v;
  run.stat = {};
  s.runs = m.runs;
  for (const t of run.seen || []) if (!m.seen.includes(t)) m.seen.push(t);
  const got = [];
  for (const t of TROPHIES) if (!m.trophies[t.id] && t.test(s)) { m.trophies[t.id] = true; got.push(t); }
  return got;
}

export function toggleEquip(m, id) {
  const i = m.equip.indexOf(id);
  if (i >= 0) m.equip.splice(i, 1);
  else if (m.trophies[id] && m.equip.length < TROPHY_SLOTS) m.equip.push(id);
  saveMeta(m);
}

export function heatMax(m) { return Math.min(HEAT.max, m.wins || 0); }

// 해금된 콘텐츠 (무기 드롭·지역·최종 보스 후보)
export function unlocked(meta) {
  const u = { weapons: [...BASE_UNLOCKS.weapons], biomes: [...BASE_UNLOCKS.biomes], bosses: [...BASE_UNLOCKS.bosses] };
  for (const up of UPGRADES) {
    if (!up.unlock || !(meta.up[up.id] > 0)) continue;
    if (up.unlock.weapons) u.weapons.push(...up.unlock.weapons);
    if (up.unlock.biome) u.biomes.push(up.unlock.biome);
    if (up.unlock.boss) u.bosses.push(up.unlock.boss);
  }
  return u;
}

export function saveMeta(m) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* 저장 불가 환경 */ }
}

export function resetMeta() { const m = DEFAULT(); saveMeta(m); return m; }

export function level(meta, id) { return meta.up[id] || 0; }

export function upgradeCost(meta, u) {
  const lv = level(meta, u.id);
  return lv >= u.max ? null : u.cost[lv];
}

export function buyUpgrade(meta, id) {
  const u = UPGRADES.find(x => x.id === id);
  const cost = upgradeCost(meta, u);
  if (cost == null || meta.scrap < cost) return false;
  meta.scrap -= cost;
  meta.up[id] = level(meta, id) + 1;
  saveMeta(meta);
  return true;
}

export function computeStats(meta) {
  const L = id => level(meta, id);
  const cls = meta.botClass === 'tank' ? 'tank' : 'attack';
  const C = BOT.classes[cls];
  const tank = cls === 'tank';
  // 장착한 전리품 효과
  const fx = new Set((meta.equip || []).filter(id => meta.trophies?.[id]).map(id => TROPHIES.find(t => t.id === id)?.fx).filter(Boolean));
  return {
    title: meta.title && meta.trophies?.[meta.title] ? TROPHIES.find(t => t.id === meta.title)?.name : null,
    unlocked: unlocked(meta),
    heat: meta.heat || 0,
    player: {
      maxHp: PLAYER.hp + 15 * L('p_hp') + (fx.has('hp15') ? 15 : 0), power: 1 + 0.08 * L('p_pow'),
      speedMul: 1 + 0.05 * L('p_speed'), regen: 0.1 * L('p_regen'), scrapMul: 1 + 0.1 * L('p_scrap'),
      wpow: 1 + 0.1 * L('p_wpow'), wspd: 1 + 0.06 * L('p_wspd'), durMul: 1 + 0.15 * L('p_dur'), throwMul: 1 + 0.2 * L('p_throw'),
      flykick: L('p_flykick') > 0, djump: L('p_djump') > 0, stomp: L('p_stomp') > 0, otg: L('p_otg') > 0,
      combo4: L('p_combo') > 0, dashLv: L('p_dash'), backMul: 1.5 + 0.25 * L('p_back'), fx,
    },
    bot: {
      cls, model: C.model, scale: C.scale,
      maxHp: C.hp + (tank ? 30 * L('t_hp') : 0),
      power: C.power * (tank ? 1 : 1 + 0.15 * L('a_pow')),
      speedMul: tank ? 1 : 1 + 0.1 * L('a_speed'),
      speed: C.speed,
      tactics: 1 + L('b_ai'),
      rescue: L('b_rescue') > 0,
      spin: !tank && L('a_spin') > 0,
      blade: !tank && L('a_blade') > 0,
      taunt: tank && L('t_taunt') > 0,
      bash: tank && L('t_bash') > 0,
      dmgTaken: tank ? 1 - 0.12 * L('t_guard') : 1,
    },
  };
}

export function botLevel(meta) {
  const cls = meta.botClass === 'tank' ? 'tank' : 'attack';
  return 1 + UPGRADES.filter(u => u.group === '볼트' && (!u.cls || u.cls === cls)).reduce((s, u) => s + (meta.up[u.id] || 0), 0);
}
