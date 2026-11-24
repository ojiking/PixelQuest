// 적 — 외형(타입)마다 고유 AI. 부위가 파괴되면 행동이 바뀜 (팔 없음 → 발차기, 다리 없음 → 돌진 불가)
import { Actor } from './actor.js';
import { ENEMIES, ATTACKS, LANE, WEAPONS } from './config.js';
import { clamp, rand } from './math.js';

export class Enemy extends Actor {
  constructor(game, type, x, z, hpMul = 1) {
    const def = ENEMIES[type];
    super(game, def.model, { hp: Math.round(def.hp * hpMul), scale: def.scale, team: 'enemy', x, z, destructible: true, poise: def.poise });
    this.def = def;
    this.type = type;
    this.isBoss = !!def.boss;
    this.cool = rand(0.6, 1.4);
    this.think = 0;
    this.target = null;
    this.slot = rand(-1, 1);
    this.wait = rand(2.3, 3.4);
    this.getupInvuln = 0.3;
    this.phase2 = false;
    this.facing = x > game.player.x ? -1 : 1;
    this.goItem = null;
    // 처음부터 무기를 들고 나오는 적
    if (def.armed && Math.random() < def.armed.chance) {
      const t = def.armed.types[Math.floor(Math.random() * def.armed.types.length)];
      this.weapon = { type: t, dur: Math.ceil(WEAPONS[t].dur * 0.6) };
    }
  }

  // 근처에 떨어진 무기를 찾아 주우러 감 (전기톱 제외)
  seekWeapon() {
    if (!this.def.pickup || this.weapon || !this.hasArms() || this.goItem) return;
    const g = this.game;
    let best = null, bd = 4.5;
    for (const it of g.items) {
      if (it.kind !== 'weapon' || it.type === 'chainsaw' || WEAPONS[it.type].noPickup || it.claimed || it.remove || it.vy !== 0) continue;
      // 올라갈 수 없는 블록 위·낭떠러지 근처 무기는 무시
      const fl = g.floorAt(it.x, it.z);
      if (fl < -50 || fl > this.y + 0.4) continue;
      const d = Math.hypot(it.x - this.x, (it.z - this.z) * 1.3);
      if (d < bd) { best = it; bd = d; }
    }
    if (best) { best.claimed = this; this.goItem = best; this.goItemT = 0; }
  }

  updatePickup(dt = 1 / 60) {
    const it = this.goItem;
    if (!it) return false;
    if (it.remove || this.weapon || !this.hasArms()) { if (it.claimed === this) it.claimed = null; this.goItem = null; return false; }
    // 3초 안에 못 주우면 포기 (그 무기는 다시 노리지 않음)
    this.goItemT = (this.goItemT || 0) + dt;
    if (this.goItemT > 3) { it.claimed = 'blocked'; this.goItem = null; return false; }
    if (Math.hypot(it.x - this.x, it.z - this.z) < 0.6) {
      it.remove = true;
      this.weapon = { type: it.type, dur: it.dur };
      this.goItem = null;
      this.game.texts.add(this.x, 2.3 * this.scale, this.z, `${WEAPONS[it.type].name} 획득!`, 'hurt');
      this.game.sfx?.('pickup');
      return false;
    }
    this.moveToward(it.x, it.z, this.def.speed * 1.2);
    this.facing = it.x > this.x ? 1 : -1;
    return true;
  }

  onHitLanded(v, d) {
    if (d.weapon && this.weapon) {
      this.weapon.dur -= 1;
      if (this.weapon.dur <= 0) this.game.breakWeapon(this);
    }
  }

  update(dt) {
    const g = this.game;
    this.physics(dt);
    if (this.updateCommon(dt)) { g.releaseToken(this); this.pose(dt); return; }
    if (this.state === 'attack') {
      if (this.attack.def.dash && this.attackPhase() === 'startup') this.vx = 0;
      this.updateAttack(dt);
      this.x = clamp(this.x, g.camX - g.viewHalf - 3, g.camX + g.viewHalf + 3);
      this.pose(dt); return;
    }
    this.cool -= dt; this.think -= dt;
    if (this.think <= 0) {
      this.think = rand(0.6, 1.0);
      this.target = g.pickTarget(this);
      if (Math.random() < 0.3) { this.slot = rand(-1, 1); this.wait = rand(2.3, 3.4); }
    }
    const t = this.target;
    if (!t || !t.alive) { this.vx = this.vz = 0; this.state = 'idle'; this.pose(dt); return; }

    // 무기 줍기가 우선
    if (this.think > 0.55) this.seekWeapon();
    if (this.updatePickup(dt)) {
      this.state = !this.grounded ? 'jump' : 'walk';
      this.walkPhase += dt * 10 * this.legFactor();
      this.pose(dt); return;
    }
    this.wantMove = false;
    let ai = this.def.ai;
    // 부위 파괴에 따른 행동 변화
    if (ai === 'kiter' && !this.hasArms()) ai = 'brawler';
    if (ai === 'charger' && this.legCount() < 2) ai = 'brawler';
    this[ai](dt, t);

    this.x = clamp(this.x, g.camX - g.viewHalf - 3, g.camX + g.viewHalf + 3);
    if (this.state !== 'attack') {
      const moving = this.wantMove || Math.abs(this.vx) + Math.abs(this.vz) > 0.2;
      this.state = !this.grounded ? 'jump' : moving ? 'walk' : 'idle';
      if (moving) this.walkPhase += dt * 10 * Math.max(0.7, this.legFactor());
    }
    this.pose(dt);
  }

  face(t) { this.facing = t.x > this.x ? 1 : -1; }

  // 화면 안에 margin만큼 들어와 있는가
  onScreen(margin = 0.8) {
    const g = this.game;
    return Math.abs(this.x - g.camX) < g.viewHalf - margin;
  }

  // 목표 x를 화면 안쪽으로 제한 (화면 밖에서 맴돌며 공격하지 않도록)
  inScreen(tx, margin = 1.0) {
    const g = this.game;
    return clamp(tx, g.camX - g.viewHalf + margin, g.camX + g.viewHalf - margin);
  }

  // 팔/다리가 없으면 쓸 수 있는 공격으로 대체
  doAttack(key) {
    // 무기를 들고 있으면 무기로 휘두름 (덩치의 내려찍기는 유지)
    if (this.weapon && this.hasArms() && key !== 'eSlam' && key !== 'eCharge' && key !== 'eFuse') {
      const horiz = ['bat', 'chain', 'machete', 'whip'].includes(this.weapon.type);
      key = horiz ? 'eWeaponH' : 'eWeapon';
    }
    const d = ATTACKS[key];
    if (d.needArms && !this.hasArms()) key = 'eKick';
    if (d.needLegs && this.legCount() < 2) key = this.hasArms() ? 'ePunch' : 'eKick';
    this.startAttack(key);
    if (ATTACKS[key].telegraph) this.game.debris.sparks(this.x, 2.1 * this.scale, this.z, 0xff4a2a, 5, 1.5);
  }

  brawler(dt, t) {
    const g = this.game;
    const side = this.x < t.x ? -1 : 1;
    const tok = g.requestToken(this, t);
    const want = tok ? 0.85 * this.scale + 0.2 : this.wait;
    const tz = tok ? t.z : clamp(t.z + this.slot * 1.6, LANE.zMin, LANE.zMax);
    this.moveToward(tok ? t.x + side * want : this.inScreen(t.x + side * want, 0.6), tz, this.def.speed * (tok ? 1 : 0.65));
    this.face(t);
    const dx = Math.abs(t.x - this.x), dz = Math.abs(t.z - this.z);
    if (tok && dx < 1.25 * this.scale + 0.15 && dz < 0.38 && this.cool <= 0) {
      let key = this.def.attacks[0];
      if (this.type === 'brute') key = Math.random() < 0.55 ? 'eSlam' : 'ePunch';
      this.doAttack(key);
      this.cool = rand(1.0, 1.9);
    }
  }

  kiter(dt, t) {
    const side = this.x < t.x ? -1 : 1;
    const dx = Math.abs(t.x - this.x), dz = Math.abs(t.z - this.z);
    let tx = t.x + side * (4.2 + (this.slot + 1) * 0.9); // 개체마다 선호 거리가 달라 한 줄로 뭉치지 않음
    let sp = this.def.speed;
    if (dx < 2.2) { tx = this.x + side * 3; sp *= 1.3; }
    this.moveToward(this.inScreen(tx, 1.2), t.z, sp);
    this.face(t);
    if (dz < 0.45 && dx > 1.6 && dx < 8 && this.cool <= 0 && this.onScreen(1.0)) {
      this.doAttack('eThrow');
      this.cool = rand(1.8, 2.8);
    }
  }

  charger(dt, t) {
    const side = this.x < t.x ? -1 : 1;
    const dx = Math.abs(t.x - this.x), dz = Math.abs(t.z - this.z);
    this.moveToward(this.inScreen(t.x + side * 5, 1.2), t.z, this.def.speed);
    this.face(t);
    if (dz < 0.4 && dx > 2.2 && dx < 8.5 && this.cool <= 0 && this.onScreen(1.0)) {
      this.doAttack('eCharge');
      this.cool = rand(2.5, 3.5);
    }
  }

  rusher(dt, t) {
    const dx = Math.abs(t.x - this.x), dz = Math.abs(t.z - this.z);
    this.moveToward(t.x, t.z, this.def.speed);
    this.face(t);
    if (dx < 1.0 && dz < 0.45) this.doAttack('eFuse');
  }

  boss(dt, t) {
    const g = this.game;
    if (!this.phase2 && this.hp < this.maxHp * 0.5) {
      this.phase2 = true;
      this.atkSpeed = 1.25;
      g.banner('철거반장 분노! 지원 병력 호출');
      g.spawnEnemy('grunt', -1); g.spawnEnemy('grunt', 1); g.spawnEnemy('bomber', 1);
    }
    const side = this.x < t.x ? -1 : 1;
    const dx = Math.abs(t.x - this.x), dz = Math.abs(t.z - this.z);
    this.face(t);
    const cd = this.phase2 ? 0.75 : 1;
    if (dz < 0.5 && dx < 1.9 * this.scale && this.cool <= 0) {
      this.doAttack('eSlam'); this.cool = rand(1.2, 2.0) * cd;
    } else if (dz < 0.45 && dx > 3 && this.cool <= 0 && this.onScreen(1.0)) {
      this.doAttack(Math.random() < 0.6 ? 'eCharge' : 'eThrow'); this.cool = rand(1.4, 2.2) * cd;
    } else {
      this.moveToward(t.x + side * 1.7 * this.scale, t.z, this.def.speed);
    }
  }

  onAttackEnd() { this.game.releaseToken(this); }
}
