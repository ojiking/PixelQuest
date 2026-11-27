// 판정 / 데미지 / 부위 파괴 규칙
import { WEAPONS, FIST_SEVER, BLOOD } from './config.js';
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
  let dmg = d.dmg, sever = FIST_SEVER, knock = d.knock, zone = d.zone, mode = d.mode, fling = 1, bisect = 0;
  const held = d.weapon ? att.heldDef() : null;
  if (held) {
    const w = held;
    dmg = w.dmg * d.dmg; sever = w.sever; knock *= w.knock;
    zone = w.zone ?? zone; mode = w.mode; fling = w.fling ?? 1;
    if (d.finisher || d.hold) bisect = w.bisect ?? 0;
  }
  if (!held && att.blade) { mode = 'cut'; sever = 2.2; }
  if (d.sever) sever = d.sever; // 공격형 볼트의 절단 블레이드
  dmg *= att.power;
  if (d.finisher && att.perk('finisher')) dmg *= 1.4;
  if (held && att.wpow) dmg *= att.wpow;                       // 무기 숙련
  if (d.anim === 'dashAtk' && att.dashLv) dmg *= 1 + 0.25 * att.dashLv; // 대쉬 숙련
  if (att.perk('sever')) sever *= 1.6;
  if (att.st8?.fx?.has('clutch') && att.hp < att.maxHp * 0.25) dmg *= 1.35;   // 전리품: 구사일생
  const dir = d.aoe ? (sign(v.x - att.x) || att.facing) : att.facing;
  return {
    attacker: att, dmg, knock, dir, zone, knockdown: !!d.knockdown, sever, mode, fling, bisect,
    launch: d.launch, hitstun: d.hitstun, ignite: d.ignite, otg: d.otg || att.otgAll, otgWeak: !d.otg && att.otgAll, hitstop: d.hitstop ?? .05, shake: d.shake ?? (d.knockdown ? .12 : .04),
  };
}

export function tryHits(game, att, a) {
  const d = a.def;
  let reach = d.range[1];
  if (d.weapon && att.heldDef()) reach += att.heldDef().reach;
  reach *= att.scale;
  const r0 = d.range[0] * att.scale;
  for (const v of game.actors) {
    if (v.team === att.team || a.hit.has(v)) continue;
    if (!inBox(att, v, d, r0, reach, false)) continue;
    const hit = buildHit(att, d, v);
    if (d.shot) hit.dmg *= Math.max(0.68, 1 - Math.abs(v.x - att.x) / reach * 0.32); // 산탄: 멀수록 약함
    if (applyHit(game, v, hit)) {
      a.hit.add(v);
      att.onHitLanded?.(v, d, hit);
    }
  }
  if (att.team === 'hero' && d.anim === 'golf') game.gibs.golfShot(att, a, r0, reach, d.depth);
  if (att.team === 'hero') {
    for (const p of game.props) {
      if (p.broken || a.hit.has(p)) continue;
      if (!inBox(att, p, d, r0, reach, true)) continue;
      a.hit.add(p);
      p.hit(game, buildHit(att, d, p).dmg, att.facing);
    }
    // 주차된 차: 차체에서 공격자에 가장 가까운 지점을 기준으로 판정
    if (game.stage.biome.city && att.y < 1.6) {
      for (const c of game.cars()) {
        if (a.hit.has(c)) continue;
        const t = { x: Math.max(c.x, Math.min(att.x, c.x + c.len)), z: Math.max(c.z, Math.min(att.z, c.z + c.dep)), radius: 0.1 };
        if (!inBox(att, t, d, r0, reach, true)) continue;
        a.hit.add(c);
        game.hitCar(c, buildHit(att, d, t).dmg, att.facing);
      }
    }
  }
}

export function applyHit(game, v, h) {
  if (v.dead || v.invuln > 0 || v.state === 'ko') return false;
  if (v.attack?.def.armor && v.attack.t < v.attack.def.startup + v.attack.def.active) return false;   // 숄더 태클 돌진 중엔 무적
  if ((v.state === 'down' || v.state === 'getup' || v.state === 'ko') && !h.explosion && !(h.otg && v.state === 'down')) return false;
  let dmg = h.dmg;
  let back = false;
  // 맨홀 방패병: 정면 공격을 막음 (위에서, 뒤에서, 폭발·화염은 통과). 강한 넘어뜨리기 공격은 가드 브레이크
  if (v.shieldUp?.() && h.attacker && !h.explosion && !h.ignite && !h.grab && v.facing === -h.dir && v.guardBroken <= 0
      && h.attacker.y < v.y + 0.7 && v.state !== 'down') {
    if (h.knockdown && Math.abs(h.knock) >= 5) {
      v.guardBroken = 1.2; dmg *= 0.5;
      game.texts.add(v.x, v.y + 2.3 * v.scale, v.z, '가드 브레이크!', 'back');
    } else {
      game.texts.add(v.x, v.y + 2.2 * v.scale, v.z, '막음!', 'item');
      game.debris.sparks(v.x + v.facing * 0.45, v.y + 1.0 * v.scale, v.z + 0.1, 0xe8f0ff, 8, 3);
      game.sfx?.('clang');
      v.cool = Math.min(v.cool, 0.25); // 막고 나서 바로 반격
      if (h.attacker.team === 'hero') h.attacker.vx = -h.dir * 2.5;
      return true;
    }
  }
  // 플레이어가 맨홀 뚜껑을 들고 있으면 정면 피해 감소
  const vw = v.weapon && WEAPONS[v.weapon.type];
  if (vw?.guard && !h.explosion && v.facing === -h.dir) { dmg *= vw.guard; game.debris.sparks(v.x + v.facing * .4, v.y + 1, v.z + .1, 0xe8f0ff, 5, 2); }
  if (h.attacker && !h.explosion && v.facing === h.dir && v.state !== 'down') { dmg *= h.attacker.backMul ?? 1.5; back = true; }
  if (v.state === 'down' && h.otgWeak) dmg *= 0.6;          // 쓰러진 적 공격 (업그레이드)
  if (h.explosion && v.perk('blast')) dmg *= 0.4;
  dmg *= v.dmgTakenMul ?? 1;
  dmg = Math.max(1, Math.round(dmg));
  v.hp -= dmg;
  v.flash = h.ignite ? 0 : 0.09; // 화염은 하얀 번쩍임 대신 불타는 색이 보이게
  game.onDamage(v, dmg, h, back);
  if (h.ignite && !v.dead) { v.burnT = Math.max(v.burnT || 0, h.ignite); v.burnBy = h.attacker; }

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
  if (!h.explosion) game.sfx?.(h.mode === 'cut' || h.mode === 'saw' ? 'cut' : h.mode === 'crush' ? 'crush' : (dmg >= 15 || h.knockdown) ? 'heavy' : v.team === 'hero' ? 'hurt' : 'hit');
  game.debris.sparks(v.x - h.dir * 0.1, v.y + 1.1 * v.scale, v.z + 0.3, back ? 0xffb03a : 0xfff3a0, back ? 14 : 8);
  // 날붙이/톱으로 벨 때마다 붉은 블록이 튐
  if (v.destructible && (h.mode === 'cut' || h.mode === 'saw')) game.bleed(v.x - h.dir * 0.1, v.y + 1.1 * v.scale, v.z + 0.2, h.dir, h.mode === 'saw' ? 5 : 8);
  // 되튀는 피: 뱀돌이가 바짝 붙어 베거나 세게 때리면 피가 뱀돌이 쪽으로도 튐 (몸에 묻음)
  if (v.destructible && h.attacker === game.player && (h.mode === 'cut' || h.mode === 'saw' || dmg >= 12) && Math.abs(v.x - h.attacker.x) < 2.4) game.backsplash(v, h.attacker, BLOOD.backsplash);
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

  if (v.mounted && v.isBoss) return true;   // 보스 오토바이: 슈퍼아머 (체력이 깎이면 스스로 내림)
  if (v.mounted && (knockdown || dmg >= 14 || h.explosion)) game.dismount(v, h.dir);
  else if (v.mounted) { v.bikePhase = 'line'; v.bikeT = 0; v.revving = false; }
  v.interrupt();
  if (v.grabbing) game.releaseGrab(v);                                          // 잡고 있다가 맞으면 놓침
  if (v.grabbedBy && !h.grab && (knockdown || h.explosion)) game.releaseGrab(v.grabbedBy); // 잡힌 적이 다른 공격에 날아감
  if (v.carry?.kind === 'barrel' || v.carry?.kind === 'moto') game.dropCarry(v);
  if (!v.blocks) v.facing = -h.dir; // 방패병은 맞아도 바로 돌아서지 않음 (뒤잡기 유지)
  if (knockdown) {
    v.setState('down');
    v.downT = 0;
    v.vx = h.dir * h.knock * (h.launch && h.launch > 5 ? 0.4 : 1);
    v.vy = h.launch ?? 5.5;
    // 세게 맞으면 날아가는 몸이 됨 → 다른 적과 충돌
    if (h.knock >= 7.5 && v.team === 'enemy') v.flung = { owner: h.attacker, hit: new Set() };
    v.y = Math.max(v.y, 0.01);
  } else {
    v.setState('hurt');
    v.hitstun = h.hitstun ?? (v.isBoss ? 0.18 : v.team === 'hero' ? 0.24 : 0.32);
    v.vx = h.dir * h.knock;
    if (!v.grounded) { v.vy = Math.max(v.vy, 2); }
  }
  return true;
}
