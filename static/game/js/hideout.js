// 아지트(정비소) 장면: 복셀로 만든 방 안에서 뱀돌이는 역기를 들고, 볼트는 충전 중.
// 뒷벽엔 현상수배 포스터, 왼쪽엔 전리품 진열대. 버튼은 main.js가 화면 위에 띄움 (anchor 좌표 제공)
import { mat4 } from './math.js';
import { VoxGrid, meshGrid } from './voxel.js';
import { heroModelKey, getModel, WEAPON_MODEL } from './models.js';
import { makeSign } from './city.js';
import { ENEMIES, TROPHIES } from './config.js';
// 아지트(실내): 전등 아래 따뜻한 빛, 바닥 반사는 나무색
const HIDEOUT_LIGHT = { sky: [.55, .55, .58], ground: [.42, .34, .26], sun: [.58, .5, .4] };
import { Actor, PART_ORDER } from './actor.js';

const M = mat4.create(), PM = mat4.create(), TMP = [0, 0, 0], TMP2 = [0, 0, 0];
const DARK = [0.04, 0.04, 0.05, 0.92];      // 아직 모르는 적·못 얻은 전리품: 검은 실루엣
const GLOW = [1, .85, .3, .25];

// 색 살짝 흔들기 (복셀마다 명암 차이)
function jit(c, k = 0.08) {
  const f = 1 + (Math.random() * 2 - 1) * k;
  const r = Math.min(255, ((c >> 16) & 255) * f), g = Math.min(255, ((c >> 8) & 255) * f), b = Math.min(255, (c & 255) * f);
  return (r << 16) | (g << 8) | b;
}
function vox(r, w, h, d, size, origin, paint) { const g = new VoxGrid(w, h, d); paint(g); return meshGrid(r, g, size, origin).mesh; }

export const POSTERS = ['grunt', 'thrower', 'charger', 'bomber', 'shield', 'brute', 'ninja', 'biker', 'boss', 'cyborg'];

export class Hideout {
  constructor(r) {
    this.r = r; this.t = 0;
    this.vp = mat4.create(); this.proj = mat4.create(); this.view = mat4.create();
    this.eye = [0, 3.1, 10.6];
    this.parts = [];                 // 땀방울·불꽃 파티클 [x,y,z,vx,vy,vz,life,r,g,b,size]
    this.pbuf = new Float32Array(400 * 7);
    this.buildStatic();
    const stub = { r, time: 0 };     // Actor가 필요로 하는 최소한의 game
    this.hero = new Actor(stub, heroModelKey(), { hp: 1, team: 'hero' });
    this.botKey = null;
  }

  buildStatic() {
    const r = this.r, S = 0.2;
    const m = this.m = {};
    // 나무 바닥 (14 × 6.4 m)
    m.floor = vox(r, 70, 1, 32, S, [35, 1, 16], g => {
      for (let z = 0; z < 32; z++) for (let x = 0; x < 70; x++) {
        const plank = Math.floor(z / 2), seam = (x + plank * 5) % 9 === 0;
        g.set(x, 0, z, seam ? 0x4a2e1a : jit(plank % 2 ? 0x8a5a32 : 0x7a4e2a, 0.06));
      }
    });
    // 뒷벽: 아래는 나무 판자, 위는 줄무늬 벽지
    m.back = vox(r, 70, 26, 2, S, [35, 0, 0], g => {
      for (let y = 0; y < 26; y++) for (let x = 0; x < 70; x++) {
        let c = y < 5 ? jit(0x5a3a22, .05) : (x % 4 === 0 ? 0x2c4d55 : jit(0x355f68, .04));
        if (y === 5) c = 0x3a2516;
        if (y === 25) c = 0x2a1a10;
        g.set(x, y, 0, c); g.set(x, y, 1, c);
      }
    });
    const side = g => {
      for (let y = 0; y < 26; y++) for (let z = 0; z < 32; z++) {
        let c = y < 5 ? jit(0x553620, .05) : (z % 4 === 0 ? 0x284750 : jit(0x30565f, .04));
        if (y === 5) c = 0x3a2516;
        g.set(0, y, z, c); g.set(1, y, z, c);
      }
    };
    m.left = vox(r, 2, 26, 32, S, [0, 0, 0], side);
    m.right = vox(r, 2, 26, 32, S, [0, 0, 0], side);
    m.sign = makeSign(r, '뱀돌이 아지트', 4.6, 0.85, 0x161620, 0xff3a6a, false);
    m.signP = makeSign(r, '현상수배', 2.4, 0.6, 0x2a1a10, 0xffd24a, false);
    m.lamp = vox(r, 7, 30, 7, 0.06, [3.5, 30, 3.5], g => { g.fill(3, 6, 3, 3, 29, 3, 0x222222); g.fill(0, 2, 0, 6, 5, 6, 0x2a3a2a); g.fill(1, 0, 1, 5, 1, 5, 0xfff3c0); });
    // 헬스장: 고무 매트, 스쿼트 랙, 원판 거치대, 덤벨, 샌드백
    m.mat = vox(r, 22, 1, 11, S, [11, 0, 5], g => { for (let z = 0; z < 11; z++) for (let x = 0; x < 22; x++) g.set(x, 0, z, (x === 0 || z === 0 || x === 21 || z === 10) ? 0xffcf3a : jit(0x26262a, .05)); });
    const T = 0.1;
    m.rack = vox(r, 22, 22, 6, T, [11, 0, 3], g => {
      for (const px of [0, 1, 20, 21]) g.fill(px, 0, 2, px, 21, 3, 0x6a6f78);
      g.fill(0, 21, 2, 21, 21, 3, 0x6a6f78);              // 위 가로대
      g.fill(0, 0, 0, 1, 0, 5, 0x33363c); g.fill(20, 0, 0, 21, 0, 5, 0x33363c);
      g.fill(2, 13, 2, 3, 13, 4, 0xd23b3b); g.fill(18, 13, 2, 19, 13, 4, 0xd23b3b); // 걸이
    });
    m.plates = vox(r, 6, 16, 6, T, [3, 0, 3], g => {
      g.fill(2, 0, 2, 3, 15, 3, 0x55595e);
      for (let i = 0; i < 4; i++) { const y = 3 + i * 3, c = [0xd23b3b, 0x2f6fd6, 0xf2c230, 0x3a3a3a][i]; g.fill(0, y, 0, 5, y + 1, 5, c); }
    });
    m.dumbbell = vox(r, 8, 3, 3, 0.06, [4, 0, 1.5], g => { g.fill(0, 0, 0, 1, 2, 2, 0x2a2a2a); g.fill(6, 0, 0, 7, 2, 2, 0x2a2a2a); g.fill(2, 1, 1, 5, 1, 1, 0xb6bcc4); });
    m.bag = vox(r, 5, 30, 5, T, [2.5, 0, 2.5], g => {
      g.fill(0, 0, 0, 4, 9, 4, 0xa0281e); g.fill(0, 0, 0, 4, 0, 4, 0x6a1a14); g.fill(0, 9, 0, 4, 9, 4, 0x6a1a14);
      g.fill(2, 10, 2, 2, 29, 2, 0x8a8f96);
    });
    m.bagFrame = vox(r, 12, 34, 4, T, [10, 0, 2], g => { g.fill(0, 0, 1, 1, 33, 2, 0x55595e); g.fill(0, 32, 1, 11, 33, 2, 0x55595e); g.fill(0, 0, 0, 3, 0, 3, 0x33363c); });
    // 역기 (z 방향으로 긴 봉 + 원판)
    m.barbell = vox(r, 3, 3, 34, 0.06, [1.5, 1.5, 17], g => {
      g.fill(1, 1, 0, 1, 1, 33, 0xc8ccd2);
      for (const z0 of [4, 27]) for (let z = z0; z < z0 + 3; z++) for (let a = -1; a <= 3; a++) for (let b = -1; b <= 3; b++) {
        if ((a - 1) ** 2 + (b - 1) ** 2 <= 5) g.set(Math.max(0, Math.min(2, a)), Math.max(0, Math.min(2, b)), z, 0x1e1e22);
      }
    });
    m.plate = vox(r, 1, 9, 9, 0.06, [0.5, 4.5, 4.5], g => { for (let y = 0; y < 9; y++) for (let z = 0; z < 9; z++) if ((y - 4) ** 2 + (z - 4) ** 2 <= 17) g.set(0, y, z, (y - 4) ** 2 + (z - 4) ** 2 <= 2 ? 0x8a8f96 : 0x1e1e22); });
    // 볼트 충전 스테이션
    m.station = vox(r, 14, 24, 7, T, [7, 0, 0], g => {
      g.fill(0, 0, 0, 13, 23, 6, 0x4a4f57); g.fill(1, 1, 6, 12, 22, 6, 0x3a3f46);
      g.fill(2, 14, 6, 11, 20, 6, 0x0c1a14);                  // 화면
      g.fill(3, 4, 6, 4, 10, 6, 0xff8a1f); g.fill(9, 4, 6, 10, 10, 6, 0x22e0ff);
      g.fill(0, 23, 0, 13, 23, 6, 0x2a2e33);
    });
    m.pad = vox(r, 12, 1, 12, T, [6, 0, 6], g => { for (let z = 0; z < 12; z++) for (let x = 0; x < 12; x++) { const d = Math.hypot(x - 5.5, z - 5.5); if (d < 6) g.set(x, 0, z, d > 4.6 ? 0x22e0ff : 0x2a2e33); } });
    m.bar = vox(r, 1, 1, 1, 0.1, [0.5, 0, 0.5], g => g.set(0, 0, 0, 0x4ad66d));
    m.arm = vox(r, 3, 3, 16, 0.06, [1.5, 1.5, 0], g => { g.fill(0, 0, 0, 2, 2, 15, 0x8a8f96); g.fill(0, 0, 14, 2, 2, 15, 0xff8a1f); });
    // 진열대 (3m × 2.6m, 선반 4단)
    m.shelf = vox(r, 30, 27, 5, T, [0, 0, 0], g => {
      for (const px of [0, 1, 28, 29]) g.fill(px, 0, 0, px, 26, 4, 0x5a3a22);
      for (const y of [4, 12, 20, 26]) g.fill(0, y, 0, 29, y, 4, 0x6e4a2c);
      g.fill(0, 0, 0, 29, 26, 0, 0x3a2516);
    });
    // 포스터 종이
    m.poster = vox(r, 20, 26, 1, 0.05, [10, 0, 0], g => { g.fill(0, 0, 0, 19, 25, 0, 0xe8dcc0); for (let i = 0; i < 20; i++) { g.set(i, 0, 0, 0xb8a888); g.set(i, 25, 0, 0xb8a888); } for (let j = 0; j < 26; j++) { g.set(0, j, 0, 0xb8a888); g.set(19, j, 0, 0xb8a888); } });
    m.posterBoss = vox(r, 20, 26, 1, 0.05, [10, 0, 0], g => { g.fill(0, 0, 0, 19, 25, 0, 0xe8dcc0); for (let i = 0; i < 20; i++) { g.set(i, 0, 0, 0xc0392b); g.set(i, 25, 0, 0xc0392b); g.set(i, 1, 0, 0xc0392b); } for (let j = 0; j < 26; j++) { g.set(0, j, 0, 0xc0392b); g.set(19, j, 0, 0xc0392b); } });
    // 전리품 모델 (기존에 없는 것)
    m.medal = vox(r, 7, 11, 1, 0.05, [3.5, 0, 0.5], g => {
      g.fill(1, 6, 0, 2, 10, 0, 0xd23b3b); g.fill(4, 6, 0, 5, 10, 0, 0x2f6fd6);
      for (let y = 0; y < 6; y++) for (let x = 0; x < 7; x++) if ((x - 3) ** 2 + (y - 2.5) ** 2 <= 9) g.set(x, y, 0, (x - 3) ** 2 + (y - 2.5) ** 2 <= 2 ? 0xfff3a0 : 0xe8b82a);
    });
    m.goldball = vox(r, 5, 5, 5, 0.05, [2.5, 0, 2.5], g => { for (let z = 0; z < 5; z++) for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if ((x - 2) ** 2 + (y - 2) ** 2 + (z - 2) ** 2 <= 5) g.set(x, y, z, jit(0xf2c230, .1)); });
    m.lighter = vox(r, 4, 7, 2, 0.05, [2, 0, 1], g => { g.fill(0, 0, 0, 3, 4, 1, 0x3a3a3a); g.fill(0, 5, 0, 3, 5, 1, 0xb6bcc4); g.fill(1, 6, 0, 2, 6, 1, 0xff8a1f); });
    m.key = vox(r, 9, 4, 1, 0.05, [4.5, 0, 0.5], g => { g.fill(0, 0, 0, 3, 3, 0, 0xc0392b); g.fill(4, 1, 0, 8, 2, 0, 0xc8ccd2); g.set(7, 0, 0, 0xc8ccd2); });
    m.stand = vox(r, 6, 1, 4, 0.05, [3, 1, 2], g => g.fill(0, 0, 0, 5, 0, 3, 0x2a1a10));
  }

  // 메타 상태(본 적, 해금, 전리품)와 볼트 모델 반영
  setState(meta, botModel, unlockedBosses) {
    this.meta = meta;
    if (this.botKey !== botModel) { this.botKey = botModel; this.bot = new Actor({ r: this.r, time: 0 }, botModel, { hp: 1, team: 'hero' }); }
    this.known = new Set([...(meta.seen || []), ...Object.keys(meta.stats || {}).filter(k => k.startsWith('boss_')).map(k => k.slice(5))]);
    this.bossOk = new Set(unlockedBosses);
  }

  anchors() {
    return {
      hero: [-1.4, 2.95, 0.5],
      bot: [4.6, 2.55, -1.1],
      wanted: [0, 0.55, -2.5],
      trophy: [-5.2, 3.0, -2.4],
    };
  }

  // 월드 → 화면(px)
  project(p, W, H) {
    const v = this.vp;
    const cx = v[0] * p[0] + v[4] * p[1] + v[8] * p[2] + v[12], cy = v[1] * p[0] + v[5] * p[1] + v[9] * p[2] + v[13], cw = v[3] * p[0] + v[7] * p[1] + v[11] * p[2] + v[15];
    return [(cx / cw * 0.5 + 0.5) * W, (1 - (cy / cw * 0.5 + 0.5)) * H];
  }

  emit(x, y, z, vx, vy, vz, life, c, size) { if (this.parts.length < 400) this.parts.push([x, y, z, vx, vy, vz, life, (c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255, size]); }

  update(dt) {
    this.t += dt;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p[6] -= dt; if (p[6] <= 0) { this.parts.splice(i, 1); continue; }
      p[4] -= 9 * dt; p[0] += p[3] * dt; p[1] += p[4] * dt; p[2] += p[5] * dt;
      if (p[1] < 0.02) { p[1] = 0.02; p[3] *= .5; p[5] *= .5; p[4] = 0; }
    }
    // 용접 불꽃 (볼트 어깨 위 정비 팔)
    if (Math.random() < dt * 14) for (let k = 0; k < 3; k++) this.emit(4.95, 1.75, -1.0, (Math.random() - .5) * 2.5, Math.random() * 2.2, (Math.random() - .3) * 1.5, .35 + Math.random() * .3, Math.random() < .5 ? 0xfff3a0 : 0xffb03a, .04);
  }

  // 역기 들기: 한 번에 2.6초 (가슴 → 머리 위 → 잠깐 버팀 → 내림)
  heroPose() {
    const P = this.hero.parts, cyc = (this.t % 2.6) / 2.6;
    let u;
    if (cyc < 0.12) u = 0;                                   // 무릎 굽혀 준비
    else if (cyc < 0.34) u = (cyc - 0.12) / 0.22;            // 밀어올림
    else if (cyc < 0.55) u = 1;                              // 버팀
    else if (cyc < 0.85) u = 1 - (cyc - 0.55) / 0.3;         // 내림
    else u = 0;
    const e = u * u * (3 - 2 * u);
    const dip = cyc < 0.12 ? Math.sin(cyc / 0.12 * Math.PI) : 0;
    P.armF.rz = P.armB.rz = 0.3 + e * 2.75;
    P.handF.rz = P.handB.rz = 2.3 * (1 - e) + 0.05;
    P.legF.rz = P.legB.rz = 0.1 + dip * 0.45; P.shinF.rz = P.shinB.rz = -dip * 0.8;
    P.torso.rz = -0.06 * e; P.head.rz = 0.12 * e - 0.05;
    // 다 들어올린 순간 땀
    if (cyc > 0.34 && cyc < 0.36 && !this.sweated) {
      this.sweated = true;
      for (let k = 0; k < 6; k++) this.emit(-1.4 + (Math.random() - .5) * .3, 1.95, 0.55, (Math.random() - .5) * 2, 1.5 + Math.random() * 1.5, (Math.random() - .5) * 1.5, .9, 0xbfe6ff, .05);
      this.repPulse = 1;
    }
    if (cyc > 0.5) this.sweated = false;
  }

  botPose() {
    const P = this.bot.parts, s = Math.sin(this.t * 1.6);
    P.armF.rz = 0.05 + s * 0.02; P.armB.rz = 0.0 - s * 0.02; P.handF.rz = P.handB.rz = 0.25;
    P.torso.rz = -0.12; P.head.rz = -0.32 + s * 0.03;
    P.legF.rz = P.legB.rz = 0; P.shinF.rz = P.shinB.rz = 0;
  }

  drawActor(a, x, z, yaw, scale = 1, tint = null) {
    mat4.identity(M); mat4.translate(M, x, 0, z); mat4.rotateY(M, yaw); mat4.scale(M, scale, scale, scale);
    for (const k of PART_ORDER) { a.partMatrix(k, M, PM); this.r.drawMesh(a.model.parts[k].mesh, PM, tint); }
    return M;
  }

  put(mesh, x, y, z, yaw = 0, s = 1, tint = null) {
    mat4.identity(M); mat4.translate(M, x, y, z); if (yaw) mat4.rotateY(M, yaw); if (s !== 1) mat4.scale(M, s, s, s);
    this.r.drawMesh(mesh, M, tint);
  }

  render(aspect) {
    const r = this.r, m = this.m;
    mat4.perspective(this.proj, 38 * Math.PI / 180, aspect, 0.5, 60);
    mat4.lookAt(this.view, this.eye, [0, 1.75, -1.0], [0, 1, 0]);
    mat4.multiply(this.vp, this.proj, this.view);
    r.begin(this.vp, this.eye, { sky: [0.05, 0.05, 0.07], fog: [0.05, 0.05, 0.07], fogNear: 30, fogFar: 60, light: HIDEOUT_LIGHT });
    this.put(m.floor, 0, 0, 0);
    this.put(m.back, 0, 0, -3.2);
    this.put(m.left, -7.2, 0, -3.2);
    this.put(m.right, 6.8, 0, -3.2);
    this.put(m.sign, -2.3, 4.25, -2.78);
    for (const lx of [-3.5, 3.0]) this.put(m.lamp, lx, 5.4, -0.5);
    // 헬스장
    this.put(m.mat, -1.5, 0.001, 0.55);
    this.put(m.rack, -1.5, 0, -0.35);
    this.put(m.plates, 2.3, 0, 1.0);
    this.put(m.dumbbell, -2.9, 0, 1.3, .4); this.put(m.dumbbell, -0.2, 0, 1.4, -.3);
    this.put(m.bagFrame, -5.2, 0, 1.9);
    mat4.identity(M); mat4.translate(M, -6.05, 3.3, 1.9); mat4.rotateZ(M, Math.sin(this.t * 1.3) * 0.06); mat4.translate(M, 0, -3.0, 0); r.drawMesh(m.bag.mesh ?? m.bag, M);
    // 뱀돌이 + 역기
    this.heroPose();
    const yaw = -1.05;
    const root = this.drawActor(this.hero, -1.4, 0.5, yaw);
    const hm = this.hero.model;
    this.hero.partMatrix('handF', root, PM); mat4.point(TMP, PM, 0, -hm.handLen, 0);
    this.hero.partMatrix('handB', root, PM); mat4.point(TMP2, PM, 0, -hm.handLen, 0);
    mat4.identity(M); mat4.translate(M, (TMP[0] + TMP2[0]) / 2, (TMP[1] + TMP2[1]) / 2, (TMP[2] + TMP2[2]) / 2); mat4.rotateY(M, yaw);
    r.drawMesh(m.barbell, M);
    for (const dz of [-0.62, 0.62]) { mat4.copy(PM, M); mat4.translate(PM, 0, 0, dz); r.drawMesh(m.plate, PM); }
    // 볼트 충전
    this.put(m.station, 5.9, 0, -3.0);
    this.put(m.pad, 4.6, 0.002, -1.1);
    this.botPose();
    if (this.bot) this.drawActor(this.bot, 4.6, -1.1, -1.75);
    mat4.identity(M); mat4.translate(M, 5.6, 2.2, -2.6); mat4.rotateY(M, 0.5); mat4.rotateX(M, 0.6 + Math.sin(this.t * 7) * .08); r.drawMesh(m.arm, M);
    const charge = 0.5 + 0.5 * Math.sin(this.t * 0.8);
    for (let i = 0; i < 8; i++) if (i / 8 < charge) this.put(m.bar, 5.35 + i * 0.1, 1.55, -2.28);
    // 현상수배 포스터
    this.put(m.signP, -1.2, 3.62, -2.77);
    POSTERS.forEach((k, i) => {
      const col = i % 5, row = Math.floor(i / 5);
      const x = -2.2 + col * 1.1, y = row ? 0.92 : 2.28, z = -2.78;
      const boss = !!ENEMIES[k].boss;
      this.put(boss ? m.posterBoss : m.poster, x, y, z);
      const known = this.known?.has(k) && (!boss || this.bossOk?.has(k) || this.known.has(k));
      const head = getModel(r, ENEMIES[k].model).parts.head;
      mat4.identity(M); mat4.translate(M, x, y + 0.22, z + 0.1); mat4.rotateY(M, -Math.PI / 2 + 0.25); const s = boss ? 0.62 : 0.68; mat4.scale(M, s, s, s);
      r.drawMesh(head.mesh, M, known ? null : DARK);
    });
    // 전리품 진열대
    this.put(m.shelf, -6.7, 0, -2.95);
    const tr = this.meta?.trophies || {}, eq = this.meta?.equip || [];
    TROPHIES.forEach((t, i) => {
      const shelfY = [2.06, 1.26, 0.46][Math.floor(i / 4)], x = -6.3 + (i % 4) * 0.72, z = -2.6;
      const got = tr[t.id];
      this.put(m.stand, x, shelfY, z);
      const tint = got ? (eq.includes(t.id) && Math.floor(this.t * 3) % 2 ? GLOW : null) : DARK;
      let mesh = m[t.model];
      let s = 1, yaw = 0.3;
      if (!mesh) {
        if (t.model === 'hardhat') { mesh = getModel(r, 'boss').parts.head.mesh; s = 0.8; yaw = -1.2; }
        else { mesh = getModel(r, t.model).mesh; s = t.model === 'manhole' ? 0.8 : 0.55; yaw = 0; }
      }
      mat4.identity(M); mat4.translate(M, x, shelfY + 0.03, z); mat4.rotateY(M, yaw + Math.sin(this.t + i) * 0.15);
      if (t.model.startsWith('w_')) { mat4.translate(M, 0, 0.12, 0); mat4.rotateZ(M, 0.9); mat4.translate(M, -0.25, 0, 0); }
      mat4.scale(M, s, s, s);
      r.drawMesh(mesh, M, tint);
    });
    // 파티클
    const n = Math.min(this.parts.length, 400);
    for (let i = 0; i < n; i++) { const p = this.parts[i], o = i * 7; this.pbuf[o] = p[0]; this.pbuf[o + 1] = p[1]; this.pbuf[o + 2] = p[2]; this.pbuf[o + 3] = p[10] * Math.min(1, p[6] * 3); this.pbuf[o + 4] = p[7]; this.pbuf[o + 5] = p[8]; this.pbuf[o + 6] = p[9]; }
    r.drawInstances(this.pbuf, n);
  }
}
