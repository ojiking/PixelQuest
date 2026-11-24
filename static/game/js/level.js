// 블록 지형 생성 + 스테이지 구성(전투 구역, 오브젝트, 함정 배치)
import { BIOMES, SPAWN_POOLS, LANE } from './config.js';
import { hash3, hexToRgb, FACES, MeshBuilder } from './voxel.js';
import { rand, randi, weightedPick } from './math.js';
import { Prop, SpikeTrap, Item } from './props.js';
import { rollWeapon } from './game.js';

const AIR = 0, GRASS = 1, DIRT = 2, LANEB = 3, STONE = 4, WALL = 5, WALL2 = 6, GLASS = 7, WOOD = 8, LEAVES = 9, VOID = 10;
export const PIT = -100;           // 낭떠러지 (떨어지면 사망)
const DEPTH = -12;                 // 낭떠러지 바닥 깊이
const LANE_Z0 = -4, LANE_Z1 = 2;   // 걸을 수 있는 블록 줄 (z 셀)
const PIT_Z0 = -5, PIT_Z1 = 7;     // 낭떠러지가 파일 수 있는 범위 (앞쪽은 화면 밖까지 열림)

function noise2(x, z, seed) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const s = t => t * t * (3 - 2 * t);
  const a = hash3(xi, seed, zi), b = hash3(xi + 1, seed, zi), c = hash3(xi, seed, zi + 1), d = hash3(xi + 1, seed, zi + 1);
  const u = s(xf), v = s(zf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

class World {
  constructor(x0, x1, z0, z1, y0, y1) {
    Object.assign(this, { x0, z0, y0, W: x1 - x0, D: z1 - z0, H: y1 - y0 });
    this.data = new Uint8Array(this.W * this.D * this.H);
  }
  idx(x, y, z) {
    x -= this.x0; y -= this.y0; z -= this.z0;
    if (x < 0 || y < 0 || z < 0 || x >= this.W || y >= this.H || z >= this.D) return -1;
    return x + this.W * (y + this.H * z);
  }
  get(x, y, z) { const i = this.idx(x, y, z); return i < 0 ? AIR : this.data[i]; }
  set(x, y, z, b) { const i = this.idx(x, y, z); if (i >= 0) this.data[i] = b; }
}

function buildTerrain(r, L, biome, seed, hmap) {
  const w = new World(-14, L + 16, -32, 8, DEPTH, 18);
  const heights = new Map();
  const groundH = (x, z) => {
    if (z >= -5) return 0;
    let h = (-z - 5) * 0.3 + noise2(x * 0.07, z * 0.09, seed) * 3 - 0.6;
    if (z < -17) h += (-z - 17) * 0.55 + noise2(x * 0.05, z * 0.05, seed + 7) * 6;
    return Math.max(0, Math.floor(h));
  };
  for (let x = w.x0; x < w.x0 + w.W; x++) {
    for (let z = w.z0; z < w.z0 + w.D; z++) {
      const h = groundH(x, z);
      heights.set(x + ',' + z, h);
      const hm = hmap.get(x + ',' + z);
      if (hm === PIT) { w.set(x, DEPTH, z, VOID); continue; } // 낭떠러지: 바닥만 어둡게
      for (let y = w.y0; y < h; y++) {
        let b = y === h - 1 ? GRASS : y >= h - 3 ? DIRT : STONE;
        if (y === -1 && z >= -4 && z <= 2) {
          const edge = (z === -4 || z === 2) && hash3(x, 3, z) > 0.45;
          b = edge ? GRASS : LANEB;
        }
        w.set(x, y, z, b);
      }
      // 올라설 수 있는 블록 / 벽
      if (hm > 0) for (let y = 0; y < hm; y++) w.set(x, y, z, y === hm - 1 ? WALL : WALL2);
      // 차도 경계석(낮은 담장, 군데군데 무너짐)
      if (z === -5 && hm !== PIT && hash3(x, 9, z) > 0.25) w.set(x, 0, z, hash3(x, 10, z) > 0.8 ? WALL2 : WALL);
    }
  }
  const occupied = new Set();
  // 무너진 건물
  for (let bx = 4 + randi(0, 6); bx < L + 6; bx += randi(13, 21)) {
    const bw = randi(5, 9), bd = randi(4, 6), bh = randi(4, 8);
    const zf = -6 - randi(0, 2);
    for (let x = bx; x < bx + bw; x++) {
      for (let z = zf - bd + 1; z <= zf; z++) {
        occupied.add(x + ',' + z);
        const base = heights.get(x + ',' + z) ?? 0;
        let top = bh - (hash3(x, 21, z) < 0.35 ? randi(1, 3) : 0);
        if (x === bx || x === bx + bw - 1) top = Math.max(top, bh - 1);
        for (let y = 0; y < top; y++) {
          let b = y === 0 || x === bx || x === bx + bw - 1 ? WALL2 : WALL;
          if (z === zf && y % 3 === 1 && (x - bx) % 2 === 1 && y < top - 1) b = GLASS;
          if (z === zf && y < 2 && x === bx + (bw >> 1)) b = GLASS;
          w.set(x, base + y, z, b);
        }
      }
    }
  }
  // 식물
  for (let i = 0; i < L / 2.4; i++) {
    const x = randi(-10, L + 12), z = randi(-16, -7);
    if (occupied.has(x + ',' + z) || occupied.has((x + 1) + ',' + z) || occupied.has((x - 1) + ',' + z)) continue;
    const base = heights.get(x + ',' + z) ?? 0;
    if (biome.flora === 'cactus') {
      const hgt = randi(2, 4);
      for (let y = 0; y < hgt; y++) w.set(x, base + y, z, WOOD);
      if (hgt > 2 && Math.random() < 0.6) { w.set(x + 1, base + 1, z, WOOD); w.set(x + 1, base + 2, z, WOOD); }
    } else if (biome.flora === 'spruce') {
      const hgt = randi(4, 6);
      for (let y = 0; y < hgt; y++) w.set(x, base + y, z, WOOD);
      const rads = [2, 2, 1, 1, 0];
      rads.forEach((rd, k) => {
        const y = base + 2 + k;
        for (let dx = -rd; dx <= rd; dx++) for (let dz = -rd; dz <= rd; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > rd + 1) continue;
          if (w.get(x + dx, y, z + dz) === AIR) w.set(x + dx, y, z + dz, LEAVES);
        }
      });
      w.set(x, base + 2 + rads.length, z, LEAVES);
    } else {
      const hgt = randi(3, 5);
      for (let y = 0; y < hgt; y++) w.set(x, base + y, z, WOOD);
      for (let dy = -1; dy <= 1; dy++) {
        const rd = dy === 1 ? 1 : 2;
        for (let dx = -rd; dx <= rd; dx++) for (let dz = -rd; dz <= rd; dz++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          if (w.get(x + dx, base + hgt + dy, z + dz) === AIR) w.set(x + dx, base + hgt + dy, z + dz, LEAVES);
        }
      }
    }
    occupied.add(x + ',' + z);
  }

  // 블록 → 색
  const snowy = biome.flora === 'spruce';
  const C = k => hexToRgb(biome[k]);
  const BL = {
    [GRASS]: { top: C('grass'), side: C('dirt'), strip: 1, stripC: C('grass') },
    [DIRT]: { top: C('dirt'), side: C('dirt') },
    [LANEB]: { top: C('lane'), side: C('dirt') },
    [STONE]: { top: C('stone'), side: C('stone') },
    [WALL]: { top: C('wall'), side: C('wall') },
    [WALL2]: { top: C('wall2'), side: C('wall2') },
    [GLASS]: { top: C('glass'), side: C('glass') },
    [WOOD]: { top: C('wood'), side: C('wood') },
    [VOID]: { top: [0.05, 0.04, 0.06], side: [0.05, 0.04, 0.06] },
    [LEAVES]: snowy ? { top: C('grass'), side: C('leaves'), strip: 1, stripC: C('grass') } : { top: C('leaves'), side: C('leaves') },
  };
  const mb = new MeshBuilder();
  for (let z = w.z0; z < w.z0 + w.D; z++) {
    for (let y = w.y0; y < w.y0 + w.H; y++) {
      for (let x = w.x0; x < w.x0 + w.W; x++) {
        const b = w.get(x, y, z);
        if (b === AIR) continue;
        const bl = BL[b];
        for (const f of FACES) {
          if (f.n[1] === -1) continue;
          if (w.get(x + f.n[0], y + f.n[1], z + f.n[2]) !== AIR) continue;
          if (f.n[1] === 1) mb.quad(f, x, y, z, 1, 1, 1, bl.top);
          else mb.quad(f, x, y, z, 1, 1, 1, bl.side, bl.stripC ?? bl.side, bl.strip ?? 0);
        }
      }
    }
  }
  return mb.build(r);
}

export const STAGE_COUNT = 2;

// ---------------------------------------------------------------- 지형 구간
// 구간 종류: 걸을 수 있는 높이 맵(hmap)을 칠함. 값: PIT=낭떠러지, 1=올라설 블록, 2=넘을 수 없는 벽
const SEG = {
  open() {},
  cliffFront(h, a, b) { fill(h, a, b, 1, PIT_Z1, PIT); },                 // 앞쪽 두 줄이 낭떠러지
  cliffBack(h, a, b) { fill(h, a, b, PIT_Z0, -3, PIT); },                 // 뒤쪽이 낭떠러지
  bridge(h, a, b) { fill(h, a, b, PIT_Z0, -2, PIT); fill(h, a, b, 1, PIT_Z1, PIT); }, // 좁은 다리 (2칸)
  gaps(h, a, b) {                                                           // 점프로 건너야 하는 틈
    for (let x = a + 2; x + 2 <= b - 2; x += randi(4, 6)) fill(h, x, x + 2, PIT_Z0, PIT_Z1, PIT);
  },
  barrier(h, a, b) {                                                        // 길을 막는 낮은 벽 (점프)
    for (let x = a + 2; x < b - 2; x += randi(4, 6)) fill(h, x, x + 1, LANE_Z0, LANE_Z1, 1);
  },
  walls(h, a, b) { fill(h, a, b, LANE_Z0, -2, 2); },                       // 좁은 골목
  platforms(h, a, b) {                                                      // 올라설 수 있는 블록 더미
    for (let x = a + 1; x < b - 2; x += randi(3, 5)) {
      const z = randi(LANE_Z0, LANE_Z1 - 1);
      fill(h, x, x + 2, z, z + 1, 1);
    }
  },
};
function fill(h, x0, x1, z0, z1, v) {
  for (let x = x0; x < x1; x++) for (let z = z0; z <= z1; z++) h.set(x + ',' + z, v);
}
const ARENA_TYPES = { open: 3, cliffFront: 2, cliffBack: 1.3, walls: 1.3, platforms: 1.5, bridge: 0.8 };
const PATH_TYPES = { gaps: 3, barrier: 2, bridge: 2, cliffFront: 1.2, platforms: 1.2, walls: 0.8 };
export const SEG_HINTS = { cliffFront: '절벽길 — 앞쪽은 낭떠러지', cliffBack: '벼랑 끝 — 뒤쪽은 낭떠러지', bridge: '외나무 다리 — 떨어지면 끝', gaps: '끊어진 길 — 점프로 건너라', barrier: '바리케이드 — 뛰어넘어라', walls: '좁은 골목', platforms: '잔해 더미 — 올라설 수 있다' };
export const SEG_NAMES = { open: '광장', cliffFront: '절벽길', cliffBack: '벼랑 끝', bridge: '외나무 다리', gaps: '끊어진 길', barrier: '바리케이드', walls: '좁은 골목', platforms: '잔해 더미' };


export class Stage {
  constructor(game, index, biomeKey) {
    this.index = index;
    this.final = index === STAGE_COUNT - 1;
    this.biome = BIOMES[biomeKey];
    this.biomeKey = biomeKey;
    this.L = this.final ? 106 : 100;
    this.props = [];
    this.traps = [];
    this.items = [];
    this.zones = [];
    this.hmap = new Map();
    this.segments = [];

    const pool = SPAWN_POOLS[Math.min(index, SPAWN_POOLS.length - 1)];
    const triggers = this.final ? [18, 42, 66, 90] : [20, 46, 72];

    // ---- 지형 구간 배치: 전투 구역(아레나) 사이를 이동 구간으로 채움
    const arenaSpan = t => [t - 5, t + 13];
    let cursor = 8;
    triggers.forEach((t, zi) => {
      const [a0, a1] = arenaSpan(t);
      if (a0 - cursor >= 5) this.addSeg(weightedPick(PATH_TYPES), cursor, a0);
      const boss = this.final && zi === triggers.length - 1;
      this.addSeg(boss ? (Math.random() < .5 ? 'open' : 'cliffFront') : weightedPick(ARENA_TYPES), Math.max(cursor, a0), a1);
      cursor = a1;
    });
    if (this.L - 6 - cursor >= 5) this.addSeg(weightedPick(PATH_TYPES), cursor, this.L - 6);

    this.terrain = buildTerrain(game.r, this.L, this.biome, randi(1, 9999), this.hmap);

    triggers.forEach((tx, zi) => {
      const waves = [];
      const isBoss = this.final && zi === triggers.length - 1;
      if (isBoss) {
        waves.push(['grunt', 'thrower', 'grunt']);
        waves.push(['boss', 'grunt']);
      } else {
        const nWaves = zi === triggers.length - 1 ? 3 : 2;
        for (let wv = 0; wv < nWaves; wv++) {
          const size = Math.round(3 + index * 0.8 + zi * 0.5 + wv * 0.4);
          const list = [];
          for (let k = 0; k < size; k++) list.push(weightedPick(pool));
          waves.push(list);
        }
      }
      this.zones.push({ trigger: tx, waves, boss: isBoss });
      // 구역 근처 폭발 드럼통
      const nb = randi(1, 2);
      for (let k = 0; k < nb; k++) this.placeProp('barrel', tx + rand(1, 8));
    });
    // 나무 상자
    for (let x = 8 + rand(0, 4); x < this.L - 8; x += rand(7, 12)) this.placeProp('crate', x);
    // 가시 함정 (평지 2x2)
    for (let k = 0; k < triggers.length - 1; k++) {
      for (let tries = 0; tries < 12; tries++) {
        const x0 = Math.floor((triggers[k] + triggers[k + 1]) / 2 + rand(-6, 6));
        const z0 = randi(-3, 1);
        if ([0, 1].every(dx => [0, 1].every(dz => this.heightAt(x0 + dx + .5, z0 + dz + .5) === 0))) {
          this.traps.push(new SpikeTrap(x0 + 1, z0 + 1, rand(0, 3)));
          break;
        }
      }
    }
    // 첫 무기 + 구간마다 무작위 무기 (서로 다른 종류)
    const first = index === 0 ? 'pipe' : rollWeapon(['pipe']);
    const got = [first];
    this.items.push(new Item('weapon', first, 6.5, -1));
    for (let k = 1; k < triggers.length; k++) {
      const w = rollWeapon(got);
      got.push(w);
      const spot = this.safeSpot(triggers[k] - rand(3, 5), rand(LANE.zMin + .5, LANE.zMax - .5));
      this.items.push(new Item('weapon', w, spot.x, spot.z));
    }
  }

  addSeg(type, a, b) {
    a = Math.floor(a); b = Math.floor(b);
    SEG[type](this.hmap, a, b);
    this.segments.push({ type, a, b });
  }

  // 셀 높이: PIT / 0 / 1 / 2
  heightAt(x, z) {
    const v = this.hmap.get(Math.floor(x) + ',' + Math.floor(z));
    return v === undefined ? 0 : v;
  }

  // 평지(높이 0) 중 (x, z)에서 가까운 곳
  safeSpot(x, z) {
    for (let dx = 0; dx < 12; dx += 0.5) {
      for (const sx of [x + dx, x - dx]) {
        for (let dz = 0; dz < 6; dz += 0.5) {
          for (const sz of [z + dz, z - dz]) {
            if (sz < LANE.zMin + 0.2 || sz > LANE.zMax - 0.2) continue;
            if (this.heightAt(sx, sz) === 0 && this.heightAt(sx + .4, sz) === 0 && this.heightAt(sx - .4, sz) === 0) return { x: sx, z: sz };
          }
        }
      }
    }
    return { x, z };
  }

  placeProp(kind, x) {
    const p = this.safeSpot(x, rand(LANE.zMin + .4, LANE.zMax - .4));
    this.props.push(new Prop(kind, p.x, p.z));
  }

  dispose(r) { r.deleteMesh(this.terrain); }
}
