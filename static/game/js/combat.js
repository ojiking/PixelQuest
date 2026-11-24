// 판정 / 데미지 / 부위 파괴 규칙
import { WEAPONS, FIST_SEVER } from './config.js';
import { sign } from './math.js';

// 공격 zone별로 맞는 부위 확률 (torso = 부위 피해 없음)
const ZONES = {
  high: { head: .3, armF: .1, handF: .12, armB: .1, handB: .12, torso: .26 },
  mid:  { armF: .12, handF: .14, armB: .12, handB: .14, legF: .08, shinF: .08, legB: .08, shinB: .08, torso: .16 },
  low:  { legF: .2, shinF: .3, legB: .2, shinB: .3 },
  head: { head: .6, handF: .08, handB: .08, torso: .24 },
  arms: { armF: .2, handF: .3, armB: .2, handB: .3 },
  all:  { head: .14, armF: .1, handF: .1, armB: .1, handB: .1, legF: .1, shinF: .1, legB: .1, shinB: .1, torso: .06 },
};

function pickPart(v, zone) {
  const w = ZONES[zone] || ZONES.mid;
  let total = 0;
  for (const k in w) if (k === 'torso' || v.parts[k]?.alive) total += w[k];
  let r = Math.random() * total;
  for (const k in w) {
    if (k !== 'torso' && !v.parts[k]?.alive) continue;
    r -= w[k];
    if (r <= 0) return k === 'torso' ? null : k;
  }
  return null;
}

function inBox(att, v, d, r0, reach, isProp) {
  if (Math.abs(v.z - att.z) > d.depth * (isProp ? 1.3 : 1)) return false;
  if (!isProp && Math.abs(v.y - att.y) > 1.3) return false;
  const rad = v.radius ?? 0.4;
  if (d.aoe) return Math.abs(v.x - att.x) <= reach + rad;
  const dx = (v.x - att.x) * att.facing;
  return dx >= r0 - rad && dx <= reach + rad;
}

function buildHit(att, d, v) {
  let dmg = d.dmg, sever = FIST_SEVER, knock = d.knock, zone = d.zone, mode, fling = 1, bisect = 0;
  if (d.weapon && att.weapon) {
    const w = WEAPONS[att.weapon.type];
    dmg = w.dmg * d.dmg; sever = w.sever; knock *= w.knock;
    zone = w.zone ?? zone; mode = w.mode; fling = w.fling ?? 1;
    if (d.finisher || d.hold) bisect = w.bisect ?? 0;
  }
  dmg *= att.power;
  if (d.finisher && att.perk('finisher')) dmg *= 1.4;
  if (att.perk('sever')) sever *= 1.6;
  const dir = d.aoe ? (sign(v.x - att.x) || att.facing) : att.facing;
  return {
    attacker: att, dmg, knock, dir, zone, knockdown: !!d.knockdown, sever, mode, fling, bisect,
    launch: d.launch, hitstun: d.hitstun, hitstop: d.hitstop ?? .05, shake: d.shake ?? (d.knockdown ? .12 : .04),
  };
}

export function tryHits(game, att, a) {
  const d = a.def;
  let reach = d.range[1];
  if (d.weapon && att.weapon) reach += WEAPONS[att.weapon.type].reach;
  reach *= att.scale;
  const r0 = d.range[0] * att.scale;
  for (const v of game.actors) {
    if (v.team === att.team || a.hit.has(v)) continue;
    if (!inBox(att, v, d, r0, reach, false)) continue;
    const hit = buildHit(att, d, v);
    if (applyHit(game, v, hit)) {
      a.hit.add(v);
      att.onHitLanded?.(v, d, hit);
    }
  }
  if (att.team === 'hero') {
    for (const p of game.props) {
      if (p.broken || a.hit.has(p)) continue;
      if (!inBox(att, p, d, r0, reach, true)) continue;
      a.hit.add(p);
      p.hit(game, buildHit(att, d, p).dmg, att.facing);
    }
  }
}

export function applyHit(game, v, h) {
  if (v.dead || v.invuln > 0 || v.state === 'ko') return false;
  if ((v.state === 'down' || v.state === 'getup' || v.state === 'ko') && !h.explosion) return false;
  let dmg = h.dmg;
  let back = false;
  if (h.attacker && !h.explosion && v.facing === h.dir) { dmg *= 1.5; back = true; }
  if (h.explosion && v.perk('blast')) dmg *= 0.4;
  dmg = Math.max(1, Math.round(dmg));
  v.hp -= dmg;
  v.flash = 0.09;
  game.onDamage(v, dmg, h, back);

  if (v.destructible) {
    const k = pickPart(v, h.zone);
    if (k) {
      const p = v.parts[k];
      p.hp -= dmg * h.sever;
      if (p.hp <= 0) game.severPart(v, k, h.dir, h);
    }
  }
  game.hitstop(h.hitstop);
  game.shake(h.shake);
  game.debris.sparks(v.x - h.dir * 0.1, v.y + 1.1 * v.scale, v.z + 0.3, back ? 0xffb03a : 0xfff3a0, back ? 14 : 8);
  // 날붙이/톱으로 벨 때마다 붉은 블록이 튐
  if (v.destructible && (h.mode === 'cut' || h.mode === 'saw')) game.bleed(v.x - h.dir * 0.1, v.y + 1.1 * v.scale, v.z + 0.2, h.dir, h.mode === 'saw' ? 5 : 8);
  if (v.dead) return true;
  if (v.hp <= 0) { game.kill(v, h); return true; }

  let armored = false;
  if (v.poise && v.state === 'attack') {
    v.armorAcc += dmg;
    armored = v.armorAcc < v.poise;
  }
  let knockdown = h.knockdown;
  if (v.isBoss && knockdown && dmg < 20 && !h.explosion) knockdown = false;
  if (armored) return true;

  v.interrupt();
  v.facing = -h.dir;
  if (knockdown) {
    v.setState('down');
    v.downT = 0;
    v.vx = h.dir * h.knock * (h.launch ? 0.4 : 1);
    v.vy = h.launch ?? 5.5;
    v.y = Math.max(v.y, 0.01);
  } else {
    v.setState('hurt');
    v.hitstun = h.hitstun ?? (v.isBoss ? 0.18 : 0.32);
    v.vx = h.dir * h.knock;
    if (v.y > 0) { v.vy = Math.max(v.vy, 2); }
  }
  return true;
}
