// 게임 월드: 스테이지 진행, 카메라, 웨이브, 투사체, 폭발, 렌더링
import { mat4, clamp, rand, randi, sign, shuffle, pick, weightedPick } from './math.js';
import { GORE_BONUS, CHAPTER, STAGE_HEAL, ZONE_HEAL, EARLY_CHARGER_MAX, HERO_BLAST, HEAT, BLOOD, BIOMES, BOT, LANE, WEAPONS, ENEMIES, LIMB_WEAPONS, limbKind, TRAPS } from './config.js';
import { Debris, Stains } from './fx.js';
import { Gibs, bleed } from './gibs.js';
import { getModel, WEAPON_MODEL } from './models.js';
import { Player } from './player.js';
import { Companion } from './companion.js';
import { Enemy } from './enemy.js';
import { Stage, STAGE_COUNT, PIT, SEG_HINTS } from './level.js';
import { Item, Prop } from './props.js';
const CAR_FLASH = [1, 1, 1, .6], CAR_WARN = [1, .5, .1, .5], CAR_ALARM = [1, .85, .3, .18];
import { applyHit } from './combat.js';

export const PART_NAME = { head: '머리', armF: '팔', armB: '팔', handF: '아래팔', handB: '아래팔', legF: '다리', legB: '다리', shinF: '정강이', shinB: '정강이', torso: '몸통', upper: '상반신', lower: '하반신' };

// 가중치 기반 무기 뽑기
// 이번 런에 나올 수 있는 무기 (정비소 해금에 따라)
let WEAPON_POOL = null, WEAPON_MUL = {};
export const weaponOk = k => !WEAPON_POOL || WEAPON_POOL.includes(k);
export function rollWeapon(exclude = []) {
  const w = {};
  for (const [k, d] of Object.entries(WEAPONS)) if (!exclude.includes(k) && weaponOk(k)) w[k] = (d.weight ?? 1) * (WEAPON_MUL[k] ?? 1);
  if (!Object.values(w).some(v => v > 0)) return 'pipe';
  return weightedPick(w);
}
const IDENT = mat4.create();
const M = mat4.create();
const RAGE_M1 = mat4.create(), RAGE_M2 = mat4.create();

export class Game {
  constructor(renderer, input, texts, hooks) {
    this.r = renderer; this.input = input; this.texts = texts; this.hooks = hooks;
    this.debris = new Debris();
    this.stains = new Stains(renderer);
    // 피 입자가 닿았을 때: 캐릭터 부위에 묻히거나 배경에 자국을 남김
    this.bloodHooks = {
      actor: (x, y, z) => this.bloodHitActor(x, y, z),
      stain: (x, y, z, axis, sign, size, r, g, b) => this.stains.add(x, y, z, axis, sign, size, r, g, b),
    };
    this.gibs = new Gibs(this);
    this.time = 0;
    this.proj = mat4.create(); this.view = mat4.create(); this.vp = mat4.create();
    this.actors = []; this.enemies = []; this.props = []; this.traps = []; this.items = []; this.projectiles = [];
    this.tokens = new Map();
    this.hitstopT = 0; this.shakeMag = 0;
    this.camX = 8; this.viewHalf = 7; this.aspect = 16 / 9;
    this.lock = null; this.zoneIdx = 0;
    this.shadowBuf = new Float32Array(256 * 7);
    this.ropeBuf = new Float32Array(1200 * 7);
    this.running = false;
    this.combo = 0; this.comboT = 0;
    this.goT = 0;
  }

  // ------------------------------------------------ 런 / 스테이지
  startRun(stats) {
    this.stats = stats;
    const U = stats.unlocked ?? { biomes: Object.keys(BIOMES), bosses: ['boss', 'cyborg'], weapons: null };
    WEAPON_POOL = U.weapons;
    this.heat = stats.heat || 0;
    WEAPON_MUL = stats.player.fx?.has('golfLuck') ? { golf: 3 } : {};
    this.run = {
      chapter: 1, stat: {}, stage: 0, scrap: 0, kills: 0, severs: 0, maxCombo: 0, time: 0,
      perks: new Set(), biomes: shuffle([...U.biomes]).slice(0, 2), boss: pick(U.bosses), introduced: new Set(), seen: new Set(), rescueUsed: false, // 바이옴 순서·최종 보스 무작위
    };
    this.player = new Player(this, stats.player);
    this.bot = new Companion(this, stats.bot);
    this.giveStartWeapon();
    this.rescuePending = false;
    this.endTimer = -1;
    this.loadStage(0);
  }

  // 전리품 효과: 시작 무기
  giveStartWeapon() {
    const fx = this.stats.player.fx;
    if (fx?.has('startSaw')) this.player.weapon = { type: 'chainsaw', dur: Math.round(WEAPONS.chainsaw.dur / 2) };
    else if (fx?.has('startLid')) this.player.weapon = { type: 'manhole', dur: WEAPONS.manhole.dur };
  }
  // ------------------------------------------------ 무기방 (개발자 전용 실험실)
  // 모든 무기를 위쪽 라인에 일렬로 진열. 버리거나 던지거나 부서지면 사라지고 제자리에 다시 생김.
  // 가장 평범한 적(골목 깡패)이 어슬렁거림. 적 공격·적 수·내구도 무한은 실시간 옵션
  startLab(stats) {
    this.stats = stats;
    WEAPON_POOL = null; WEAPON_MUL = {};
    this.heat = 0;
    this.run = {
      lab: true, chapter: 1, stat: {}, stage: 0, scrap: 0, kills: 0, severs: 0, maxCombo: 0, time: 0,
      perks: new Set(), biomes: ['plains'], boss: 'boss', introduced: new Set(), seen: new Set(['grunt']), rescueUsed: true,
      hintSeen: new Set(Object.keys(SEG_HINTS)),
    };
    this.lab = { attack: false, count: 1, infinite: true, spawnT: 0.6, slots: [] };
    this.player = new Player(this, stats.player);
    this.bot = new Companion(this, stats.bot);
    this.rescuePending = false;
    this.endTimer = -1;
    this.loadStage(0);
    // 볼트는 쉬게 함 (실험 방해 방지)
    Object.assign(this.bot, { hidden: true, x: -40, koT: 1e9 }); this.bot.setState('ko');
    Object.keys(WEAPONS).forEach((type, i) => this.lab.slots.push({ type, x: 6 + i * 1.35, z: LANE.zMin + 0.7, item: null }));
    this.player.x = 6; this.player.z = 0.6;
    this.banner('무기방 — 개발자 전용', 1.6);
  }

  updateLab(dt) {
    const L = this.lab, p = this.player;
    p.hp = p.maxHp;                                            // 실험 중엔 죽지 않음
    if (L.infinite && p.weapon) p.weapon.dur = WEAPONS[p.weapon.type].dur;
    // 진열대: 집어 간 무기만 빼고, 사라진 자리는 다시 채움
    for (const s of L.slots) {
      const held = p.weapon?.type === s.type;
      const flying = this.projectiles.some(pr => pr.kind === 'weapon' && pr.weaponType === s.type);
      if ((!s.item || s.item.remove) && !held && !flying) {
        s.item = new Item('weapon', s.type, s.x, s.z, { y: 1.2, vy: 1 });
        this.items.push(s.item);
        this.debris.puff(s.x, 0.3, s.z, [0xd8d0c0, 0xffffff], 5, 1, .1, .35, -0.3);
      }
    }
    // 실험용 적: 정해진 수만큼 유지, 공격은 옵션
    const alive = this.enemies.filter(e => !e.dead && !e.remove);
    if (alive.length < L.count) {
      L.spawnT -= dt;
      if (L.spawnT <= 0) { L.spawnT = 1.0; const e = this.spawnEnemy('grunt', Math.random() < .5 ? -1 : 1); e.weapon = null; }
    }
    if (!L.attack) for (const e of alive) { e.cool = Math.max(e.cool, 1); if (e.state === 'attack' && e.attackPhase?.() === 'startup') { e.interrupt(); e.setState('idle'); } }
  }

  stat(k, n = 1) { if (this.run?.stat) this.run.stat[k] = (this.run.stat[k] || 0) + n; }

  // 보스를 잡고 아지트에 다녀온 뒤: 같은 판을 이어서 다음 챕터 (특성·처치 기록 유지, 업그레이드 반영)
  continueRun(stats) {
    const prev = this.player, ratio = prev ? Math.max(0.2, prev.hp / prev.maxHp) : 1;
    this.stats = stats;
    const U = stats.unlocked;
    WEAPON_POOL = U.weapons;
    WEAPON_MUL = stats.player.fx?.has('golfLuck') ? { golf: 3 } : {};
    this.heat = stats.heat || 0;
    const r = this.run;
    const bosses = U.bosses.length > 1 ? U.bosses.filter(b => b !== r.boss) : U.bosses;
    Object.assign(r, { chapter: r.chapter + 1, stage: 0, scrap: 0, biomes: shuffle([...U.biomes]).slice(0, 2), boss: pick(bosses), rescueUsed: false, fallSaved: false });
    this.player = new Player(this, stats.player);
    this.bot = new Companion(this, stats.bot);
    this.applyPerks();
    this.player.hp = Math.min(this.player.maxHp, Math.round(this.player.maxHp * (ratio + STAGE_HEAL + stats.player.regen)));
    this.giveStartWeapon();
    this.rescuePending = false;
    this.endTimer = -1;
    this.loadStage(0);
    this.banner(`CHAPTER ${r.chapter} — ${this.stage.biome.name}`, 2.6);
  }

  // 판 중에 고른 특성의 즉시 효과 (새로 만든 뱀돌이·볼트에 다시 적용)
  applyPerks(only = null) {
    const pl = this.player, bot = this.bot;
    for (const id of only ? [only] : this.run.perks) {
      if (id === 'tough') { pl.maxHp += 25; pl.hp = pl.maxHp; }
      if (id === 'overclock') { bot.atkSpeed *= 1.25; bot.speed *= 1.25; }
      if (id === 'botpower') bot.power *= 1.35;
    }
  }

  loadStage(i) {
    if (this.stage) this.stage.dispose(this.r);
    this.run.stage = i;
    this.stage = new Stage(this, i, this.run.biomes[i]);
    this.stains.init(this.stage.L);   // 스테이지 크기에 맞는 새 핏자국 맵
    this.props = this.stage.props; this.traps = this.stage.traps; this.items = this.stage.items;
    this.projectiles = []; this.enemies = []; this.tokens.clear();
    this.debris.clear(); this.gibs.clear(); this.texts.clear();
    for (const h of [this.player, this.bot]) {
      h.vx = h.vy = h.vz = 0; h.y = 0; h.grounded = true; h.fellOut = false; h.hidden = false; h.facing = 1; h.attack = null; h.weapon = h === this.player ? h.weapon : null;
      if (h.state !== 'ko') h.setState('idle');
    }
    this.player.x = 3; this.player.z = 0;
    this.bot.x = 1.6; this.bot.z = 0.9;
    if (i > 0) {
      const heal = Math.min(this.player.maxHp - this.player.hp, Math.round(this.player.maxHp * (STAGE_HEAL + this.stats.player.regen)));
      this.player.hp += heal;
      if (heal > 0) this.stageHealMsg = `+${heal}`;
      if (this.bot.state === 'ko') { this.bot.setState('idle'); this.bot.hp = Math.round(this.bot.maxHp * 0.5); }
    }
    this.actors = [this.player, this.bot];
    this.camX = 0; this.camMax = 0; this.lock = null; this.zoneIdx = 0;
    this.lastSafe = { x: 3, z: 0, y: 0 };
    this.curSeg = null;
    this.running = true;
    this.banner(`STAGE ${i + 1} — ${this.stage.biome.name}`, 2.4);
    if (this.stageHealMsg) { this.texts.add(3, 2.6, 0, `${this.stageHealMsg} 회복`, 'heal'); this.stageHealMsg = null; }
  }

  // ------------------------------------------------ 메인 업데이트
  // 실제로 시뮬레이션이 진행됐으면 true (히트스톱 중엔 입력을 보존하기 위해 false)
  update(dt) {
    if (!this.running) return false;
    if (this.hitstopT > 0) { this.hitstopT -= dt; this.shakeMag *= Math.pow(0.02, dt); return false; }
    this.time += dt;
    this.run.time += dt;
    this.shakeMag *= Math.pow(0.02, dt);

    this.handleDevKeys();
    for (const a of this.actors) a.update(dt);
    const P = this.player;
    // 새 지형 구간에 들어서면 짧게 안내
    const seg = this.stage.segments.find(sg => P.x >= sg.a && P.x < sg.b);
    // 지형 안내는 한 판에 종류별로 처음 한 번만 (같은 종류 구간이 여러 번 나오거나 경계를 오가도 다시 안 뜸)
    if (seg && seg !== this.curSeg) {
      this.curSeg = seg;
      this.run.hintSeen ??= new Set();
      if (SEG_HINTS[seg.type] && !this.run.hintSeen.has(seg.type)) { this.run.hintSeen.add(seg.type); this.banner(SEG_HINTS[seg.type], 1.6); }
    }
    if (P.grounded && P.floor >= 0 && P.state !== 'ko' && [-.4, .4].every(d => this.floorAt(P.x + d, P.z) >= 0 && this.floorAt(P.x, P.z + d * .7) >= 0)) {
      this.lastSafe = { x: P.x, z: P.z, y: P.floor };
    }
    this.separate();
    this.updateFlung();
    this.clampHeroes();
    this.updateProjectiles(dt);
    for (const it of this.items) it.update(dt, this);
    for (const p of this.props) p.update(dt, this);
    for (const t of this.traps) t.update(dt, this);
    this.updateCars(dt);
    this.debris.update(dt, (x, z) => this.floorAt(x, z), this.bloodHooks);
    for (const a of this.actors) { a.updateBlood(dt); a.updateSettle(dt); }
    this.updateLHint();
    this.gibs.update(dt);

    for (const a of this.actors) if (a.remove) this.releaseToken(a);
    this.actors = this.actors.filter(a => !a.remove || a.team === 'hero');
    this.enemies = this.actors.filter(a => a.team === 'enemy');
    this.items = this.items.filter(i => !i.remove);
    this.props = this.props.filter(p => !p.broken);

    if (this.run.lab) this.updateLab(dt); else this.updateZones(dt);
    this.updateCamera(dt);
    if (!this.run.lab) this.cullBehind(dt);
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    if (this.goT > 0) this.goT -= dt;

    if (this.endTimer >= 0) {
      this.endTimer -= dt;
      if (this.endTimer < 0) { this.running = false; this.hooks.onRunEnd(false); }
    }
    if (!this.run.lab && !this.lock && this.zoneIdx >= this.stage.zones.length && this.player.x > this.stage.L - 5 && this.endTimer < 0) {
      this.running = false;
      this.hooks.onStageClear(this.run.stage + 1 >= STAGE_COUNT);
    }
    return true;
  }

  handleDevKeys() {
    const inp = this.input;
    if (inp.pressed('KeyT')) {
      const n = this.stats.bot.tactics;
      if (n > 1) {
        this.bot.tactic = (this.bot.tactic + 1) % n;
        this.say(this.bot, `전술: ${this.bot.tacticDef.name}`);
      } else this.say(this.bot, '전술 칩 미장착 (정비소)');
    }
    if (inp.pressed('KeyB')) this.spawnEnemy(pick(Object.keys(ENEMIES).filter(k => !ENEMIES[k].boss)), Math.random() < .5 ? -1 : 1);
  }

  separate() {
    const list = this.actors;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.state === 'down' || a.state === 'ko') continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || b.state === 'down' || b.state === 'ko') continue;
        if (a.team === 'hero' && b.team === 'hero') continue; // 주인공 ↔ 볼트: 충돌 없음 (겹쳐 지나감)
        const dx = b.x - a.x, dz = b.z - a.z;
        const minX = (a.radius + b.radius) * 0.9;
        if (Math.abs(dx) < minX && Math.abs(dz) < 0.32) {
          const push = (minX - Math.abs(dx)) * 0.5;
          const s = dx === 0 ? (Math.random() < .5 ? -1 : 1) : sign(dx);
          if (a.state !== 'attack') a.x -= s * push;
          if (b.state !== 'attack') b.x += s * push;
        }
      }
      for (const p of this.props) {
        if (p.broken) continue;
        const dx = a.x - p.x, dz = (a.z - p.z) * 1.4, d = Math.hypot(dx, dz), min = a.radius + p.radius;
        if (d < min && d > 0.0001 && a.y < 0.8) {
          a.x += dx / d * (min - d); a.z += dz / d * (min - d) / 1.4;
          // 정면으로 밀고 들어가면 옆으로 미끄러져 돌아감 (상자·드럼통에 꽉 막히지 않게)
          if (Math.abs(a.vx) > 0.5 && Math.sign(a.vx) === -Math.sign(dx) && Math.abs(dz) < min * 0.8) {
            const side = Math.abs(dz) > 0.02 ? Math.sign(dz) : (p.z > 1 ? -1 : 1);
            a.z = clamp(a.z + side * 2.2 * (1 / 60), LANE.zMin, LANE.zMax);
          }
        }
      }
    }
  }

  clampHeroes() {
    const L = this.stage.L;
    for (const h of [this.player, this.bot]) {
      const lo = this.lock ? this.lock.cx - this.viewHalf + 0.4 : this.camX - this.viewHalf + 0.4;
      const hi = this.lock ? this.lock.cx + this.viewHalf - 0.4 : L - 1;
      h.x = clamp(h.x, lo, hi);
    }
  }

  updateCamera(dt) {
    this.viewHalf = Math.min(10.5, 5.3 * this.aspect - 0.6);
    let target = this.lock ? this.lock.cx : this.run?.lab ? this.player.x : Math.max(this.camX, this.player.x + 1.2);   // 무기방은 좌우 자유
    target = clamp(target, this.viewHalf - 1.5, this.stage.L - this.viewHalf + 1);
    if (this.camX === 0) this.camX = target;
    this.camX += (target - this.camX) * Math.min(1, dt * 4);
  }

  // 화면은 뒤로 돌아가지 않으므로, 지나온 화면 밖(왼쪽)의 시체·부위·아이템·오브젝트는 정리 (다시 볼 일이 없음)
  cullBehind(dt) {
    this.camMax = Math.max(this.camMax || 0, this.camX);
    this.cullT = (this.cullT || 0) - dt;
    if (this.cullT > 0) return;
    this.cullT = 0.5;
    const cut = this.camMax - this.viewHalf - 3;     // 전투 구역 고정 때 화면이 살짝 되돌아오는 만큼 여유
    const g0 = this.gibs.list.length;
    this.gibs.list = this.gibs.list.filter(g => g.pos[0] > cut);
    this.gibs.spurts = this.gibs.spurts.filter(s => s.actor.x > cut);
    for (const a of this.actors) if (a.team === 'enemy' && a.dead && a.x < cut) a.remove = true;
    for (const it of this.items) if (it.x < cut) it.remove = true;
    for (const p of this.props) if (p.x < cut && p.fuse < 0) p.broken = true;
    this.culled = (this.culled || 0) + g0 - this.gibs.list.length;
  }

  // ------------------------------------------------ 전투 구역 / 웨이브
  updateZones(dt) {
    const zones = this.stage.zones;
    if (!this.lock) {
      const z = zones[this.zoneIdx];
      if (z && this.player.x >= z.trigger) {
        this.lock = { cx: z.trigger + this.viewHalf * 0.35, zone: z, wave: -1, queue: [], spawnT: 0, nextT: 0.4 };
      }
      return;
    }
    const L = this.lock;
    if (L.queue.length) {
      L.spawnT -= dt;
      if (L.spawnT <= 0) {
        L.spawnT = 0.45;
        let qi = 0;
        // 첫 스테이지: 돌격 헬멧은 한 번에 한 명만 (살아 있으면 다른 적을 먼저 내보내고, 없으면 기다림)
        if (this.run.stage === 0) {
          const busy = this.enemies.filter(e => e.type === 'charger' && !e.dead).length >= EARLY_CHARGER_MAX;
          if (busy) { qi = L.queue.findIndex(t => t !== 'charger'); if (qi < 0) return; }
        }
        const type = L.queue.splice(qi, 1)[0];
        this.spawnEnemy(type, ENEMIES[type].boss ? 1 : (Math.random() < 0.5 ? -1 : 1));
      }
      return;
    }
    const alive = this.enemies.filter(e => !e.remove);
    if (alive.length) { this.unstick(L, alive, dt); return; }
    L.nextT -= dt;
    if (L.nextT > 0) return;
    L.wave++;
    if (L.wave < L.zone.waves.length) {
      L.queue = [...L.zone.waves[L.wave]];
      L.nextT = 0.8;
      const bt = L.queue.find(k => ENEMIES[k].boss);
      if (bt) this.banner(`⚠ ${ENEMIES[bt].name} 등장 ⚠`, 2.2);
    } else {
      this.lock = null;
      this.zoneIdx++;
      this.goT = 2.5;
      // 구역 정리 보상: 체력 회복
      const p = this.player;
      if (p.alive && ZONE_HEAL > 0) {
        const heal = Math.min(p.maxHp - p.hp, Math.round(p.maxHp * ZONE_HEAL));
        if (heal > 0) { p.hp += heal; this.texts.add(p.x, p.y + 2.4, p.z, `+${heal}`, 'heal'); this.debris.puff(p.x, p.y + 1, p.z, [0x7af08f, 0xc8ffd0], 14, 1.6, .1, .6, -0.6); }
      }
    }
  }

  // 진행 막힘 방지: 화면 밖에 오래 있거나 제자리에 묶인 적은 화면 안으로 옮기고,
  // 그래도 웨이브가 40초간 변화 없으면 남은 적을 정리
  // x0 → x1 사이를 같은 z 라인으로 걸어갈 수 있나 (낭떠러지·넘을 수 없는 벽 검사, 다른 z 라인도 시도)
  reachable(x0, x1, z) {
    const zs = [z, LANE.zMin + 0.4, 0, 1.5, LANE.zMax - 0.4];
    return zs.some(zz => {
      let prev = this.floorAt(x0, zz);
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 0.4) {
        const f = this.floorAt(x, zz);
        if (f < -50 || f - prev > 1.2) return false;
        prev = f;
      }
      return true;
    });
  }

  unstick(L, alive, dt) {
    if (L.lastCount !== alive.length) { L.lastCount = alive.length; L.idleT = 0; }
    L.idleT = (L.idleT || 0) + dt;
    for (const e of alive) {
      if (e.dead) continue;
      const off = Math.abs(e.x - L.cx) > this.viewHalf - 0.3;
      e.offT = off ? (e.offT || 0) + dt : 0;
      const moved = Math.hypot(e.x - (e.lastPX ?? e.x), e.z - (e.lastPZ ?? e.z));
      e.lastPX = e.x; e.lastPZ = e.z;
      const t = e.target;
      const far = !t || Math.hypot(t.x - e.x, t.z - e.z) > 2.5;
      e.stuckT = moved < 0.01 && far && e.state !== 'attack' && e.state !== 'down' ? (e.stuckT || 0) + dt : 0;
      // 걷고는 있는데 다가오지 못함 (벽·낭떠러지 건너편에서 제자리걸음)
      const dT = t ? Math.hypot(t.x - e.x, (t.z - e.z) * 1.5) : 0;
      if (!far || e.state === 'attack' || e.state === 'down' || e.grabbedBy || dT < (e.bestD ?? 1e9) - 0.4) { e.bestD = dT; e.noProgT = 0; }
      else e.noProgT = (e.noProgT || 0) + dt;
      const kiter = e.def.ai === 'kiter' && e.hasArms() && !off;   // 거리를 두는 적은 제외
      if (e.offT > 3.5 || e.stuckT > 5 || (!kiter && e.noProgT > 4.5)) {
        e.bestD = undefined; e.noProgT = 0;
        const side = e.x < L.cx ? -1 : 1;
        let s = this.stage.safeSpot(L.cx + side * (this.viewHalf - 1.5), this.player.z);
        if (!this.reachable(s.x, this.player.x, s.z)) s = this.stage.safeSpot(L.cx - side * (this.viewHalf - 1.5), this.player.z);
        this.debris.puff(e.x, e.y + 0.5, e.z, [0x9c958a, 0x7a7266], 8, 1.5, .14, .35, -0.3);
        e.x = s.x; e.z = s.z; e.y = this.floorAt(s.x, s.z); e.vx = e.vy = e.vz = 0;
        if (e.goItem) { e.goItem.claimed = 'blocked'; e.goItem = null; }
        e.offT = 0; e.stuckT = 0;
      }
    }
    if (L.idleT > 25) {
      for (const e of alive) { if (!e.dead) this.run.kills++; e.dead = true; e.remove = true; this.releaseToken(e); }
      L.idleT = 0;
    }
  }

  spawnEnemy(type, side) {
    const cx = this.lock ? this.lock.cx : this.camX;
    let spot = this.stage.safeSpot(cx + side * (this.viewHalf + 1.2), rand(LANE.zMin + 0.2, LANE.zMax - 0.2));
    // 플레이어 쪽으로 걸어올 길이 낭떠러지로 끊겨 있으면 화면 가장자리 안쪽에서 등장
    if (!this.reachable(spot.x, cx, spot.z)) spot = this.stage.safeSpot(cx + side * (this.viewHalf - 1.2), spot.z);
    const ch = (this.run.chapter || 1) - 1;
    const e = new Enemy(this, type, spot.x, spot.z, (1 + this.run.stage * 0.15) * (1 + HEAT.enemyHp * this.heat) * (1 + CHAPTER.enemyHp * ch));
    e.power *= (1 + HEAT.enemyPow * this.heat) * (1 + CHAPTER.enemyPow * ch);   // 난이도 · 챕터
    // 처음 보는 적은 이름을 알려줌 (기본 적 제외)
    if (this.run.seen && !this.run.seen.has(type)) {
      this.run.seen.add(type);
      if (!['grunt', 'thrower'].includes(type) && !ENEMIES[type].boss) this.banner(`새로운 적: ${ENEMIES[type].name}`, 1.8);
    }
    this.actors.push(e);
    this.enemies.push(e);
    return e;
  }

  pickTarget(e) {
    // 방패형 볼트의 도발: 근처 적은 볼트를 먼저 노림
    if (this.stats.bot.taunt && this.bot.alive && Math.hypot(this.bot.x - e.x, this.bot.z - e.z) < 5) return this.bot;
    const c = [];
    if (this.player.alive) c.push([this.player, Math.abs(this.player.x - e.x) * 0.8]);
    if (this.bot.alive) c.push([this.bot, Math.abs(this.bot.x - e.x)]);
    if (!c.length) return null;
    c.sort((a, b) => a[1] - b[1]);
    return c[0][0];
  }

  requestToken(e, t) {
    if (e.tokenTarget === t) return true;
    if (e.tokenTarget) this.releaseToken(e);
    let s = this.tokens.get(t);
    if (!s) { s = new Set(); this.tokens.set(t, s); }
    for (const o of s) if (o.dead || o.remove) s.delete(o);
    const max = t === this.player ? 2 : 1;
    if (s.size >= max) return false;
    s.add(e); e.tokenTarget = t;
    return true;
  }

  releaseToken(e) {
    if (!e.tokenTarget) return;
    this.tokens.get(e.tokenTarget)?.delete(e);
    e.tokenTarget = null;
  }

  // ------------------------------------------------ 피해 / 사망
  onDamage(v, dmg, h, back) {
    if (h.ignite) return; // 화염 지속 피해 숫자는 생략 (화면이 지저분해짐)
    const cls = v.team === 'hero' ? 'hurt' : (dmg >= 18 ? 'crit' : '');
    this.texts.add(v.x, v.y + 1.9 * v.scale, v.z, String(dmg), cls);
  }

  // 맨주먹 타격선: 주먹이 닿는 거리까지 짧은 흰 줄기 (얼마나 닿는지 눈으로 보이게)
  punchStreak(a, d) {
    const len = d.range[1] * a.scale, y = a.y + (d.anim === 'kick' ? 0.75 : 1.28) * a.scale, f = a.facing;
    const x0 = a.x + f * 0.35;
    for (let i = 0; i < 14; i++) {
      const u = i / 13;
      for (const dy of [-0.04, 0.04]) this.debris.spawn(x0 + f * u * (len - 0.35), y + dy, a.z + 0.08, f * 3, 0, 0, 1, 1, .9, .08 * (1 - u * .45), .1 + u * .04, 0);
    }
    this.debris.sparks(a.x + f * len, y, a.z + .05, 0xffffff, 3, 2.5);
  }

  // 되튀는 피: 맞은 자리에서 공격자 쪽(약간 위)으로 핏방울을 뿌림
  backsplash(v, att, n) {
    const d = Math.sign(att.x - v.x) || -1, y = v.y + 1.15 * v.scale;
    const reach = Math.max(0.4, Math.abs(att.x - v.x));
    for (let i = 0; i < n; i++) {
      const [r, g, b] = [[.78, .12, .14], [.62, .07, .1], [.88, .22, .17]][i % 3];
      // 공격자 몸까지 날아가도록 거리에 맞춘 속도
      this.debris.spawn(v.x + d * 0.15, y + (Math.random() - .3) * .3, v.z + (Math.random() - .5) * .2,
        d * (reach * 3.2 + Math.random() * 2), 1 + Math.random() * 2.5, (att.z - v.z) * 2 + (Math.random() - .5) * 1.2, r, g, b, .06 + Math.random() * .05, 1.5, 1, 1);
    }
  }

  // 숄더 태클 시작: 뒤로 흙먼지 + 앞으로 바람 줄기
  dashBurst(p) {
    const d = p.facing;
    this.debris.puff(p.x - d * .3, p.y + .15, p.z, [0xd8d0c0, 0xb8b0a0, 0xffffff], 14, 2.2, .16, .45, -0.3);
    for (let i = 0; i < 16; i++) this.debris.spawn(p.x + d * (0.3 + Math.random() * .6), p.y + 0.4 + Math.random() * 1.2, p.z + (Math.random() - .5) * .4, -d * (7 + Math.random() * 5), 0, 0, .9, .97, 1, .05, .18 + Math.random() * .1, 0);
    this.sfx?.('dash');
  }
  // 숄더 태클 명중: 충격파 고리 + 섬광 + 묵직한 소리
  dashImpact(p, v) {
    const x = (p.x + v.x) / 2, y = p.y + 1.0, z = v.z;
    for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; this.debris.spawn(x, y, z, Math.cos(a) * 6, Math.sin(a) * 6, (Math.random() - .5) * 1.5, 1, .95, .7, .09, .22, 0); }
    this.debris.sparks(x, y, z + .2, 0xffffff, 18, 7);
    this.debris.puff(v.x, v.y + .1, v.z, [0xd8d0c0, 0x9c958a], 12, 2.5, .18, .5, -0.2);
    this.shake(0.32); this.hitstop(0.15);
    this.sfx?.('heavy'); this.sfx?.('thud');
  }

  // 고어 보너스: 작은 글씨로 '머리 절단 +3', 동전이 반짝이며 튐. 실제 부품(돈) 지급
  goreBonus(v, key) {
    const b = GORE_BONUS[key];
    if (!b || !this.run) return;
    const n = Math.max(1, Math.round(b.v * this.stats.player.scrapMul * (1 + HEAT.scrap * this.heat)));
    this.run.scrap += n;
    const y = (v.y ?? 0) + 2.2 * (v.scale ?? 1);
    this.texts.add(v.x, y, v.z, `${b.label} +${n}`, 'coin');
    for (let i = 0; i < 3 + n; i++) this.debris.spawn(v.x, y - 0.4, v.z, (Math.random() - .5) * 2.5, 3 + Math.random() * 2.5, (Math.random() - .5) * 1.2, 1, .84, 0, .09, .7, .8);
    this.sfx?.('coin');
  }

  severPart(v, k, dir, h = {}) {
    v.severPart(k, dir, h);
    if (h.attacker === this.player) this.backsplash(v, this.player, BLOOD.backsplash * 2);   // 절단: 크게 되튐
    if (v.mounted && /^(leg|shin)/.test(k)) this.dismount(v, dir);
    this.run.severs++; this.stat('severs');
    this.sfx?.(h.mode === 'crush' ? 'crush' : 'splat');
    const crush = h.mode === 'crush';
    if (h.attacker === this.player) {
      const part = k.replace(/[FB]$/, '');
      this.goreBonus(v, h.fling > 2 && k === 'head' ? 'homerun' : crush ? (k === 'head' ? 'crushHead' : 'crush') : part);
    }
    if (k === 'head' && !v.dead) this.kill(v, { ...h, dir, knock: 3, bisect: 0 });
  }

  // 오함마 충격파: 내려찍은 지점 주변 적의 다리를 부숨
  groundShock(att, a) {
    const d = a.def, w = WEAPONS[att.weapon?.type];
    if (!w) return;
    const x = att.x + att.facing * 1.1 * att.scale, z = att.z;
    this.debris.puff(x, 0.1, z, [0xbdb6a6, 0x9c958a, 0x7a7266], 30, 4, .2, .5, 0.6);
    this.shake(0.3);
    for (const v of this.actors) {
      if (v.team === att.team || a.hit.has(v) || v.dead || v.y - v.floor > 0.5) continue;
      const dist = Math.hypot(v.x - x, (v.z - z) * 1.3);
      if (dist > d.shock.radius) continue;
      a.hit.add(v);
      applyHit(this, v, {
        attacker: att, dmg: w.dmg * d.shock.dmg * att.power, knock: 2, dir: sign(v.x - x) || att.facing, zone: d.shock.zone,
        knockdown: false, sever: w.sever, mode: 'crush', hitstun: .45, hitstop: 0, shake: 0,
      });
    }
  }

  kill(v, h) {
    if (v.team === 'hero') return this.heroDown(v, h);
    v.dead = true;
    if (h?.attacker === this.player) this.player.feedRage?.();   // 광폭 중 처치 → 광폭 연장
    v.interrupt();
    v.setState('dying');
    v.vx = h.dir * Math.max(3, h.knock) * 1.1; v.vy = 6; v.y = Math.max(v.y, 0.01); v.grounded = false;
    if (h.knock >= 7.5) v.flung = { owner: h.attacker, hit: new Set() };
    v.facing = -h.dir;
    if (v.mounted) this.dismount(v, h.dir, true);
    if (v.grabbedBy) this.releaseGrab(v.grabbedBy);
    if (v.weapon) this.dropWeapon(v);
    if (v.blocks) this.dropShield(v);
    if (v.goItem) { v.goItem.claimed = null; v.goItem = null; }
    this.releaseToken(v);
    this.run.kills++;
    if (h.explosion) { this.stat('blast'); this.goreBonus(v, 'blast'); }
    if (v.isBoss) { this.stat('boss_' + v.type); if (this.player.hp <= 10 && this.player.alive) this.stat('clutch'); }
    if (this.run.perks.has('ration')) this.player.hp = Math.min(this.player.maxHp, this.player.hp + 3);
    const [a, b] = v.def.scrap;
    const n = randi(a, b);
    const pieces = Math.min(n, 10);
    for (let i = 0; i < pieces; i++) {
      this.items.push(new Item('scrap', null, v.x, v.z, { y: 1, vy: rand(4, 7), vx: rand(-2, 2), value: n / pieces }));
    }
    if (v.isBoss) { this.banner('철거반장 격파!', 2.5); this.hitstop(0.35); this.shake(0.6); }
    // 샷건으로 처치: 산산조각 (부위가 사방으로 멀리 날아감)
    if (h.mode === 'blast' && v.destructible && !v.remove) {
      v.blastApart(h.dir);
      if (h.attacker === this.player) this.goreBonus(v, 'shatter');
      this.hitstop(0.1);
      return;
    }
    // 전기톱/도끼 마무리: 허리가 두 동강
    if (h.bisect && v.destructible && !v.remove && Math.random() < h.bisect) {
      v.bisect(h.dir);
      if (h.attacker === this.player) this.goreBonus(v, 'bisect');
      this.hitstop(0.12); this.shake(0.3);
    }
  }

  heroDown(v, h) {
    v.hp = 0;
    v.interrupt();
    v.setState('ko');
    v.vx = (h.dir || 1) * 4; v.vy = 5; v.y = Math.max(v.y, 0.01); v.facing = -(h.dir || 1);
    v.weapon && v === this.player && this.dropWeapon(v);
    if (v.carry) this.dropCarry(v);
    if (v === this.bot) {
      v.koT = BOT.koTime;
      this.say(v, '볼트 다운… 자가 수리 중');
      if (this.rescuePending) { this.explodeHero(this.player, h.dir || 1); this.endTimer = 2.6; }
      return;
    }
    if (this.stats.bot.rescue && !this.run.rescueUsed && this.bot.alive) {
      this.run.rescueUsed = true;
      this.rescuePending = true;
      this.say(this.bot, '버텨! 지금 간다!');
    } else {
      this.explodeHero(v, h.dir || 1);
      this.endTimer = 2.6;
    }
  }

  // 플레이어 사망: 온몸이 터지며 붉은 복셀을 대량으로 뿌림
  explodeHero(p, dir) {
    if (p.hidden) return;
    const root = p.rootMatrix(mat4.create());
    const cx = p.x, cy = p.y + 1, cz = p.z;
    for (const { k, list } of p.groups(root, ['head', 'torso', 'armF', 'armB', 'legF', 'legB'])) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 4;
      p.game.gibs.spawnGroup(list, [Math.cos(a) * sp + dir * 2, 6 + Math.random() * 5, Math.sin(a) * sp * 0.4], k, 1.4);
    }
    for (let i = 0; i < 4; i++) this.bleed(cx, cy + Math.random() * 0.6, cz, i % 2 ? 1 : -1, 90);
    this.debris.puff(cx, cy, cz, [0xc81e24, 0x9e1219, 0xe0382c, 0x6a0a10], 80, 6, .22, 1.6, 1);
    p.hidden = true;

    this.hitstop(0.3); this.shake(0.8);
    this.sfx?.('death');
  }

  // ------------------------------------------------ 날아가는 몸 (볼링)
  // 세게 맞아 날아가는 적이 다른 적과 부딪히면 둘 다 피해. 맞은 적도 날아가며 연쇄
  updateFlung() {
    for (const a of this.actors) {
      const f = a.flung;
      if (!f) continue;
      if (a.remove || (a.grounded && Math.abs(a.vx) < 2.5)) { a.flung = null; continue; }
      const spd = Math.abs(a.vx);
      if (spd < 3) continue;
      const dir = Math.sign(a.vx);
      for (const o of this.actors) {
        if (o === a || o.team !== a.team || f.hit.has(o) || o.dead || o.remove || o.state === 'down') continue;
        if (Math.abs(o.x - a.x) > a.radius + o.radius + 0.1 || Math.abs(o.z - a.z) > 0.55 || Math.abs(o.y - a.y) > 1.3) continue;
        f.hit.add(o);
        applyHit(this, o, {
          attacker: f.owner, dmg: 6 + spd * 0.9, knock: spd * 0.78, dir, zone: 'mid', knockdown: true,
          sever: 0.8, hitstop: .07, shake: .14,
        });
        if (o.flung) o.flung.hit.add(a);
        if (!a.dead) { a.hp -= 5; if (a.hp <= 0) this.kill(a, { dir, knock: spd * 0.4 }); }
        a.vx *= 0.45;

        this.sfx?.('thud');
      }
      for (const p of this.props) {
        if (p.broken || f.hit.has(p)) continue;
        if (Math.abs(p.x - a.x) > a.radius + p.radius || Math.abs(p.z - a.z) > 0.6 || a.y > 1.2) continue;
        f.hit.add(p);
        p.hit(this, 20, dir);
      }
      const car = this.carAt(a.x, a.z, a.radius, a.y);
      if (car && !f.hit.has(car)) { f.hit.add(car); this.hitCar(car, 25, dir); }
    }
  }

  wallSlam(a) {
    const dmg = Math.round(Math.abs(a.vx) * 1.2);

    this.shake(0.15); this.hitstop(0.05);
    this.debris.puff(a.x + Math.sign(a.vx) * .3, a.y + 1, a.z, [0xbdb6a6, 0x8a8478], 10, 2, .14, .4, 0.3);
    this.sfx?.('thud');
    if (!a.dead) { a.hp -= dmg; a.flash = 0.1; if (a.hp <= 0) this.kill(a, { dir: -Math.sign(a.vx), knock: 3 }); }
    a.flung = null;
  }

  // 내려찍기 착지: 흙먼지 + 화면 흔들림
  stompImpact(a) {
    this.debris.puff(a.x, a.y + 0.1, a.z, [0xbdb6a6, 0x9c958a, 0x7a7266], 22, 3.5, .18, .45, 0.5);
    this.shake(0.28);
    this.sfx?.('heavy');
  }

  // ------------------------------------------------ 지형
  floorAt(x, z) { return this.stage.heightAt(x, z); }
  wallAt(x, z, y) { const h = this.stage.heightAt(x, z); return h !== PIT && h > y + 0.4; }

  // 낭떠러지로 떨어짐: 적은 즉사, 플레이어도 사망(구조 프로토콜이 있으면 마지막 안전 지점에서 부활 대기)
  fallOut(a) {
    a.vx = a.vz = 0;
    if (Math.abs(a.x - this.camX) < this.viewHalf + 2) this.sfx?.('fall');
    if (a.team === 'enemy') {
      if (!a.dead) {
        a.dead = true;
        this.releaseToken(a);
        this.run.kills++;

      }
      a.remove = true;
      return;
    }
    const safe = a === this.player ? this.lastSafe : this.lastSafe;
    if (a === this.bot) {
      // 볼트: 플레이어 근처로 복귀해서 자가 수리
      a.x = safe.x - 1; a.z = safe.z; a.y = safe.y; a.vy = 0; a.fellOut = false;
      if (a.state !== 'ko') { a.hp = 0; a.interrupt(); a.setState('ko'); a.koT = BOT.koTime; this.say(a, '추락… 자가 수리 중'); }
      return;
    }
    this.stat('fall');
    if (this.stats.player.fx?.has('parachute') && !this.run.fallSaved && a.hp > 30) {
      this.run.fallSaved = true;
      a.x = safe.x; a.z = safe.z; a.y = safe.y; a.vy = 0; a.fellOut = false; a.hp -= 30; a.invuln = 1.5;
      this.texts.add(a.x, a.y + 2.4, a.z, '추락 전문가! -30', 'hurt');
      return;
    }

    a.hp = 0; a.interrupt(); a.setState('ko');
    if (a.weapon) a.weapon = null;
    if (a.carry) a.carry = null; // 낭떠러지로 같이 떨어짐
    if (this.stats.bot.rescue && !this.run.rescueUsed && this.bot.alive) {
      this.run.rescueUsed = true;
      this.rescuePending = true;
      a.x = safe.x; a.z = safe.z; a.y = safe.y; a.vy = 0; a.fellOut = false;
      this.say(this.bot, '붙잡았다! 버텨!');
    } else {
      a.hidden = true;
      this.endTimer = 1.6;
    }
  }

  revivePlayer() {
    const p = this.player;
    this.rescuePending = false;
    p.hp = Math.round(p.maxHp * BOT.rescueHpRatio);
    p.setState('getup');
    this.texts.add(p.x, 2.4, p.z, '부활!', 'heal');
  }

  onShatter(v) {
    if (v.type === 'bomber' && !v.exploded) {
      v.exploded = true;
      this.explode(v.x, v.z, 1.9, 24, null);
    }
  }

  explode(x, z, radius, dmg, source, spareTeam = null) {
    if (this.stats?.player.fx?.has('pyro')) radius *= 1.25;
    if (source && source.type === 'bomber') {
      source.exploded = true;
      source.dead = true;
      this.releaseToken(source);
      source.shatter();
    }
    this.debris.puff(x, 0.8, z, [0xffe14a, 0xff8a1f, 0xd94a2a, 0x555555, 0x8a8a8a], 70, 5.5, .26, .8, 0.15);
    this.sfx?.('boom');
    this.shake(0.45);
    this.hitstop(0.07);
    for (const a of this.actors) {
      if (a === source || a.dead || a.team === spareTeam) continue;
      const d = Math.hypot(a.x - x, (a.z - z) * 1.2);
      if (d > radius) continue;
      const heroMul = a.team === 'hero' ? HERO_BLAST : 1;
      applyHit(this, a, { attacker: null, explosion: true, dmg: dmg * (1 - d / radius * 0.5) * heroMul, knock: 6, dir: sign(a.x - x) || 1, zone: 'all', knockdown: true, sever: 2, hitstop: 0, shake: 0 });
    }
    for (const p of this.props) {
      if (p.broken) continue;
      if (Math.hypot(p.x - x, (p.z - z) * 1.2) < radius) p.hit(this, 999, sign(p.x - x) || 1);
    }
    // 근처 차량 유폭 (연쇄 폭발)
    for (const c of this.cars()) {
      const nx = Math.max(c.x, Math.min(x, c.x + c.len)), nz = Math.max(c.z, Math.min(z, c.z + c.dep));
      if (Math.hypot(nx - x, (nz - z) * 1.2) < radius) this.hitCar(c, 999, sign(c.x + c.len / 2 - x) || 1);
    }
  }

  // 튄 피가 캐릭터에 닿음 → 맞은 높이의 부위에 묻음 (일부는 그대로 통과해 뒤로 날아감)
  bloodHitActor(x, y, z) {
    for (const a of this.actors) {
      if (a.hidden || a.remove || a.fellOut) continue;
      if (Math.abs(a.x - x) > 0.42 * a.scale || Math.abs(a.z - z) > 0.38) continue;
      const lying = a.state === 'down' || a.state === 'dying' || a.state === 'ko';
      const top = lying ? 0.55 : a.model.height * a.scale;
      if (y < a.y - 0.05 || y > a.y + top) continue;
      const f = (y - a.y) / top, F = z >= a.z ? 'F' : 'B';
      let k;
      if (lying) k = ['head', 'torso', 'torso', 'arm' + F, 'leg' + F, 'shin' + F][Math.floor(Math.random() * 6)];
      else if (f > 0.8) k = 'head';
      else if (f > 0.45) k = ['torso', 'torso', 'arm' + F, 'hand' + F][Math.floor(Math.random() * 4)];
      else if (f > 0.22) k = 'leg' + F;
      else k = 'shin' + F;
      const amt = a.team === 'hero' ? BLOOD.heroAmt : BLOOD.enemyAmt;
      a.addBlood(k, amt);
      // 옆 부위로 번짐 (과장)
      const NB = { head: ['torso'], torso: ['head', 'armF', 'armB', 'legF'], armF: ['torso', 'handF'], armB: ['torso', 'handB'], handF: ['armF'], handB: ['armB'],
        legF: ['torso', 'shinF'], legB: ['torso', 'shinB'], shinF: ['legF'], shinB: ['legB'] };
      for (const n of NB[k] || []) a.addBlood(n, amt * (a.team === 'hero' ? BLOOD.spread : BLOOD.enemySpread));
      return Math.random() > BLOOD.passThrough;
    }
    return false;
  }

  // ------------------------------------------------ 주차된 차 (부수면 폭발)
  cars() { return this.stage.solids.filter(s => s.car && !s.wreck); }
  // (x, z) 근처(여유 pad)에 있는 차
  carAt(x, z, pad = 0, y = 0) {
    if (y > 1.6) return null;
    for (const c of this.stage.solids) {
      if (!c.car || c.wreck) continue;
      if (x > c.x - pad && x < c.x + c.len + pad && z > c.z - pad * 0.6 && z < c.z + c.dep + pad * 0.6) return c;
    }
    return null;
  }
  hitCar(c, dmg, dir) {
    if (!c.car || c.wreck) return;
    const cx = c.x + c.len / 2, cz = c.z + c.dep / 2;
    const first = c.hp === c.max;
    c.hp -= dmg; c.flash = 0.1;
    this.debris.sparks(cx - dir * c.len * 0.4, 0.9, cz + 0.6, 0xfff3a0, 8, 3);
    this.debris.puff(cx, 1.2, cz + 0.4, [0xbfe6ff, 0x8fc8ee, 0xe8f6ff], 6, 2.5, .07, .5, 0.05); // 유리 파편
    if (first) { this.sfx?.('alarm'); c.alarmT = 2.5; }
    if (c.hp <= 0 && c.fuse < 0) { c.fuse = TRAPS.car.fuse;}
  }
  updateCars(dt) {
    if (!this.stage.biome.city) return;
    for (const c of this.stage.solids) {
      if (!c.car) continue;
      if (c.flash > 0) c.flash -= dt;
      if (c.alarmT > 0) c.alarmT -= dt;
      const cx = c.x + c.len / 2, cz = c.z + c.dep / 2;
      if (c.wreck) {   // 잔해: 불타며 연기
        c.smokeT -= dt;
        if (c.smokeT <= 0 && c.burnT > 0) { c.smokeT = 0.12; this.debris.puff(cx + rand(-1, 1), 1.1, cz, [0xff8a1f, 0xffd24a, 0x444444, 0x666666], 2, 1.2, .14, .9, -0.15); }
        if (c.burnT > 0) c.burnT -= dt;
        continue;
      }
      if (c.hp < c.max * 0.5) {
        c.smokeT -= dt;
        if (c.smokeT <= 0) { c.smokeT = c.fuse >= 0 ? 0.04 : 0.25; this.debris.puff(cx + c.len * 0.3, 1.2, cz, c.fuse >= 0 ? [0xff8a1f, 0x555555] : [0x777777, 0x999999], 2, 1, .12, .8, -0.15); }
      }
      if (c.fuse >= 0) {
        c.fuse -= dt;
        if (c.fuse < 0) this.explodeCar(c);
      }
    }
  }
  explodeCar(c) {
    const cx = c.x + c.len / 2, cz = c.z + c.dep / 2;
    c.wreck = true; c.burnT = 9; c.fuse = -1;
    mat4.identity(M); mat4.translate(M, c.x + 0.02, 0, c.z + 0.1);
    this.debris.burst(getModel(this.r, c.model).voxels, M, { frac: .45, size: .13, spread: 6 });
    c.model = 'carwreck';
    this.stains.removeBox(c.x, c.x + c.len, c.z, c.z + c.dep, 0.9);  // 지붕 위 핏자국은 함께 날아감
    for (let x = c.x; x < c.x + c.len; x++) for (let z = c.z; z < c.z + c.dep; z++) this.stage.solid.set(x + ',' + z, 1.0);
    this.debris.puff(cx, 1.4, cz, [0xffe14a, 0xff8a1f, 0xd94a2a, 0x333333], 60, 7, .3, 1.1, -0.1);

    this.explode(cx, cz, TRAPS.car.radius, TRAPS.car.dmg, null);
    this.shake(0.7);
  }

  // ------------------------------------------------ 아이템 / 무기
  // L 키가 지금 무엇을 할지 (우선순위: 바닥 무기·음식 > 들고 있는 것 던지기 > 드럼통·오토바이 > 무기 던지기 > 적 잡기 > 신체 조각)
  lAction(p) {
    let best = null, bd = 1e9;
    for (const it of this.items) {
      if (it.kind === 'scrap' || it.kind === 'food') continue;   // 음식은 닿으면 자동으로 먹음
      const dx = Math.abs(it.x - p.x), dz = Math.abs(it.z - p.z);
      if (dx < 0.9 && dz < 0.6 && dx + dz < bd) { best = it; bd = dx + dz; }
    }
    if (best) return { type: 'item', obj: best, x: best.x, y: 0.7, z: best.z, verb: '줍기', label: best.kind === 'food' ? '음식' : WEAPONS[best.type].name };
    if (p.carry) return { type: 'throwCarry' };
    if (!p.weapon) {
      const bar = this.props.find(b => b.kind === 'barrel' && !b.broken && b.fuse < 0 && Math.abs(b.x - p.x) < 1.0 && Math.abs(b.z - p.z) < 0.65);
      if (bar) return { type: 'barrel', obj: bar, x: bar.x, y: 1.3, z: bar.z, verb: '들기', label: '드럼통' };
      const moto = this.props.find(b => b.kind === 'moto' && !b.broken && b.fuse < 0 && Math.abs(b.x - p.x) < 1.3 && Math.abs(b.z - p.z) < 0.7);
      if (moto) return { type: 'moto', obj: moto, x: moto.x, y: 1.1, z: moto.z, verb: '들기', label: '오토바이' };
    }
    if (p.weapon) return { type: 'throwWeapon' };
    const e = this.grabbable(p);
    if (e) return { type: 'grab', obj: e, x: e.x, y: e.y + 2.2 * e.scale, z: e.z, verb: '잡기', label: e.blockedGrab ? '방패에 막힘' : '' };
    const gib = this.gibs.nearest(p.x, p.z);
    if (gib) return { type: 'gib', obj: gib, x: gib.pos[0], y: gib.pos[1] + 0.6, z: gib.pos[2], verb: '줍기', label: PART_NAME[gib.part] ?? '조각' };
    return null;
  }

  eatFood(p, it) {
    const heal = Math.min(p.maxHp - p.hp, 30);
    p.hp += heal;
    this.texts.add(p.x, p.y + 2.3, p.z, `+${heal}`, 'heal');
    this.debris.puff(p.x, p.y + 1, p.z, [0x7af08f, 0xc8ffd0], 10, 1.4, .1, .5, -0.6);
    this.sfx?.('pickup');
  }

  interact(p) {
    const act = this.lAction(p);
    if (!act) { this.sfx?.('clang'); return; }
    const o = act.obj;
    switch (act.type) {
      case 'item':
        o.remove = true;
        this.sfx?.('pickup');
        if (o.kind === 'food') {
          p.hp = Math.min(p.maxHp, p.hp + 30);
          this.texts.add(p.x, 2.2, p.z, '+30', 'heal');
        } else {
          if (p.carry) this.dropCarry(p);
          if (p.weapon) this.dropWeapon(p);
          const fresh = o.dur === WEAPONS[o.type].dur;
          const dur = o.dur * (fresh && this.run.perks.has('durable') ? 1.6 : 1) * (fresh ? this.stats.player.durMul : 1);
          p.weapon = { type: o.type, dur: Math.round(dur) };
          if (o.type === 'manhole') this.stat('manhole');
          this.texts.add(p.x, 2.3, p.z, WEAPONS[o.type].name, 'item');
        }
        return;
      case 'throwCarry': p.startAttack(p.carry.kind === 'barrel' || p.carry.kind === 'moto' ? 'pThrowBarrel' : 'pThrowGib'); return;
      case 'barrel': case 'moto':
        o.broken = true; // 바닥에서 치움
        p.carry = { kind: act.type };
        this.texts.add(p.x, 2.6, p.z, act.type === 'barrel' ? '폭탄 드럼통 — 던져라!' : '오토바이 번쩍! — 던져라!', 'item');
        this.sfx?.('pickup');
        return;
      case 'throwWeapon': p.startAttack('pThrow'); return;
      case 'grab':
        if (o.blockedGrab) { this.texts.add(o.x, o.y + 2.2 * o.scale, o.z, '막음!', 'item'); this.sfx?.('clang'); return; }
        this.startGrab(p, o); return;
      case 'gib': {
        p.carry = this.gibs.take(o);
        this.sfx?.('pickup');
        const lk = limbKind(o.part);
        p.carry.limb = lk; p.carry.local = null;
        if (lk) p.carry.dur = LIMB_WEAPONS[lk].dur;
        this.texts.add(p.x, 2.3, p.z, (PART_NAME[o.part] ?? '조각') + (lk ? ' — 휘둘러라!' : ''), 'item');
      }
    }
  }

  // L 키 대상 표시 (대상 위에 '[L] 줍기: 쇠파이프' 같은 라벨)
  updateLHint() {
    const p = this.player;
    const act = (p.state === 'idle' || p.state === 'walk') && p.alive ? this.lAction(p) : null;
    if (!act || act.x === undefined) { this.texts.setHint(null); return; }
    const key = document.documentElement.classList.contains('mobile') ? '줍기' : 'L';
    this.texts.setHint({ x: act.x, y: act.y, z: act.z, html: `<b>[${key}]</b> ${act.verb}${act.label ? ': ' + act.label : ''}` });
  }

  // ------------------------------------------------ 잡기 (더블드래곤식 멱살 잡기 → 무릎 / 던지기)
  grabbable(p) {
    let best = null, bd = 1e9;
    for (const e of this.enemies) {
      if (e.dead || e.isBoss || e.mounted || e.grabbedBy || e.flipping || e.y > 0.4 + (e.floor ?? 0) || e.invuln > 0) continue;
      if (e.state === 'down' || e.state === 'getup' || e.state === 'dying') continue;
      const dx = (e.x - p.x) * p.facing, dz = Math.abs(e.z - p.z);
      if (dx < -0.15 || dx > 0.95 * Math.max(1, e.scale * 0.85) || dz > 0.45) continue;
      if (dx + dz < bd) { best = e; bd = dx + dz; }
    }
    // 방패병: 정면에서는 방패에 막힘 (뒤나 가드 브레이크 중에는 잡힘)
    if (best) best.blockedGrab = !!(best.shieldUp?.() && best.facing === -p.facing && best.guardBroken <= 0);
    return best;
  }

  startGrab(p, e) {
    e.interrupt(); this.releaseToken(e);
    if (e.goItem) { e.goItem.claimed = null; e.goItem = null; }
    p.interrupt();
    p.grabbing = e; p.grabT = 0; p.knees = 0;
    e.grabbedBy = p; e.facing = -p.facing; e.vx = e.vz = 0;
    e.setState('hurt'); e.hitstun = 99;
    p.setState('grab');
    // 덩치(슈퍼아머)는 금방 뿌리침
    e.grabEscape = e.def.poise ? 0.95 : 2.1;

    this.sfx?.('thud');
  }

  releaseGrab(p, escaped = false) {
    const e = p?.grabbing;
    if (p) { p.grabbing = null; if (p.state === 'grab') p.setState('idle'); }
    if (!e) return;
    e.grabbedBy = null;
    if (escaped && !e.dead) {
      e.setState('idle'); e.cool = Math.min(e.cool, 0.3);
      p.vx = -p.facing * 4; p.setState('hurt'); p.hitstun = 0.25;
      this.texts.add(e.x, e.y + 2.2 * e.scale, e.z, '뿌리침!', 'hurt');
      this.sfx?.('swing');
    }
  }

  // 잡은 상태에서 J: 무릎 차기 (세 번째는 강하게 날려버림)
  grabKnee(p) {
    const e = p.grabbing;
    if (!e) return;
    p.knees++;
    const fin = p.knees >= 3;
    if (fin) this.releaseGrab(p);
    applyHit(this, e, {
      attacker: p, grab: true, dmg: (fin ? 15 : 8) * p.power * (this.stats.player.fx?.has('knee') ? 1.4 : 1), knock: fin ? 7 : 0, dir: p.facing, zone: fin ? 'head' : 'mid',
      knockdown: fin, launch: fin ? 6 : undefined, sever: fin ? 1.0 : 0.4, hitstop: fin ? .1 : .06, shake: fin ? .15 : .06, hitstun: 99,
    });
    if (!fin && !e.dead && e.grabbedBy === p) { e.setState('hurt'); e.hitstun = 99; }
    this.addCombo();
    if (fin) { this.stat('knee'); this.goreBonus(e, 'knee'); }
  }

  // 잡은 상태에서 L: 던지기 → 날아가는 몸이 되어 다른 적과 충돌
  grabThrow(p) {
    const e = p.grabbing;
    if (!e) return;
    this.releaseGrab(p);
    const dir = p.facing;
    e.x = p.x + dir * 0.5; e.facing = -dir;
    applyHit(this, e, {
      attacker: p, grab: true, dmg: 12 * p.power * this.stats.player.throwMul, knock: 11.5, dir, zone: 'all',
      knockdown: true, launch: 5, sever: 0.5, hitstop: .08, shake: .2,
    });
    this.addCombo();

    this.sfx?.('heavy');
  }

  dropWeapon(a) {
    if (!a.weapon) return;
    if (this.run?.lab && a === this.player) { this.debris.puff(a.x, 0.8, a.z, [0xd8d0c0, 0xffffff], 6, 1.2, .1, .35, -0.3); a.weapon = null; return; }   // 무기방: 버린 무기는 사라짐(진열대에 다시 생김)
    this.items.push(new Item('weapon', a.weapon.type, a.x, a.z, { y: 0.8, vy: 3, vx: -a.facing * 1.5, dur: Math.min(a.weapon.dur, WEAPONS[a.weapon.type].dur) }));
    a.weapon = null;
  }

  breakWeapon(a) {
    const vox = getModel(this.r, WEAPON_MODEL[a.weapon.type]).voxels;
    mat4.identity(M); mat4.translate(M, a.x + a.facing * 0.6, 1.0, a.z);
    this.debris.burst(vox, M, { frac: 0.8, size: 0.1, spread: 2 });
    this.texts.add(a.x, 2.3, a.z, '무기 파손!', 'hurt');
    this.sfx?.('crush');
    a.weapon = null;
  }

  // 샷건 총구 불꽃 + 산탄 궤적
  muzzleFlash(tip, dir) {
    const [x, y, z] = tip;
    // 큰 총구 섬광 (밝은 덩어리 몇 개) + 총열 끝 충격파
    for (let i = 0; i < 6; i++) this.debris.spawn(x + dir * (.1 + i * .12), y + (Math.random() - .5) * .1, z, dir * 2, 0, 0, 1, .95, .7, .26 - i * .03, .06, 0);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; this.debris.spawn(x + dir * .15, y, z, dir * 1.5, Math.cos(a) * 3, Math.sin(a) * 3, 1, 1, .85, .05, .1, 0); }
    this.debris.puff(x + dir * .2, y, z, [0xffffff, 0xfff3a0, 0xffb03a], 18, 3, .16, .12, 0);
    for (let i = 0; i < 18; i++) {
      const sp = 26 + Math.random() * 10;
      this.debris.spawn(x, y, z, dir * sp, (Math.random() - .45) * 5, (Math.random() - .5) * 9, 1, .9, .6, .06, .14, 0);
    }
    this.debris.puff(x + dir * .6, y + .1, z, [0x9c9c9c, 0x6a6a6a], 8, 1.2, .2, .7, -0.4);
    this.shake(0.38);
    this.sfx?.('shot');
  }

  // 펌프 장전: 철컥 소리와 함께 붉은 탄피가 뒤로 튀어 나감, 총구에선 연기
  shellEject(a) {
    const f = a.facing, x = a.x + f * .3, y = a.y + 1.25 * a.scale;
    this.debris.spawn(x, y, a.z + .1, -f * (1.2 + Math.random()), 3.5 + Math.random(), (Math.random() - .5) * .8, .78, .14, .12, .08, 2.2, 1);
    this.debris.spawn(x, y, a.z + .1, -f * (1.0 + Math.random()), 3.2 + Math.random(), (Math.random() - .5) * .8, .85, .66, .2, .05, 2.2, 1);
    const tip = a.weaponTip ? a.weaponTip(1.1) : [x + f, y, a.z];
    this.debris.puff(tip[0], tip[1] + .05, tip[2], [0x8a8a8a, 0x6a6a6a], 4, .5, .16, .9, -0.6);
    this.sfx?.('pump');
  }

  // 화염 분사 입자 (위로 피어오르는 불길)
  flameSpray(tip, dir, dt) {
    const [x, y, z] = tip;
    const n = Math.ceil(dt * 240);
    for (let i = 0; i < n; i++) {
      const c = [[1, .92, .45], [1, .7, .15], [1, .5, .08], [.92, .3, .06], [.45, .4, .38]][Math.floor(Math.random() * 5)];
      const sp = 6 + Math.random() * 3.5;
      // 멀리 갈수록 커지며 위로 피어오름
      this.debris.spawn(x, y, z, dir * sp, (Math.random() - .25) * 2, (Math.random() - .5) * 3, c[0], c[1], c[2], .12 + Math.random() * .16, .3 + Math.random() * .18, -0.35);
    }
  }

  // 탄약·연료를 다 쓴 무기를 내던짐
  discardWeapon(a) {
    const w = a.weapon;
    if (!w) return;
    a.weapon = null;
    this.texts.add(a.x, 2.3, a.z, WEAPONS[w.type].ammo ? '탄약 소진!' : '연료 소진!', 'hurt');
    const vox = getModel(this.r, WEAPON_MODEL[w.type]).voxels;
    mat4.identity(M); mat4.translate(M, a.x - a.facing * .4, 1.0, a.z);
    this.debris.burst(vox, M, { frac: .7, size: .1, spread: 1.6, impulse: [-a.facing * 2, 2, 0] });
  }

  // 방패병의 맨홀 뚜껑이 떨어짐 → 플레이어가 주워 쓸 수 있음
  dropShield(v) {
    if (!v.blocks) return;
    v.blocks = false;
    this.items.push(new Item('weapon', 'manhole', v.x, v.z, { y: 1, vy: 4, vx: -v.facing * 1.5 }));
    this.texts.add(v.x, v.y + 2.2 * v.scale, v.z, '방패 떨어짐!', 'sever');
    this.sfx?.('clang');
  }

  // 오토바이 돌진에 치임
  bikeHit(b, a) {
    const saw = b.isBoss && b.weapon?.type === 'chainsaw';   // 보스: 전기톱 팔을 내밀고 지나감
    applyHit(this, a, { attacker: b, dmg: (a.team === 'enemy' ? 14 : 16) * (b.isBoss ? 1.4 : 1), knock: b.isBoss ? 9 : 8, dir: b.facing, zone: saw ? 'mid' : 'low', knockdown: true, sever: saw ? 2.4 : 1.3, mode: saw ? 'saw' : 'knock', launch: 6.5, hitstop: .06, shake: .2 });
    if (saw) this.bleed(a.x, a.y + 1.1 * a.scale, a.z + .2, b.facing, 14);

  }

  // 폭주족이 오토바이에서 떨어짐 → 오토바이는 바닥 오브젝트(주워서 던지기 가능)
  dismount(v, dir = 1, dying = false) {
    if (!v.mounted) return;
    v.mounted = false; v.revving = false; v.bikePhase = null;
    const s = this.stage.safeSpot(v.x - dir * 0.6, v.z);
    const m = new Prop('moto', s.x, s.z);
    m.tilt = dir > 0 ? Math.PI : 0;
    this.props.push(m);
    this.debris.sparks(v.x, 0.4, v.z + 0.2, 0xfff3a0, 14, 4);
    this.sfx?.('clang');
    if (!dying) {

      if (!v.weapon && Math.random() < 0.5) v.weapon = { type: pick(['chain', 'bat', 'pipe']), dur: 6 };
    }
  }

  // 들고 있던 것을 발밑에 내려놓음 (드럼통은 다시 오브젝트로)
  dropCarry(a) {
    const c = a.carry;
    a.carry = null;
    if (!c) return;
    if (c.kind === 'barrel' || c.kind === 'moto') {
      const s = this.stage.safeSpot(a.x + a.facing * 0.5, a.z);
      const b = new Prop(c.kind, s.x, s.z);
      this.props.push(b);
      return;
    }
    this.gibs.drop(c, a.x, a.z);
  }

  // 휘두르던 신체 부위가 박살남
  breakCarry(a) {
    const c = a.carry;
    a.carry = null;
    if (!c) return;
    (c.lastM ?? []).forEach((M, i) => this.debris.burst(c.members[i].voxels, M, { frac: .85, size: .1, spread: 2.4 }));
    this.bleed(a.x + a.facing * 0.8, 1.2, a.z, a.facing, 30);
    this.texts.add(a.x, 2.3, a.z, '박살!', 'sever');
    this.sfx?.('splat');
  }

  breakProp(p, dir) {
    p.broken = true;
    mat4.identity(M); mat4.translate(M, p.x, 0, p.z);
    this.debris.burst(getModel(this.r, p.model).voxels, M, { frac: 0.5, size: 0.14, impulse: [dir * 2, 1, 0] });
    const roll = Math.random();
    if (roll < 0.5) this.items.push(new Item('weapon', rollWeapon(), p.x, p.z, { y: 0.5, vy: 4 }));
    else if (roll < 0.75) this.items.push(new Item('food', null, p.x, p.z, { y: 0.5, vy: 4 }));
    else for (let i = 0; i < 2; i++) this.items.push(new Item('scrap', null, p.x, p.z, { y: .5, vy: rand(4, 6), vx: rand(-2, 2) }));
  }

  collectScrap(v) {
    this.run.scrap += v * (this.run.perks.has('scrapper') ? 1.5 : 1) * this.stats.player.scrapMul * (1 + HEAT.scrap * this.heat);
    this.sfx?.('coin');
  }

  // ------------------------------------------------ 투사체
  spawnProjectile(o) {
    let dmg = o.dmg;
    if (o.team === 'hero' && this.run.perks.has('thrower')) dmg *= 1.8;
    if (o.owner === this.player) dmg *= this.stats.player.throwMul;
    this.projectiles.push({
      ...o, dmg,
      vx: o.dir * (o.kind === 'weapon' ? 11 : o.kind === 'barrel' || o.kind === 'moto' ? 9 : o.kind === 'shuriken' ? 13 : 7.5), vy: o.kind === 'brick' ? 2.5 : o.kind === 'barrel' || o.kind === 'moto' ? 1.5 : o.kind === 'shuriken' ? 0 : 1.2,
      spin: 0, life: 2.5, dead: false,
    });
  }

  updateProjectiles(dt) {
    for (const pr of this.projectiles) {
      pr.life -= dt;
      pr.vy -= (pr.kind === 'barrel' || pr.kind === 'moto' ? 14 : pr.kind === 'shuriken' ? 0 : 7) * dt;
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      pr.spin += dt * (pr.kind === 'moto' ? 7 : 16);
      if (pr.life <= 0) { pr.dead = true; continue; }
      for (const a of this.actors) {
        if (a.team === pr.team || !a.alive || a.state === 'down') continue;
        const big = pr.kind === 'barrel' ? 0.25 : pr.kind === 'moto' ? 0.45 : 0;
        if (Math.abs(a.x - pr.x) > 0.3 + big + a.radius || Math.abs(a.z - pr.z) > 0.45 + big) continue;
        if (pr.y < a.y - 0.1 || pr.y > a.y + 1.9 * a.scale) continue;
        if (pr.kind === 'barrel' || pr.kind === 'moto') { this.projectileEnd(pr); break; }
        const isW = pr.kind === 'weapon';
        applyHit(this, a, {
          attacker: pr.owner, dmg: pr.dmg * (pr.owner?.power ?? 1), knock: isW ? 5 : pr.kind === 'shuriken' ? 1.2 : 2.5, dir: sign(pr.vx), zone: 'high', hitstun: pr.kind === 'shuriken' ? .18 : undefined,
          knockdown: isW, sever: isW ? WEAPONS[pr.weaponType].sever : 0.6, hitstop: .06, shake: .08,
        });
        this.projectileEnd(pr);
        break;
      }
      if (!pr.dead && pr.team === 'hero') {
        for (const p of this.props) {
          if (p.broken || Math.abs(p.x - pr.x) > 0.5 || Math.abs(p.z - pr.z) > 0.6 || pr.y > 1.2) continue;
          if (pr.kind !== 'barrel' && pr.kind !== 'moto') p.hit(this, pr.dmg, sign(pr.vx));
          this.projectileEnd(pr);
          break;
        }
      }
      if (!pr.dead && pr.kind !== 'shuriken') {
        const car = this.carAt(pr.x, pr.z, 0.1, pr.y);
        if (car && pr.y < 1.4) { if (pr.kind !== 'barrel' && pr.kind !== 'moto') this.hitCar(car, pr.dmg * 1.5, sign(pr.vx)); this.projectileEnd(pr); }
      }
      if (!pr.dead && pr.y <= this.floorAt(pr.x, pr.z)) this.projectileEnd(pr);
      if (pr.y < -6) pr.dead = true;
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);
  }

  projectileEnd(pr) {
    pr.dead = true;
    if (pr.kind === 'barrel') {
      // 던진 드럼통: 닿는 순간 폭발 (조금 더 강력)
      this.explode(pr.x, pr.z, TRAPS.barrel.radius * 1.1, TRAPS.barrel.dmg * 1.2 * (pr.owner === this.player ? this.stats.player.throwMul : 1), null, pr.team); // 던진 쪽 편은 피해 없음
      return;
    }
    if (pr.kind === 'moto') {
      // 던진 오토바이: 충돌 즉시 대폭발 + 부품이 사방으로
      const T = TRAPS.moto;
      mat4.identity(M); mat4.translate(M, pr.x, Math.max(0.3, pr.y), pr.z);
      this.debris.burst(getModel(this.r, 'moto').voxels, M, { frac: .7, size: .12, spread: 5 });

      this.explode(pr.x, pr.z, T.throwRadius, T.throwDmg * (pr.owner === this.player ? this.stats.player.throwMul : 1), null, pr.team);
      return;
    }
    if (pr.kind === 'weapon' && pr.dur > 1 && !this.run.lab) {
      this.items.push(new Item('weapon', pr.weaponType, pr.x, pr.z, { y: Math.max(0.2, pr.y), vy: 3, vx: -sign(pr.vx) * 1.5, dur: pr.dur - 1 }));
    } else {
      const key = pr.kind === 'weapon' ? WEAPON_MODEL[pr.weaponType] : pr.kind === 'barrel' || pr.kind === 'moto' ? pr.kind : pr.kind === 'shuriken' ? 'shuriken' : 'brick';
      mat4.identity(M); mat4.translate(M, pr.x, Math.max(0.1, pr.y), pr.z);
      this.debris.burst(getModel(this.r, key).voxels, M, { frac: 0.9, size: 0.1, spread: 2 });
    }
  }

  bleed(x, y, z, dir, n) { bleed(this.debris, x, y, z, dir, this.stats?.player.fx?.has('gore2') ? n * 2 : n); }

  // ------------------------------------------------ 연출
  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); }
  shake(m) { this.shakeMag = Math.max(this.shakeMag, m); }
  banner(text, dur = 2) { this.hooks.banner(text, dur); }
  say(a, text) { this.texts.add(a.x, a.y + 2.5 * a.scale, a.z, text, 'say'); }
  addCombo(isBot) {
    if (isBot) return;
    this.combo++; this.comboT = 1.6;
    this.run.maxCombo = Math.max(this.run.maxCombo, this.combo);
  }

  // 도시 요소: 도로 표시, 주차된 차·쓰레기통, 전봇대·전선, 간판 (화면 근처만)
  drawCity(r) {
    const st = this.stage;
    if (!st.biome.city) return;
    const near = x => Math.abs(x - this.camX) < this.viewHalf + 8;
    r.drawMesh(st.roadMarks, IDENT, null, 0);
    for (const s of st.solids) {
      if (!near(s.x)) continue;
      mat4.identity(M); mat4.translate(M, s.x + 0.02, 0, s.z + 0.1);
      let tint = null;
      if (s.car && !s.wreck) {
        if (s.flash > 0) tint = CAR_FLASH;
        else if (s.fuse >= 0 && Math.floor(this.time * 20) % 2) tint = CAR_WARN;
        else if (s.alarmT > 0 && Math.floor(this.time * 6) % 2) tint = CAR_ALARM;
        if (s.fuse >= 0) mat4.translate(M, (Math.random() - .5) * .08, 0, 0);
      }
      r.drawMesh(getModel(r, s.model).mesh, M, tint, 0, 1, null, true);
    }
    for (const p of st.poles) {
      if (!near(p.x)) continue;
      mat4.identity(M); mat4.translate(M, p.x, 0, p.z);
      r.drawMesh(getModel(r, 'pole').mesh, M);
    }
    for (const s of st.signs) {
      if (!near(s.x)) continue;
      mat4.identity(M); mat4.translate(M, s.x, s.y, s.z);
      r.drawMesh(s.mesh, M);
    }
    if (st.wireCount) r.drawInstances(st.wires, st.wireCount);
  }

  // ------------------------------------------------ 렌더링
  render() {
    const r = this.r;
    this.aspect = r.resize();
    const sx = (Math.random() - .5) * this.shakeMag, sy = (Math.random() - .5) * this.shakeMag;
    const eye = [this.camX + sx, 8.6 + sy, 15.5];
    mat4.perspective(this.proj, 35 * Math.PI / 180, this.aspect, 0.5, 140);
    mat4.lookAt(this.view, eye, [this.camX + sx * .5, 1.0, -0.6], [0, 1, 0]);
    mat4.multiply(this.vp, this.proj, this.view);
    const b = this.stage.biome;
    r.begin(this.vp, eye, { sky: b.sky, fog: b.fog, fogNear: 34, fogFar: 80 });
    this.stains.flush();
    r.drawMesh(this.stage.terrain, IDENT, null, 8, 1, null, true);
    this.drawCity(r);
    if (this.stage.hazardN) r.drawInstances(this.stage.hazard, this.stage.hazardN);
    for (const t of this.traps) t.draw(r, this);
    for (const p of this.props) p.draw(r, this);
    for (const it of this.items) it.draw(r, this);
    for (const a of this.actors) a.draw(r);
    for (const pr of this.projectiles) {
      mat4.identity(M); mat4.translate(M, pr.x, pr.y, pr.z); mat4.rotateZ(M, -pr.spin * sign(pr.vx));
      const key = pr.kind === 'weapon' ? WEAPON_MODEL[pr.weaponType] : pr.kind === 'barrel' || pr.kind === 'moto' ? pr.kind : pr.kind === 'shuriken' ? 'shuriken' : 'brick';
      r.drawMesh(getModel(r, key).mesh, M);
    }
    this.gibs.draw(r);
    let rn = 0;
    for (const a of this.actors) rn = a.fillRope(this.ropeBuf, rn, 1200);
    r.drawInstances(this.ropeBuf, rn);
    r.drawInstances(this.debris.inst, this.debris.fill());

    // 발밑 그림자 (라인 깊이를 읽게 해주는 핵심 장치)
    const sb = this.shadowBuf;
    let n = 0;
    const add = (x, z, s, fy = this.floorAt(x, z)) => {
      if (n >= 256 || fy === PIT) return;
      const o = n * 7;
      sb[o] = x; sb[o + 1] = fy - s / 2 + 0.03; sb[o + 2] = z; sb[o + 3] = s; sb[o + 4] = sb[o + 5] = sb[o + 6] = 0;
      n++;
    };
    for (const a of this.actors) if (!a.remove && !a.hidden) add(a.x, a.z, (a.fall > 0.5 ? 1.0 : 0.62) * a.scale * Math.max(0.4, 1 - (a.y - a.floor) / 4), a.floor);
    for (const it of this.items) add(it.x, it.z, 0.3);
    for (const gb of this.gibs.list) if (Math.abs(gb.pos[0] - this.camX) < this.viewHalf + 2) add(gb.pos[0], gb.pos[2], 0.35);
    for (const pr of this.projectiles) add(pr.x, pr.z, 0.25);
    r.drawInstances(sb, n, 0.3, true);
    this.drawHeroRing(r);
    this.drawRageEyes(r);
  }

  // 배트 풀스윙 잔상: 배트 끝 궤적을 따라 하얀 줄무늬 입자
  batTrail(a) {
    if (!a.weaponTip) return;
    for (const len of [1.0, 0.75, 0.5]) {
      const p = a.weaponTip(len);
      this.debris.spawn(p[0], p[1], p[2], 0, 0, 0, 1, 1, 1, 0.09 * len + 0.03, 0.12, 0);
    }
  }

  // 광폭화 중 하얀 눈빛 (빨강 대신 흰색으로 — 피범벅이어도 눈에 띄게)
  drawRageEyes(r) {
    const p = this.player;
    if (!p?.berserk || p.hidden || !p.parts.head?.alive) return;
    p.rootMatrix(RAGE_M1); p.partMatrix('head', RAGE_M1, RAGE_M2);
    // 머리 모델(6칸) 기준 눈 위치: 앞면(x) 3.6칸, 높이 3.5칸, 좌우 -1.5 / +2.5칸 (V = 0.09m)
    const V = 0.09, s = p.model.headS ?? 6, ex = (s / 2 + 0.6) * V, ey = 3.5 * V, z1 = (2.5 - (s + 2) / 2) * V, z2 = (s - 0.5 - (s + 2) / 2) * V;
    this.eyeBuf ??= new Float32Array(2 * 7); this.eyeGlow ??= new Float32Array(10 * 7);
    const b = this.eyeBuf, gb = this.eyeGlow, fl = 0.85 + Math.sin(this.time * 18) * 0.15, pt = [0, 0, 0];
    let n = 0;
    [z1, z2].forEach((z, i) => {
      mat4.point(pt, RAGE_M2, ex, ey, z);
      b.set([pt[0], pt[1], pt[2], 0.11, 1, 1, 1], i * 7);                                   // 눈 (선명한 흰색)
      gb.set([pt[0], pt[1], pt[2], 0.26 * fl, 1, 1, 1], n++ * 7);                           // 번지는 빛
      for (let k = 1; k <= 4; k++)                                                          // 뒤로 흩날리는 눈빛 꼬리
        gb.set([pt[0] - p.facing * (0.09 * k + 0.03), pt[1] + 0.012 * k, pt[2], 0.09 * (1 - k * 0.17) * fl, 1, 1, 1], n++ * 7);
    });
    r.drawInstances(gb, n, 0.4, true);
    r.drawInstances(b, 2, 1, true);
  }

  // 피범벅이 된 주인공 발밑의 흰 고리 (피와 같은 색이 되어 위치를 놓치지 않게)
  drawHeroRing(r) {
    const p = this.player;
    if (!p || p.hidden || !p.blood) return;
    const v = Object.values(p.blood), avg = v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
    const k = Math.min(1, (avg - BLOOD.ringFrom) / 0.2);
    if (k <= 0) return;
    this.ringBuf ??= new Float32Array(28 * 7);
    const b = this.ringBuf, fy = p.floor ?? this.floorAt(p.x, p.z), R = 0.48 * p.scale, pulse = 1 + Math.sin(this.time * 6) * 0.04;
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * Math.PI * 2, o = i * 7;
      b[o] = p.x + Math.cos(a) * R * pulse; b[o + 1] = fy + 0.02; b[o + 2] = p.z + Math.sin(a) * R * 0.75 * pulse; b[o + 3] = 0.07;
      b[o + 4] = b[o + 5] = b[o + 6] = 1;
    }
    r.drawInstances(b, 28, 0.45 + 0.4 * k, true);
  }
}
