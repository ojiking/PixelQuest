// 동료 로봇 '볼트' — 전술(돌격/호위/협공)과 업그레이드로 행동이 달라짐
import { Actor } from './actor.js';
import { BOT, LANE } from './config.js';
import { clamp } from './math.js';

export class Companion extends Actor {
  constructor(game, stats) {
    super(game, stats.model, { hp: stats.maxHp, team: 'hero', x: 1.6, z: 0.9, scale: stats.scale });
    this.stats = stats;
    this.power = stats.power;
    this.atkSpeed = stats.speedMul;
    this.speed = stats.speed * stats.speedMul;
    this.blade = stats.blade;
    this.dmgTakenMul = stats.dmgTaken;
    this.bashCd = 3;
    this.tactic = 0;
    this.target = null;
    this.think = 0;
    this.comboIdx = 0;
    this.cool = 0;
    this.spinCd = 2;
    this.koT = 0;
    this.getupInvuln = 0.6;
  }

  perk(id) { return id === 'blast' && this.game.run.perks.has('blast'); }
  get tacticDef() { return BOT.tactics[this.tactic]; }

  update(dt) {
    const g = this.game;
    this.physics(dt);
    if (this.state === 'ko') {
      this.koT -= dt;
      if (this.koT <= 0) {
        this.hp = Math.round(this.maxHp * BOT.koReviveRatio);
        this.setState('getup');
        g.say(this, '자가 수리 완료!');
      }
      this.pose(dt); return;
    }
    if (this.state === 'repair') {
      if (this.st > 1.2) { g.revivePlayer(); this.setState('idle'); }
      this.vx = this.vz = 0;
      this.pose(dt); return;
    }
    if (this.updateCommon(dt)) { this.pose(dt); return; }
    if (this.state === 'attack') { this.updateAttack(dt); this.pose(dt); return; }

    this.cool -= dt; this.spinCd -= dt; this.bashCd -= dt; this.think -= dt;
    const p = g.player;
    if (!this.grounded) { this.state = 'jump'; this.pose(dt); return; }
    // 너무 멀어지면 (틈 건너편 등) 부스터로 플레이어 곁에 복귀
    if (Math.abs(this.x - p.x) > 11 && p.grounded && !g.rescuePending) {
      const s = g.stage.safeSpot(p.x - p.facing * 1.2, p.z + 0.6);
      g.debris.puff(this.x, 0.5, this.z, [0xff8a1f, 0xffe14a, 0x888888], 12, 2, .15, .4, -0.5);
      this.x = s.x; this.z = s.z; this.y = g.floorAt(s.x, s.z); this.vx = this.vz = 0;
      g.say(this, '부스터 점프!');
    }

    // 구조 프로토콜: 쓰러진 플레이어에게 달려감
    if (g.rescuePending) {
      const arrived = this.moveToward(p.x - 0.75 * Math.sign(p.x - this.x || 1), p.z, this.speed * 1.2);
      this.facing = p.x > this.x ? 1 : -1;
      if (arrived || (Math.abs(p.x - this.x) < 0.9 && Math.abs(p.z - this.z) < 0.4)) {
        this.vx = this.vz = 0;
        this.setState('repair');
        g.say(this, '구조 프로토콜 가동!');
      } else { this.state = 'walk'; this.walkPhase += dt * 12; }
      this.pose(dt); return;
    }

    if (this.think <= 0) { this.think = 0.25; this.target = this.chooseTarget(); }
    const t = this.target;
    let tx, tz;
    if (t) {
      let side = this.x < t.x ? -1 : 1;
      if (this.tacticDef.id === 'pincer') side = p.x < t.x ? 1 : -1;
      tx = t.x + side * 1.0;
      tz = t.z;
      this.facing = t.x > this.x ? 1 : -1;
      const dx = Math.abs(t.x - this.x), dz = Math.abs(t.z - this.z);
      // 방패형: 방패 돌진 (적을 날려 볼링)
      if (this.stats.bash && this.bashCd <= 0 && dz < 0.4 && dx > 1.2 && dx < 3.8) {
        this.bashCd = BOT.bashCooldown;
        this.startAttack('botBash');
        g.say(this, '방패 돌진!');
        this.pose(dt); return;
      }
      if (this.stats.spin && this.spinCd <= 0 && this.nearbyEnemies(1.9) >= 2) {
        this.spinCd = BOT.spinCooldown;
        this.startAttack('botSpin');
        this.pose(dt); return;
      }
      if (dx < 1.3 && dz < 0.35 && this.cool <= 0) {
        this.startAttack(this.comboIdx < 2 ? 'botJab' : 'botKick');
        this.comboIdx = (this.comboIdx + 1) % 3;
        this.pose(dt); return;
      }
    } else {
      tx = p.x - p.facing * 1.4;
      tz = clamp(p.z + 0.9, LANE.zMin, LANE.zMax);
    }
    const arrived = this.moveToward(tx, tz, this.speed);
    if (arrived) {
      this.state = 'idle';
      if (!t) this.facing = p.facing;
    } else {
      this.state = 'walk';
      this.walkPhase += dt * 12;
      if (!t && Math.abs(this.vx) > 0.3) this.facing = this.vx > 0 ? 1 : -1;
    }
    this.pose(dt);
  }

  nearbyEnemies(r) {
    let n = 0;
    for (const e of this.game.enemies) if (e.alive && Math.abs(e.x - this.x) < r && Math.abs(e.z - this.z) < 0.9) n++;
    return n;
  }

  chooseTarget() {
    const g = this.game, p = g.player;
    const list = g.enemies.filter(e => e.alive && Math.abs(e.x - g.camX) < g.viewHalf + 0.5);
    if (!list.length) return null;
    const nearest = (from) => list.reduce((b, e) => (Math.hypot(e.x - from.x, e.z - from.z) < Math.hypot(b.x - from.x, b.z - from.z) ? e : b));
    switch (this.tacticDef.id) {
      case 'guard': {
        const near = list.filter(e => Math.abs(e.x - p.x) < 4.5);
        if (!near.length) return null;
        const threats = near.filter(e => e.target === p);
        const pool = threats.length ? threats : near;
        return pool.reduce((b, e) => (Math.abs(e.x - p.x) < Math.abs(b.x - p.x) ? e : b));
      }
      case 'pincer':
        if (p.lastTarget && p.lastTarget.alive && p.lastTargetT > 0) return p.lastTarget;
        return nearest(p);
      default:
        return nearest(this);
    }
  }

  onAttackEnd(interrupted) {
    if (interrupted) return;
    this.cool = (this.comboIdx === 0 ? 0.6 : 0.1) / this.atkSpeed;
  }

  onHitLanded() { this.game.addCombo(true); }
}
