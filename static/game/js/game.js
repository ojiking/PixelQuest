// 게임 월드: 스테이지 진행, 카메라, 웨이브, 투사체, 폭발, 렌더링
import { mat4, clamp, rand, randi, sign, shuffle, pick } from './math.js';
import { BIOMES, BOT, LANE, WEAPONS, ENEMIES } from './config.js';
import { Debris } from './fx.js';
import { getModel, WEAPON_MODEL } from './models.js';
import { Player } from './player.js';
import { Companion } from './companion.js';
import { Enemy } from './enemy.js';
import { Stage, STAGE_COUNT } from './level.js';
import { Item } from './props.js';
import { applyHit } from './combat.js';

const IDENT = mat4.create();
const M = mat4.create();

export class Game {
  constructor(renderer, input, texts, hooks) {
    this.r = renderer; this.input = input; this.texts = texts; this.hooks = hooks;
    this.debris = new Debris();
    this.time = 0;
    this.proj = mat4.create(); this.view = mat4.create(); this.vp = mat4.create();
    this.actors = []; this.enemies = []; this.props = []; this.traps = []; this.items = []; this.projectiles = [];
    this.tokens = new Map();
    this.hitstopT = 0; this.shakeMag = 0;
    this.camX = 8; this.viewHalf = 7; this.aspect = 16 / 9;
    this.lock = null; this.zoneIdx = 0;
    this.shadowBuf = new Float32Array(256 * 7);
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
    this.debris.clear(); this.texts.clear();
    for (const h of [this.player, this.bot]) {
      h.vx = h.vy = h.vz = 0; h.y = 0; h.facing = 1; h.attack = null; h.weapon = h === this.player ? h.weapon : null;
      if (h.state !== 'ko') h.setState('idle');
    }
    this.player.x = 3; this.player.z = 0;
    this.bot.x = 1.6; this.bot.z = 0.9;
    if (i > 0) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + Math.round(this.player.maxHp * 0.25));
      if (this.bot.state === 'ko') { this.bot.setState('idle'); this.bot.hp = Math.round(this.bot.maxHp * 0.5); }
    }
    this.actors = [this.player, this.bot];
    this.camX = 0; this.lock = null; this.zoneIdx = 0;
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
    this.separate();
    this.clampHeroes();
    this.updateProjectiles(dt);
    for (const it of this.items) it.update(dt, this);
    for (const p of this.props) p.update(dt, this);
    for (const t of this.traps) t.update(dt, this);
    this.debris.update(dt);

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
    if (this.enemies.some(e => !e.remove)) return;
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

  spawnEnemy(type, side) {
    const cx = this.lock ? this.lock.cx : this.camX;
    const x = cx + side * (this.viewHalf + 1.2);
    const z = rand(LANE.zMin + 0.2, LANE.zMax - 0.2);
    const e = new Enemy(this, type, x, z, 1 + this.run.stage * 0.15);
    this.actors.push(e);
    this.enemies.push(e);
    return e;
  }

  pickTarget(e) {
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

  severPart(v, k, dir) {
    v.severPart(k, dir);
    this.run.severs++;
    this.texts.add(v.x, v.y + 2.2 * v.scale, v.z, k === 'head' ? '헤드 브레이크!' : '부위 파괴!', 'sever');
    if (k === 'head' && !v.dead) this.kill(v, { dir, knock: 3 });
  }

  kill(v, h) {
    if (v.team === 'hero') return this.heroDown(v, h);
    v.dead = true;
    v.interrupt();
    v.setState('dying');
    v.vx = h.dir * Math.max(3, h.knock) * 1.1; v.vy = 6; v.y = Math.max(v.y, 0.01);
    v.facing = -h.dir;
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
  }

  heroDown(v, h) {
    v.hp = 0;
    v.interrupt();
    v.setState('ko');
    v.vx = (h.dir || 1) * 4; v.vy = 5; v.y = Math.max(v.y, 0.01); v.facing = -(h.dir || 1);
    v.weapon && v === this.player && this.dropWeapon(v);
    if (v === this.bot) {
      v.koT = BOT.koTime;
      this.say(v, '볼트 다운… 자가 수리 중');
      if (this.rescuePending) this.endTimer = 1.6;
      return;
    }
    if (this.stats.bot.rescue && !this.run.rescueUsed && this.bot.alive) {
      this.run.rescueUsed = true;
      this.rescuePending = true;
      this.say(this.bot, '버텨! 지금 간다!');
    } else {
      this.endTimer = 1.8;
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

  explode(x, z, radius, dmg, source) {
    if (source && source.type === 'bomber') {
      source.exploded = true;
      source.dead = true;
      this.releaseToken(source);
      source.shatter();
    }
    this.debris.puff(x, 0.8, z, [0xffe14a, 0xff8a1f, 0xd94a2a, 0x555555, 0x8a8a8a], 70, 5.5, .26, .8, 0.15);
    this.shake(0.45);
    this.hitstop(0.07);
    for (const a of this.actors) {
      if (a === source || a.dead) continue;
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
      if (best.kind === 'food') {
        p.hp = Math.min(p.maxHp, p.hp + 30);
        this.texts.add(p.x, 2.2, p.z, '+30', 'heal');
      } else {
        if (p.weapon) this.dropWeapon(p);
        const dur = best.dur * (this.run.perks.has('durable') && best.dur === WEAPONS[best.type].dur ? 1.6 : 1);
        p.weapon = { type: best.type, dur: Math.round(dur) };
        this.texts.add(p.x, 2.3, p.z, WEAPONS[best.type].name, 'item');
      }
      return;
    }
    if (p.weapon) p.startAttack('pThrow');
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
    a.weapon = null;
  }

  breakProp(p, dir) {
    p.broken = true;
    mat4.identity(M); mat4.translate(M, p.x, 0, p.z);
    this.debris.burst(getModel(this.r, p.model).voxels, M, { frac: 0.5, size: 0.14, impulse: [dir * 2, 1, 0] });
    const roll = Math.random();
    if (roll < 0.4) this.items.push(new Item('weapon', pick(Object.keys(WEAPONS)), p.x, p.z, { y: 0.5, vy: 4 }));
    else if (roll < 0.7) this.items.push(new Item('food', null, p.x, p.z, { y: 0.5, vy: 4 }));
    else for (let i = 0; i < 2; i++) this.items.push(new Item('scrap', null, p.x, p.z, { y: .5, vy: rand(4, 6), vx: rand(-2, 2) }));
  }

  collectScrap(v) {
    this.run.scrap += v * (this.run.perks.has('scrapper') ? 1.5 : 1);
  }

  // ------------------------------------------------ 투사체
  spawnProjectile(o) {
    let dmg = o.dmg;
    if (o.team === 'hero' && this.run.perks.has('thrower')) dmg *= 1.8;
    this.projectiles.push({
      ...o, dmg,
      vx: o.dir * (o.kind === 'weapon' ? 11 : 7.5), vy: o.kind === 'brick' ? 2.5 : 1.2,
      spin: 0, life: 2.5, dead: false,
    });
  }

  updateProjectiles(dt) {
    for (const pr of this.projectiles) {
      pr.life -= dt;
      pr.vy -= 7 * dt;
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      pr.spin += dt * 16;
      if (pr.life <= 0) { pr.dead = true; continue; }
      for (const a of this.actors) {
        if (a.team === pr.team || !a.alive || a.state === 'down') continue;
        if (Math.abs(a.x - pr.x) > 0.3 + a.radius || Math.abs(a.z - pr.z) > 0.45) continue;
        if (pr.y < a.y - 0.1 || pr.y > a.y + 1.9 * a.scale) continue;
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
          p.hit(this, pr.dmg, sign(pr.vx));
          this.projectileEnd(pr);
          break;
        }
      }
      if (!pr.dead && pr.y <= 0) this.projectileEnd(pr);
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);
  }

  projectileEnd(pr) {
    pr.dead = true;
    if (pr.kind === 'weapon' && pr.dur > 1) {
      this.items.push(new Item('weapon', pr.weaponType, pr.x, pr.z, { y: Math.max(0.2, pr.y), vy: 3, vx: -sign(pr.vx) * 1.5, dur: pr.dur - 1 }));
    } else {
      const key = pr.kind === 'weapon' ? WEAPON_MODEL[pr.weaponType] : 'brick';
      mat4.identity(M); mat4.translate(M, pr.x, Math.max(0.1, pr.y), pr.z);
      this.debris.burst(getModel(this.r, key).voxels, M, { frac: 0.9, size: 0.1, spread: 2 });
    }
  }

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
      const key = pr.kind === 'weapon' ? WEAPON_MODEL[pr.weaponType] : 'brick';
      r.drawMesh(getModel(r, key).mesh, M);
    }
    r.drawInstances(this.debris.inst, this.debris.fill());

    // 발밑 그림자 (라인 깊이를 읽게 해주는 핵심 장치)
    const sb = this.shadowBuf;
    let n = 0;
    const add = (x, z, s) => {
      if (n >= 256) return;
      const o = n * 7;
      sb[o] = x; sb[o + 1] = -s / 2 + 0.03; sb[o + 2] = z; sb[o + 3] = s; sb[o + 4] = sb[o + 5] = sb[o + 6] = 0;
      n++;
    };
    for (const a of this.actors) if (!a.remove) add(a.x, a.z, (a.fall > 0.5 ? 1.0 : 0.62) * a.scale * Math.max(0.4, 1 - a.y / 4));
    for (const it of this.items) add(it.x, it.z, 0.3);
    for (const pr of this.projectiles) add(pr.x, pr.z, 0.25);
    r.drawInstances(sb, n, 0.3, true);
  }
}
