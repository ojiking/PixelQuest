// 블록 지형 생성 + 스테이지 구성(전투 구역, 오브젝트, 함정 배치)
import { BIOMES, SPAWN_POOLS, LANE } from './config.js';
import { hash3, hexToRgb, FACES, MeshBuilder } from './voxel.js';
import { rand, randi, weightedPick } from './math.js';
import { Prop, SpikeTrap, Item } from './props.js';
import { rollWeapon } from './game.js';

const AIR = 0, GRASS = 1, DIRT = 2, LANEB = 3, STONE = 4, WALL = 5, WALL2 = 6, GLASS = 7, WOOD = 8, LEAVES = 9;

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

function buildTerrain(r, L, biome, seed) {
  const w = new World(-14, L + 16, -32, 8, -4, 18);
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
      for (let y = w.y0; y < h; y++) {
        let b = y === h - 1 ? GRASS : y >= h - 3 ? DIRT : STONE;
        if (y === -1 && z >= -4 && z <= 2) {
          const edge = (z === -4 || z === 2) && hash3(x, 3, z) > 0.45;
          b = edge ? GRASS : LANEB;
        }
        w.set(x, y, z, b);
      }
      // 차도 경계석(낮은 담장, 군데군데 무너짐)
      if (z === -5 && hash3(x, 9, z) > 0.25) w.set(x, 0, z, hash3(x, 10, z) > 0.8 ? WALL2 : WALL);
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

export class Stage {
  constructor(game, index, biomeKey) {
    this.index = index;
    this.final = index === STAGE_COUNT - 1;
    this.biome = BIOMES[biomeKey];
    this.biomeKey = biomeKey;
    this.L = 100;
    this.terrain = buildTerrain(game.r, this.L, this.biome, randi(1, 9999));
    this.props = [];
    this.traps = [];
    this.items = [];
    this.zones = [];

    const pool = SPAWN_POOLS[Math.min(index, SPAWN_POOLS.length - 1)];
    const triggers = this.final ? [18, 42, 66, 88] : [20, 46, 72];
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
      for (let k = 0; k < nb; k++) this.props.push(new Prop('barrel', tx + rand(1, 8), rand(LANE.zMin + .4, LANE.zMax - .4)));
    });
    // 나무 상자
    for (let x = 8 + rand(0, 4); x < this.L - 8; x += rand(7, 12)) {
      this.props.push(new Prop('crate', x, rand(LANE.zMin + .4, LANE.zMax - .4)));
    }
    // 가시 함정 (블록 2x2, 격자에 맞춤)
    for (let k = 0; k < triggers.length - 1; k++) {
      const x0 = Math.floor((triggers[k] + triggers[k + 1]) / 2 + rand(-3, 3));
      const z0 = randi(-3, 1);
      this.traps.push(new SpikeTrap(x0 + 1, z0 + 1, rand(0, 3)));
    }
    // 시작 무기
    // 첫 무기 + 구간마다 무작위 무기 (서로 다른 종류)
    const first = index === 0 ? 'pipe' : rollWeapon(['pipe']);
    const got = [first];
    this.items.push(new Item('weapon', first, 6.5, -1));
    for (let k = 1; k < triggers.length; k++) {
      const w = rollWeapon(got);
      got.push(w);
      this.items.push(new Item('weapon', w, triggers[k] - rand(3, 5), rand(LANE.zMin + .5, LANE.zMax - .5)));
    }
  }

  dispose(r) { r.deleteMesh(this.terrain); }
}

