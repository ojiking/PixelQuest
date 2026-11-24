// 영구 성장(로그라이트 메타) 저장/계산
import { PLAYER, BOT, UPGRADES } from './config.js';

const KEY = 'pixelquest_meta_v1';
const DEFAULT = () => ({ scrap: 0, up: {}, runs: 0, wins: 0, bestStage: 0 });

export function loadMeta() {
  try { return { ...DEFAULT(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return DEFAULT(); }
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
  return {
    player: { maxHp: PLAYER.hp + 15 * L('p_hp'), power: 1 + 0.08 * L('p_pow') },
    bot: {
      maxHp: BOT.hp + 20 * L('b_hp'),
      power: 1 + 0.15 * L('b_pow'),
      speedMul: 1,
      tactics: 1 + L('b_ai'),
      spin: L('b_spin') > 0,
      rescue: L('b_rescue') > 0,
    },
  };
}

export function botLevel(meta) {
  return 1 + ['b_hp', 'b_pow', 'b_ai', 'b_spin', 'b_rescue'].reduce((s, id) => s + L0(meta, id), 0);
}
const L0 = (m, id) => m.up[id] || 0;
