// 적 — 외형(타입)마다 고유 AI. 부위가 파괴되면 행동이 바뀜 (팔 없음 → 발차기, 다리 없음 → 돌진 불가)
import { Actor } from './actor.js';
import { ENEMIES, ATTACKS, LANE, WEAPONS } from './config.js';
import { clamp, rand } from './math.js';
import { weaponOk } from './game.js';

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
    this.blocks = !!def.shield;      // 맨홀 방패로 정면을 막음
    this.guardBroken = 0; this.turnT = 0; this.dodgeCd = 1; this.flip = 0; this.flipping = false;
    this.mounted = !!def.bike;       // 폭주족: 오토바이에 탄 채 등장
    if (def.katana) this.weapon = { type: 'katana', dur: 999 };
    if (def.saw) this.weapon = { type: 'chainsaw', dur: 9999 }; // 팔에 달린 전기톱 (팔을 자르면 떨어짐)
    // 처음부터 무기를 들고 나오는 적
    const armedTypes = def.armed?.types.filter(weaponOk) ?? [];   // 아직 해금 안 된 무기는 들고 나오지 않음
    if (armedTypes.length && Math.random() < def.armed.chance) {
      const t = armedTypes[Math.floor(Math.random() * armedTypes.length)];
      this.weapon = { type: t, dur: Math.ceil(WEAPONS[t].dur * 0.6) };
    }
  }

  // 근처에 떨어진 무기를 찾아 주우러 감 (전기톱 제외)
  seekWeapon() {
    if (!this.def.pickup || this.mounted || this.weapon || !this.hasArms() || this.goItem || this.game.run.lab) return;
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
    // 멱살 잡힘: 잡은 쪽 앞에 붙어서 꼼짝 못함
    if (this.grabbedBy) {
      const p = this.grabbedBy;
      if (p.grabbing !== this || p.state === 'ko' || p.state === 'down' || p.state === 'hurt') { this.grabbedBy = null; if (p.grabbing === this) p.grabbing = null; this.setState('idle'); }
      else {
        this.x = p.x + p.facing * 0.55 * Math.max(1, this.scale * 0.9); this.z = p.z; this.y = p.y; this.vx = this.vz = this.vy = 0;
        this.facing = -p.facing; if (this.state !== 'hurt') this.setState('hurt'); this.hitstun = 99;
        this.pose(dt); return;
      }
    }
    this.physics(dt);
    if (this.flipping) { this.flip += dt * 13; if (this.grounded) { this.flipping = false; this.flip = 0; } }
    if (this.updateCommon(dt)) { g.releaseToken(this); this.pose(dt); return; }
    // 닌자: 근처에서 플레이어가 공격하려 하면 재주넘기로 회피
    if (this.type === 'ninja') {
      this.dodgeCd -= dt;
      const p = g.player;
      // 플레이어의 공격 하나당 한 번만 회피 판정 (약 45%)
      if (this.grounded && this.dodgeCd <= 0 && (this.state !== 'attack' || this.attackPhase() === 'startup') && p.attack && p.attack !== this.seenAtk && p.attack.t < p.attack.def.startup + 0.06
          && Math.abs(p.x - this.x) < 2.4 && Math.abs(p.z - this.z) < 0.7 && p.facing === Math.sign(this.x - p.x)
          && (this.seenAtk = p.attack) && Math.random() < 0.45) {
        this.ninjaFlip(this.x < p.x ? -1 : 1); this.pose(dt); return;
      }
    }
    if (this.state === 'attack') {
      if ((this.attack.def.dash || this.attack.def.rush) && this.attackPhase() === 'startup') this.vx = 0;
      if (this.attack.def.rush && this.attackPhase() === 'active' && Math.random() < .5) { g.debris.sparks(this.x + this.facing * 1.6 * this.scale, 1.1 * this.scale, this.z + .2, 0xffd27a, 2, 3); }
      this.updateAttack(dt);
      this.x = clamp(this.x, g.camX - g.viewHalf - 3, g.camX + g.viewHalf + 3);
      this.pose(dt); return;
    }
    this.cool -= dt; this.think -= dt;
    if (this.guardBroken > 0) this.guardBroken -= dt;
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

  // 위험 공격 예고: 머리 위 '!' + 청록 불꽃
  warnMark() {
    const g = this.game;
    g.debris.sparks(this.x, 2.1 * this.scale, this.z, 0x7ff6ff, 6, 1.5);
    g.texts.add(this.x, this.y + 2.35 * this.scale, this.z, '!', 'warn');
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
    if (this.weapon && this.hasArms() && !['eSlam', 'eCharge', 'eFuse', 'eShuriken', 'eSlash', 'eBash', 'eSawRush', 'eSawSweep'].includes(key)) {
      const horiz = ['bat', 'chain', 'machete', 'whip'].includes(this.weapon.type);
      key = horiz ? 'eWeaponH' : 'eWeapon';
    }
    const d = ATTACKS[key];
    if (d.needArms && !this.hasArms()) key = 'eKick';
    if (d.needLegs && this.legCount() < 2) key = this.hasArms() ? 'ePunch' : 'eKick';
    this.startAttack(key);
    if (ATTACKS[key].telegraph) this.warnMark();
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

  // 폭주족: 라인을 맞춘 뒤 부릉부릉(예고) → 직선 돌진으로 들이받음 → 지나쳐서 유턴. 떨어지면 맨몸 싸움꾼
  biker(dt, t) {
    const g = this.game;
    if (!this.mounted) { this.revving = false; return this.brawler(dt, t); }
    if (!this.bikePhase) { this.bikePhase = 'line'; this.bikeT = 0; }
    this.bikeT += dt;
    const ph = this.bikePhase;
    const go = (p) => { this.bikePhase = p; this.bikeT = 0; };
    if (ph === 'line') {
      this.revving = false;
      const side = this.x < t.x ? -1 : 1;
      this.moveToward(this.inScreen(t.x + side * 6.5, 0.6), t.z, 4.5);
      this.face(t);
      const dx = Math.abs(t.x - this.x);
      if (this.cool <= 0 && this.onScreen(0.3) && dx > 2.4 && (Math.abs(this.z - t.z) < 0.35 || this.bikeT > 3.5)) {
        go('rev'); g.sfx?.('engine'); this.warnMark();
      }
    } else if (ph === 'rev') {
      this.vx = this.vz = 0; this.revving = true; this.face(t);
      if (Math.random() < 0.4) g.debris.puff(this.x - this.facing * 1.0, 0.3, this.z, [0x777777, 0x999999], 1, 1, .1, .5, -0.1);
      if (this.bikeT > (this.isBoss ? 0.85 : 0.65)) { go('charge'); this.chargeHit = new Set(); this.revving = false; }
    } else if (ph === 'charge') {
      this.vx = this.facing * (this.isBoss ? 11 : 9.5); this.vz = 0; this.wantMove = true;
      if (Math.random() < 0.5) g.debris.puff(this.x - this.facing * 1.0, 0.3, this.z, [0x666666, 0x888888], 1, 1.5, .12, .5, -0.1);
      // 경로 위의 모두를 들이받음 (같은 편도 예외 없음)
      for (const a of g.actors) {
        if (a === this || !a.alive || this.chargeHit.has(a) || a.state === 'down' || a.y > this.y + 1.0) continue;
        if (Math.abs(a.x - this.x) > 0.75 * this.scale + a.radius || Math.abs(a.z - this.z) > 0.45 * Math.sqrt(this.scale)) continue;
        this.chargeHit.add(a);
        g.bikeHit(this, a);
      }
      const ax = this.x + this.facing * 1.0;
      const car = g.carAt(ax, this.z, 0, this.y);
      const fl = g.floorAt(ax, this.z);
      if (this.isBoss && car) { g.hitCar(car, 999, this.facing); g.explodeCar(car); }  // 보스는 차를 들이받아 그대로 폭파하며 관통
      else if (this.isBoss && fl > this.y + 0.5) { this.vx = 0; go('turn'); return; }
      else if (car || fl > this.y + 0.5) {          // 차·벽에 정면충돌 → 낙차
        if (car) g.hitCar(car, 35, this.facing);
        g.shake(0.3); g.sfx?.('crush');
        const dir = -this.facing;
        g.dismount(this, dir);
        this.hp -= 12;
        if (this.hp <= 0) { g.kill(this, { dir, knock: 6, attacker: null }); return; }
        this.setState('down'); this.downT = 0; this.vx = dir * 4; this.vy = 5; this.y = Math.max(this.y, 0.01);
        return;
      }
      if (fl < -50) { this.vx *= 0.3; go('turn'); return; }   // 낭떠러지 앞에서 급정거
      if (this.bikeT > 1.8 || Math.abs(this.x - g.camX) > g.viewHalf + 1.2) go('turn');
    } else if (ph === 'turn') {
      this.vx *= Math.pow(0.02, dt); this.vz = 0;
      if (this.bikeT > 0.45) { this.facing = t.x > this.x ? 1 : -1; this.cool = rand(1.0, 2.0); go('line'); }
    }
  }

  // 보스: 사이보그 폭주왕 쇠톱
  //  1페이즈(오토바이): 슈퍼아머 돌진 + 전기톱 드라이브바이, 차를 관통 폭파
  //  2페이즈(체력 65%↓): 오토바이를 걷어차 던지고(폭발) 부하 호출 → 전기톱 돌진/가로베기/내려찍기
  //  3페이즈(체력 30%↓): 폭주 모드 — 공격 속도 상승, 몸에서 불꽃
  cyborg(dt, t) {
    const g = this.game;
    if (this.mounted) {
      if (this.hp < this.maxHp * 0.65) return this.bossDismount(t);
      return this.biker(dt, t);
    }
    if (!this.phase2 && this.hp < this.maxHp * 0.3) {
      this.phase2 = true; this.atkSpeed = 1.3;
      g.banner('쇠톱 폭주 모드!', 1.8); g.sfx?.('engine');
      g.spawnEnemy('biker', -1);
    }
    if (this.phase2 && Math.random() < dt * 6) g.debris.sparks(this.x + rand(-.4, .4), rand(1, 2.4) * this.scale * .7, this.z + .2, 0xffa04a, 2, 2);
    const side = this.x < t.x ? -1 : 1;
    const dx = Math.abs(t.x - this.x), dz = Math.abs(t.z - this.z);
    this.face(t);
    const cd = this.phase2 ? 0.7 : 1;
    const saw = this.weapon?.type === 'chainsaw';
    if (this.cool <= 0 && dz < 0.55 && dx < 2.2 * this.scale * 0.75) {
      this.doAttack(saw ? (Math.random() < 0.55 ? 'eSawSweep' : 'eSawRush') : 'eSlam');
      this.cool = rand(1.0, 1.7) * cd;
      if (saw) g.sfx?.('engine');
    } else if (this.cool <= 0 && dz < 0.45 && dx > 3 && dx < 7.5 && this.onScreen(1.0)) {
      this.doAttack(saw && Math.random() < 0.5 ? 'eSawRush' : 'eCharge');
      this.cool = rand(1.3, 2.0) * cd;
      if (saw) g.sfx?.('engine');
    } else {
      this.moveToward(t.x + side * 1.5 * this.scale, t.z, this.def.speed * (this.phase2 ? 1.3 : 1));
    }
  }

  bossDismount(t) {
    const g = this.game;
    this.mounted = false; this.revving = false; this.bikePhase = null;
    this.face(t);
    // 오토바이를 걷어차서 굴려 보냄 → 닿으면 폭발
    g.spawnProjectile({ kind: 'moto', x: this.x + this.facing * 0.8, y: 1.0, z: this.z, dir: this.facing, team: this.team, dmg: 0, owner: this });
    this.vy = 7; this.grounded = false; this.vx = -this.facing * 2;
    this.cool = 1.4;
    g.banner('쇠톱: "내 애마를 받아라!"', 1.8);
    g.sfx?.('engine'); g.shake(0.3);
    g.spawnEnemy('biker', 1); g.spawnEnemy('biker', -1);
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

  onAttackEnd(interrupted) {
    this.game.releaseToken(this);
    // 닌자는 베고 나서 자주 뒤로 재주넘기
    if (!interrupted && this.type === 'ninja' && this.grounded && Math.random() < 0.55 && this.target) this.ninjaFlip(this.x < this.target.x ? -1 : 1);
  }

  // 뒤로 재주넘기 (잠깐 무적)
  ninjaFlip(away) {
    if (!this.grounded || this.legCount() < 2) return;
    this.interrupt();
    this.vy = 8.8; this.vx = away * 5.5; this.vz = 0; this.grounded = false;
    this.flipping = true; this.flip = 0; this.invuln = 0.3; this.dodgeCd = 1.6;
    this.state = 'jump';
    this.game.sfx?.('swing');
  }

  // 맨홀 방패병: 천천히 다가와 방패로 막고, 가까우면 방패 밀치기. 뒤돌기가 느려서 뒤를 잡을 수 있음
  shield(dt, t) {
    const g = this.game;
    const side = this.x < t.x ? -1 : 1;
    const want = t.x > this.x ? 1 : -1;
    if (want !== this.facing) { this.turnT += dt; if (this.turnT > 0.75) { this.facing = want; this.turnT = 0; } } else this.turnT = 0;
    const tok = g.requestToken(this, t);
    const dist = tok ? 1.0 * this.scale : this.wait;
    this.moveToward(tok ? t.x + side * dist : this.inScreen(t.x + side * dist, 0.6), tok ? t.z : t.z + this.slot, this.def.speed * (tok ? 1 : .7));
    const dx = Math.abs(t.x - this.x), dz = Math.abs(t.z - this.z);
    if (tok && dx < 1.35 && dz < 0.4 && this.cool <= 0 && this.facing === want) {
      this.doAttack(Math.random() < 0.6 ? 'eBash' : 'ePunch');
      this.cool = rand(1.1, 1.8);
    }
  }

  // 닌자: 중거리에선 표창, 가까우면 베기, 수시로 재주넘기
  ninja(dt, t) {
    const side = this.x < t.x ? -1 : 1;
    const dx = Math.abs(t.x - this.x), dz = Math.abs(t.z - this.z);
    this.face(t);
    if (dx < 1.5 && dz < 0.45 && this.cool <= 0) { this.doAttack('eSlash'); this.cool = rand(0.9, 1.4); return; }
    if (dx < 1.6 && this.dodgeCd <= 0 && Math.random() < dt * 1.2) { this.ninjaFlip(side); return; }
    if (dx > 3 && dx < 8.5 && dz < 0.5 && this.cool <= 0 && this.onScreen(1)) { this.doAttack('eShuriken'); this.cool = rand(1.3, 2.0); return; }
    const want = this.cool < 0.35 ? 1.1 : 4.6; // 벨 준비가 되면 순식간에 파고듦
    this.moveToward(this.inScreen(t.x + side * want, 1.0), t.z, this.def.speed * (this.cool < 0.35 ? 1.3 : 1));
  }
}
