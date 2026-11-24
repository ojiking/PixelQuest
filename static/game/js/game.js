// 게임 월드: 스테이지 진행, 카메라, 웨이브, 투사체, 폭발, 렌더링
import { mat4, clamp, rand, randi, sign, shuffle, pick, weightedPick } from './math.js';
import { BIOMES, BOT, LANE, WEAPONS, ENEMIES, LIMB_WEAPONS, limbKind, TRAPS } from './config.js';
import { Debris } from './fx.js';
import { Gibs, bleed } from './gibs.js';
import { getModel, WEAPON_MODEL } from './models.js';
import { Player } from './player.js';
import { Companion } from './companion.js';
import { Enemy } from './enemy.js';
import { Stage, STAGE_COUNT, PIT, SEG_HINTS } from './level.js';
import { Item, Prop } from './props.js';
import { applyHit } from './combat.js';

export const PART_NAME = { head: '머리', armF: '팔', armB: '팔', handF: '아래팔', handB: '아래팔', legF: '다리', legB: '다리', shinF: '정강이', shinB: '정강이', torso: '몸통', upper: '상반신', lower: '하반신' };
const SEVER_TEXT = { head: '목 절단!', armF: '팔 절단!', armB: '팔 절단!', handF: '손목 절단!', handB: '손목 절단!', legF: '다리 절단!', legB: '다리 절단!', shinF: '정강이 절단!', shinB: '정강이 절단!' };
const CRUSH_TEXT = { head: '헤드 크러시!!', armF: '팔 분쇄!', armB: '팔 분쇄!', handF: '손 분쇄!', handB: '손 분쇄!', legF: '다리 분쇄!', legB: '다리 분쇄!', shinF: '정강이 분쇄!', shinB: '정강이 분쇄!' };

// 가중치 기반 무기 뽑기
export function rollWeapon(exclude = []) {
  const w = {};
  for (const [k, d] of Object.entries(WEAPONS)) if (!exclude.includes(k)) w[k] = d.weight ?? 1;
  return weightedPick(w);
}
const IDENT = mat4.create();
const M = mat4.create();

export class Game {
  constructor(renderer, input, texts, hooks) {
    this.r = renderer; this.input = input; this.texts = texts; this.hooks = hooks;
    this.debris = new Debris();
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
    this.run = {
      stage: 0, scrap: 0, kills: 0, severs: 0, maxCombo: 0, time: 0,
      perks: new Set(), biomes: shuffle(Object.keys(BIOMES)).slice(0, STAGE_COUNT), rescueUsed: false,
    };
    this.player = new Player(this, stats.player);
    this.bot = new Companion(this, stats.bot);
    this.rescuePending = false;
    this.endTimer = -1;
    this.loadStage(0);
  }

  loadStage(i) {
    if (this.stage) this.stage.dispose(this.r);
    this.run.stage = i;
    this.stage = new Stage(this, i, this.run.biomes[i]);
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
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + Math.round(this.player.maxHp * (0.25 + this.stats.player.regen)));
      if (this.bot.state === 'ko') { this.bot.setState('idle'); this.bot.hp = Math.round(this.bot.maxHp * 0.5); }
    }
    this.actors = [this.player, this.bot];
    this.camX = 0; this.lock = null; this.zoneIdx = 0;
    this.lastSafe = { x: 3, z: 0, y: 0 };
    this.curSeg = null;
    this.running = true;
    this.banner(`STAGE ${i + 1} — ${this.stage.biome.name}`, 2.4);
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
    if (seg && seg !== this.curSeg) { this.curSeg = seg; if (SEG_HINTS[seg.type]) this.banner(SEG_HINTS[seg.type], 1.6); }
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
    this.debris.update(dt, (x, z) => this.floorAt(x, z));
    this.gibs.update(dt);

    for (const a of this.actors) if (a.remove) this.releaseToken(a);
    this.actors = this.actors.filter(a => !a.remove || a.team === 'hero');
    this.enemies = this.actors.filter(a => a.team === 'enemy');
    this.items = this.items.filter(i => !i.remove);
    this.props = this.props.filter(p => !p.broken);

    this.updateZones(dt);
    this.updateCamera(dt);
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    if (this.goT > 0) this.goT -= dt;

    if (this.endTimer >= 0) {
      this.endTimer -= dt;
      if (this.endTimer < 0) { this.running = false; this.hooks.onRunEnd(false); }
    }
    if (!this.lock && this.zoneIdx >= this.stage.zones.length && this.player.x > this.stage.L - 5 && this.endTimer < 0) {
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
    if (inp.pressed('KeyB')) this.spawnEnemy(pick(Object.keys(ENEMIES).filter(k => k !== 'boss')), Math.random() < .5 ? -1 : 1);
  }

  separate() {
    const list = this.actors;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.state === 'down' || a.state === 'ko') continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || b.state === 'down' || b.state === 'ko') continue;
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
        if (d < min && d > 0.0001 && a.y < 0.8) { a.x += dx / d * (min - d); a.z += dz / d * (min - d) / 1.4; }
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
    let target = this.lock ? this.lock.cx : Math.max(this.camX, this.player.x + 1.2);
    target = clamp(target, this.viewHalf - 1.5, this.stage.L - this.viewHalf + 1);
    if (this.camX === 0) this.camX = target;
    this.camX += (target - this.camX) * Math.min(1, dt * 4);
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
        const type = L.queue.shift();
        this.spawnEnemy(type, type === 'boss' ? 1 : (Math.random() < 0.5 ? -1 : 1));
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
      if (L.queue.includes('boss')) this.banner('⚠ 철거반장 등장 ⚠', 2);
    } else {
      this.lock = null;
      this.zoneIdx++;
      this.goT = 2.5;
    }
  }

  // 진행 막힘 방지: 화면 밖에 오래 있거나 제자리에 묶인 적은 화면 안으로 옮기고,
  // 그래도 웨이브가 40초간 변화 없으면 남은 적을 정리
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
      if (e.offT > 3.5 || e.stuckT > 5) {
        const side = e.x < L.cx ? -1 : 1;
        const s = this.stage.safeSpot(L.cx + side * (this.viewHalf - 1.5), this.player.z);
        this.debris.puff(e.x, e.y + 0.5, e.z, [0x9c958a, 0x7a7266], 8, 1.5, .14, .35, -0.3);
        e.x = s.x; e.z = s.z; e.y = this.floorAt(s.x, s.z); e.vx = e.vy = e.vz = 0;
        if (e.goItem) { e.goItem.claimed = 'blocked'; e.goItem = null; }
        e.offT = 0; e.stuckT = 0;
      }
    }
    if (L.idleT > 40) {
      for (const e of alive) { if (!e.dead) this.run.kills++; e.dead = true; e.remove = true; this.releaseToken(e); }
      L.idleT = 0;
    }
  }

  spawnEnemy(type, side) {
    const cx = this.lock ? this.lock.cx : this.camX;
    const spot = this.stage.safeSpot(cx + side * (this.viewHalf + 1.2), rand(LANE.zMin + 0.2, LANE.zMax - 0.2));
    const e = new Enemy(this, type, spot.x, spot.z, 1 + this.run.stage * 0.15);
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
    const cls = v.team === 'hero' ? 'hurt' : (dmg >= 18 ? 'crit' : '');
    this.texts.add(v.x, v.y + 1.9 * v.scale, v.z, String(dmg), cls);
    if (back) this.texts.add(v.x, v.y + 2.4 * v.scale, v.z, '백어택!', 'back');
  }

  severPart(v, k, dir, h = {}) {
    v.severPart(k, dir, h);
    this.run.severs++;
    this.sfx?.(h.mode === 'crush' ? 'crush' : 'splat');
    const crush = h.mode === 'crush';
    const fly = h.fling > 2 && k === 'head' ? '홈런!!' : null;
    this.texts.add(v.x, v.y + 2.2 * v.scale, v.z, fly ?? (crush ? CRUSH_TEXT[k] : SEVER_TEXT[k]) ?? '부위 파괴!', k === 'head' ? 'sever big' : 'sever');
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
    v.interrupt();
    v.setState('dying');
    v.vx = h.dir * Math.max(3, h.knock) * 1.1; v.vy = 6; v.y = Math.max(v.y, 0.01); v.grounded = false;
    if (h.knock >= 7.5) v.flung = { owner: h.attacker, hit: new Set() };
    v.facing = -h.dir;
    if (v.weapon) this.dropWeapon(v);
    if (v.goItem) { v.goItem.claimed = null; v.goItem = null; }
    this.releaseToken(v);
    this.run.kills++;
    if (this.run.perks.has('ration')) this.player.hp = Math.min(this.player.maxHp, this.player.hp + 3);
    const [a, b] = v.def.scrap;
    const n = randi(a, b);
    const pieces = Math.min(n, 10);
    for (let i = 0; i < pieces; i++) {
      this.items.push(new Item('scrap', null, v.x, v.z, { y: 1, vy: rand(4, 7), vx: rand(-2, 2), value: n / pieces }));
    }
    if (v.isBoss) { this.banner('철거반장 격파!', 2.5); this.hitstop(0.35); this.shake(0.6); }
    // 전기톱/도끼 마무리: 허리가 두 동강
    if (h.bisect && v.destructible && !v.remove && Math.random() < h.bisect) {
      v.bisect(h.dir);
      this.texts.add(v.x, v.y + 2.4 * v.scale, v.z, '두 동강!!', 'sever big');
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
    this.texts.add(cx, cy + 1.5, cz, '뱀돌이 사망', 'hurt big');
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
        this.texts.add(o.x, o.y + 2.1 * o.scale, o.z, '충돌!', 'back');
        this.sfx?.('thud');
      }
      for (const p of this.props) {
        if (p.broken || f.hit.has(p)) continue;
        if (Math.abs(p.x - a.x) > a.radius + p.radius || Math.abs(p.z - a.z) > 0.6 || a.y > 1.2) continue;
        f.hit.add(p);
        p.hit(this, 20, dir);
      }
    }
  }

  wallSlam(a) {
    const dmg = Math.round(Math.abs(a.vx) * 1.2);
    this.texts.add(a.x, a.y + 2, a.z, '벽꽝!', 'back');
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
        this.texts.add(a.x, 0.5, a.z, '추락!', 'sever');
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
    this.texts.add(a.x, 0.5, a.z, '추락!!', 'hurt big');
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
    this.texts.add(p.x, 2.4, p.z, '부활!', 'sever big');
  }

  onShatter(v) {
    if (v.type === 'bomber' && !v.exploded) {
      v.exploded = true;
      this.explode(v.x, v.z, 1.9, 24, null);
    }
  }

  explode(x, z, radius, dmg, source, spareTeam = null) {
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
      applyHit(this, a, { attacker: null, explosion: true, dmg: dmg * (1 - d / radius * 0.5), knock: 6, dir: sign(a.x - x) || 1, zone: 'all', knockdown: true, sever: 2, hitstop: 0, shake: 0 });
    }
    for (const p of this.props) {
      if (p.broken) continue;
      if (Math.hypot(p.x - x, (p.z - z) * 1.2) < radius) p.hit(this, 999, sign(p.x - x) || 1);
    }
  }

  // ------------------------------------------------ 아이템 / 무기
  interact(p) {
    let best = null, bd = 1e9;
    for (const it of this.items) {
      if (it.kind === 'scrap') continue;
      const dx = Math.abs(it.x - p.x), dz = Math.abs(it.z - p.z);
      if (dx < 0.9 && dz < 0.6 && dx + dz < bd) { best = it; bd = dx + dz; }
    }
    if (best) {
      best.remove = true;
      this.sfx?.('pickup');
      if (best.kind === 'food') {
        p.hp = Math.min(p.maxHp, p.hp + 30);
        this.texts.add(p.x, 2.2, p.z, '+30', 'heal');
      } else {
        if (p.carry) this.dropCarry(p);
        if (p.weapon) this.dropWeapon(p);
        const fresh = best.dur === WEAPONS[best.type].dur;
        const dur = best.dur * (fresh && this.run.perks.has('durable') ? 1.6 : 1) * (fresh ? this.stats.player.durMul : 1);
        p.weapon = { type: best.type, dur: Math.round(dur) };
        this.texts.add(p.x, 2.3, p.z, WEAPONS[best.type].name, 'item');
      }
      return;
    }
    if (p.carry) { p.startAttack(p.carry.kind === 'barrel' ? 'pThrowBarrel' : 'pThrowGib'); return; }
    // 맨손이면 폭탄 드럼통을 들어 올림
    if (!p.weapon) {
      const bar = this.props.find(b => b.kind === 'barrel' && !b.broken && b.fuse < 0 && Math.abs(b.x - p.x) < 1.0 && Math.abs(b.z - p.z) < 0.65);
      if (bar) {
        bar.broken = true; // 바닥에서 치움
        p.carry = { kind: 'barrel' };
        this.texts.add(p.x, 2.6, p.z, '폭탄 드럼통 — 던져라!', 'item');
        this.sfx?.('pickup');
        return;
      }
    }
    if (p.weapon) { p.startAttack('pThrow'); return; }
    // 맨손이면 떨어진 부위/시체 조각을 집음
    const gib = this.gibs.nearest(p.x, p.z);
    if (gib) {
      p.carry = this.gibs.take(gib);
      this.sfx?.('pickup');
      const lk = limbKind(gib.part);
      p.carry.limb = lk; p.carry.local = null;
      if (lk) p.carry.dur = LIMB_WEAPONS[lk].dur;
      this.texts.add(p.x, 2.3, p.z, (PART_NAME[gib.part] ?? '조각') + (lk ? ' — 휘둘러라!' : ''), 'item');
    }
  }

  dropWeapon(a) {
    if (!a.weapon) return;
    this.items.push(new Item('weapon', a.weapon.type, a.x, a.z, { y: 0.8, vy: 3, vx: -a.facing * 1.5, dur: a.weapon.dur }));
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

  // 들고 있던 것을 발밑에 내려놓음 (드럼통은 다시 오브젝트로)
  dropCarry(a) {
    const c = a.carry;
    a.carry = null;
    if (!c) return;
    if (c.kind === 'barrel') {
      const s = this.stage.safeSpot(a.x + a.facing * 0.5, a.z);
      const b = new Prop('barrel', s.x, s.z);
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
    this.run.scrap += v * (this.run.perks.has('scrapper') ? 1.5 : 1) * this.stats.player.scrapMul;
    this.sfx?.('coin');
  }

  // ------------------------------------------------ 투사체
  spawnProjectile(o) {
    let dmg = o.dmg;
    if (o.team === 'hero' && this.run.perks.has('thrower')) dmg *= 1.8;
    if (o.owner === this.player) dmg *= this.stats.player.throwMul;
    this.projectiles.push({
      ...o, dmg,
      vx: o.dir * (o.kind === 'weapon' ? 11 : o.kind === 'barrel' ? 9 : 7.5), vy: o.kind === 'brick' ? 2.5 : o.kind === 'barrel' ? 1.5 : 1.2,
      spin: 0, life: 2.5, dead: false,
    });
  }

  updateProjectiles(dt) {
    for (const pr of this.projectiles) {
      pr.life -= dt;
      pr.vy -= (pr.kind === 'barrel' ? 14 : 7) * dt;
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      pr.spin += dt * 16;
      if (pr.life <= 0) { pr.dead = true; continue; }
      for (const a of this.actors) {
        if (a.team === pr.team || !a.alive || a.state === 'down') continue;
        const big = pr.kind === 'barrel' ? 0.25 : 0;
        if (Math.abs(a.x - pr.x) > 0.3 + big + a.radius || Math.abs(a.z - pr.z) > 0.45 + big) continue;
        if (pr.y < a.y - 0.1 || pr.y > a.y + 1.9 * a.scale) continue;
        if (pr.kind === 'barrel') { this.projectileEnd(pr); break; }
        const isW = pr.kind === 'weapon';
        applyHit(this, a, {
          attacker: pr.owner, dmg: pr.dmg * (pr.owner?.power ?? 1), knock: isW ? 5 : 2.5, dir: sign(pr.vx), zone: 'high',
          knockdown: isW, sever: isW ? WEAPONS[pr.weaponType].sever : 0.6, hitstop: .06, shake: .08,
        });
        this.projectileEnd(pr);
        break;
      }
      if (!pr.dead && pr.team === 'hero') {
        for (const p of this.props) {
          if (p.broken || Math.abs(p.x - pr.x) > 0.5 || Math.abs(p.z - pr.z) > 0.6 || pr.y > 1.2) continue;
          if (pr.kind !== 'barrel') p.hit(this, pr.dmg, sign(pr.vx));
          this.projectileEnd(pr);
          break;
        }
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
    if (pr.kind === 'weapon' && pr.dur > 1) {
      this.items.push(new Item('weapon', pr.weaponType, pr.x, pr.z, { y: Math.max(0.2, pr.y), vy: 3, vx: -sign(pr.vx) * 1.5, dur: pr.dur - 1 }));
    } else {
      const key = pr.kind === 'weapon' ? WEAPON_MODEL[pr.weaponType] : pr.kind === 'barrel' ? 'barrel' : 'brick';
      mat4.identity(M); mat4.translate(M, pr.x, Math.max(0.1, pr.y), pr.z);
      this.debris.burst(getModel(this.r, key).voxels, M, { frac: 0.9, size: 0.1, spread: 2 });
    }
  }

  bleed(x, y, z, dir, n) { bleed(this.debris, x, y, z, dir, n); }

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
    r.drawMesh(this.stage.terrain, IDENT, null, 8);
    for (const t of this.traps) t.draw(r, this);
    for (const p of this.props) p.draw(r, this);
    for (const it of this.items) it.draw(r, this);
    for (const a of this.actors) a.draw(r);
    for (const pr of this.projectiles) {
      mat4.identity(M); mat4.translate(M, pr.x, pr.y, pr.z); mat4.rotateZ(M, -pr.spin * sign(pr.vx));
      const key = pr.kind === 'weapon' ? WEAPON_MODEL[pr.weaponType] : pr.kind === 'barrel' ? 'barrel' : 'brick';
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
  }
}
