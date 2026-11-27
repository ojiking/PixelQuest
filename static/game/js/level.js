// 블록 지형 생성 + 스테이지 구성(전투 구역, 오브젝트, 함정 배치)
import { BIOMES, ENEMY_CURVE, WAVE_CURVE, ENEMIES, LANE, TRAPS } from './config.js';
import { hash3, hexToRgb, FACES, MeshBuilder, faceAO } from './voxel.js';
import { rand, randi, weightedPick } from './math.js';
import { Prop, SpikeTrap, Item } from './props.js';
import { rollWeapon } from './game.js';
import { buildCityBlocks, makeSigns, buildRoadMarks, buildPoles } from './city.js';
import { buildNYCBlocks, makeFacades, makeNYCSigns, buildNYCRoad, buildNYCDecor, buildFogCards } from './nyc.js';
import { planBiome, buildBiome } from './biomes.js';
import { buildObstacles } from './obstacles.js';

const AIR = 0, GRASS = 1, DIRT = 2, LANEB = 3, STONE = 4, WALL = 5, WALL2 = 6, GLASS = 7, WOOD = 8, LEAVES = 9, VOID = 10;
const SIDE = 11, TRIM = 12, FAR = 13, RAIL = 14, GHOST = 15, BUILD0 = 20;   // GHOST: 장애물 칸 (그리지 않고 틈새 그늘만) // 도시용 블록 (BUILD0~ 건물 외벽 색)
export const PIT = -100;           // 낭떠러지 (떨어지면 사망)
const DEPTH = -12;                 // 낭떠러지 바닥 깊이
const LANE_Z0 = -4, LANE_Z1 = 4;   // 걸을 수 있는 블록 줄 (z 셀)
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

function buildTerrain(r, L, biome, seed, hmap, plan) {
  const w = new World(-14, L + 16, plan ? -40 : -32, 8, DEPTH, 18);
  const heights = new Map();
  const city = !!biome.city;
  const groundH = (x, z) => {
    if (plan) return plan.groundH(x, z);              // 초원·사막·항구: biomes.js 계획 (null = 물)
    if (z >= -5 || (city && z >= -30)) return 0;
    let h = (-z - 5) * 0.3 + noise2(x * 0.07, z * 0.09, seed) * 3 - 0.6;
    if (z < -17) h += (-z - 17) * 0.55 + noise2(x * 0.05, z * 0.05, seed + 7) * 6;
    return Math.max(0, Math.floor(h));
  };
  for (let x = w.x0; x < w.x0 + w.W; x++) {
    for (let z = w.z0; z < w.z0 + w.D; z++) {
      const h = groundH(x, z);
      heights.set(x + ',' + z, h ?? 0);
      const hm = hmap.get(x + ',' + z);
      if (hm === PIT) { w.set(x, DEPTH, z, VOID); continue; } // 낭떠러지: 바닥만 어둡게
      if (h === null) continue;                                // 물 (항구)
      for (let y = w.y0; y < h; y++) {
        let b = y === h - 1 ? GRASS : y >= h - 3 ? DIRT : STONE;
        if (city && y === h - 1) b = z >= -2 && z <= LANE_Z1 ? LANEB : SIDE; // 도시: 차도 + 인도
        else if (y === -1 && z >= LANE_Z0 && z <= LANE_Z1) {
          const edge = (z === LANE_Z0 || z === LANE_Z1) && hash3(x, 3, z) > 0.45;
          b = edge ? GRASS : LANEB;
        }
        w.set(x, y, z, b);
      }
      // 올라설 수 있는 블록 / 벽: 겉모습은 obstacles.js가 그림 (여기선 바닥 틈새 그늘용 투명 블록)
      if (hm > 0) for (let y = 0; y < hm; y++) w.set(x, y, z, GHOST);
    }
  }
  let signSpecs = [], nyc = null;
  if (city && biome.nyc) {
    nyc = buildNYCBlocks(w, L, { build: biome.build.map((_, i) => BUILD0 + i), trim: TRIM, far: FAR, rail: RAIL });
    signSpecs = nyc.signs;
  } else if (city) {
    signSpecs = buildCityBlocks(w, L, { build: biome.build.map((_, i) => BUILD0 + i), glass: GLASS, trim: TRIM, far: FAR });
  }


  // 블록 → 색
  const snowy = biome.flora === 'spruce';
  const C = k => hexToRgb(biome[k]);
  const BL = {
    [GRASS]: { top: C('grass'), side: C(biome.hillSide ? 'hillSide' : 'dirt'), strip: 1, stripC: C('grass') },   // 언덕 옆면은 풀빛(초원)·모래(사막)·눈(항구)
    [DIRT]: { top: C('dirt'), side: C('dirt') },
    [LANEB]: { top: C('lane'), side: C(biome.edge ? 'edge' : 'dirt') },
    [STONE]: { top: C('stone'), side: C('stone') },
    [WALL]: { top: C('wall'), side: C('wall') },
    [WALL2]: { top: C('wall2'), side: C('wall2') },
    [GLASS]: { top: C('glass'), side: C('glass') },
    [WOOD]: { top: C('wood'), side: C('wood') },
    [VOID]: { top: [0.05, 0.04, 0.06], side: [0.05, 0.04, 0.06] },
    [SIDE]: { top: C('grass'), side: C('stone') },
    ...(city ? { [TRIM]: { top: C('trim'), side: C('trim') }, [FAR]: { top: C('far'), side: C('far') }, [RAIL]: { top: C(biome.rail ? 'rail' : 'trim'), side: C(biome.rail ? 'rail' : 'trim') } } : {}),
    ...(city ? Object.fromEntries(biome.build.map((c, i) => [BUILD0 + i, { top: hexToRgb(c), side: hexToRgb(c) }])) : {}),
    [LEAVES]: snowy ? { top: C('grass'), side: C('leaves'), strip: 1, stripC: C('grass') } : { top: C('leaves'), side: C('leaves') },
  };
  const mb = new MeshBuilder();
  for (let z = w.z0; z < w.z0 + w.D; z++) {
    for (let y = w.y0; y < w.y0 + w.H; y++) {
      for (let x = w.x0; x < w.x0 + w.W; x++) {
        const b = w.get(x, y, z);
        if (b === AIR || b === GHOST) continue;
        const bl = BL[b];
        for (const f of FACES) {
          if (f.n[1] === -1) continue;
          const nb = w.get(x + f.n[0], y + f.n[1], z + f.n[2]);
          if (nb !== AIR && nb !== GHOST) continue;
          const ao = faceAO(w, x, y, z, f, (gx, gy, gz) => w.get(gx, gy, gz) !== AIR);   // 블록 틈새 그늘
          if (f.n[1] === 1) mb.quad(f, x, y, z, 1, 1, 1, bl.top, bl.top, 0, ao);
          else mb.quad(f, x, y, z, 1, 1, 1, bl.side, bl.stripC ?? bl.side, bl.strip ?? 0, ao);
        }
      }
    }
  }
  return { mesh: mb.build(r), signSpecs, nyc };
}

export const STAGE_COUNT = 2;
// 스테이지별 전투 구역 위치 (마지막 스테이지는 보스 구역 하나 더)
export const stageTriggers = i => i === STAGE_COUNT - 1 ? [18, 42, 66, 90] : [20, 46, 72];
// 런 전체에서 이 구역의 진행도 0~1 (보스 구역 제외)
function zoneT(index, zi) {
  let before = 0, total = 0;
  for (let i = 0; i < STAGE_COUNT; i++) {
    const n = stageTriggers(i).length - (i === STAGE_COUNT - 1 ? 1 : 0);
    if (i < index) before += n;
    total += n;
  }
  return Math.min(1, (before + zi) / Math.max(1, total - 1));
}

// ---------------------------------------------------------------- 지형 구간
// 구간 종류: 걸을 수 있는 높이 맵(hmap)을 칠함. 값: PIT=낭떠러지, 1=올라설 블록, 2=넘을 수 없는 벽
const SEG = {
  open() {},
  cliffFront(h, a, b) { fill(h, a, b, 3, PIT_Z1, PIT); },                 // 앞쪽 두 줄이 낭떠러지 (길이 넓어져 6칸 남음)
  cliffBack(h, a, b) { fill(h, a, b, PIT_Z0, -4, PIT); },                 // 뒤쪽 한 줄이 낭떠러지
  bridge(h, a, b) { fill(h, a, b, PIT_Z0, -4, PIT); fill(h, a, b, 3, PIT_Z1, PIT); }, // 다리 (6칸 폭: 피할 공간 확보)
  gaps(h, a, b) {                                                           // 점프로 건너야 하는 틈: 자연스럽게 구불구불한 균열
    for (let x = a + 2; x + 3 <= b - 2; x += randi(5, 7)) crack(h, x, a + 1, b - 1);
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
// 땅이 갈라진 균열: 줄(z)마다 좌우로 1칸씩 구불거리고 폭은 2~3칸 (항상 점프로 건널 수 있음)
// 이웃 줄끼리 최소 1칸은 겹쳐서 대각선으로 빠져나갈 틈이 없음
function crack(h, x0, lo, hi) {
  let left = x0, trend = Math.random() < 0.5 ? -1 : 1, prevL = x0, prevR = x0 + 2;
  for (let z = PIT_Z0; z <= PIT_Z1; z++) {
    if (Math.random() < 0.45) left += Math.random() < 0.65 ? trend : -trend;   // 한쪽으로 비스듬히 흐르다가 가끔 꺾임
    if (Math.random() < 0.15) trend = -trend;
    left = Math.max(x0 - 1, Math.min(x0 + 1, left));
    let w = Math.random() < 0.3 ? 3 : 2;
    left = Math.max(lo, Math.min(hi - w, left));
    // 이웃 줄과 겹치게 보정
    if (left > prevR - 1) left = prevR - 1;
    if (left + w < prevL + 1) w = prevL + 1 - left;
    w = Math.min(3, w);
    for (let x = left; x < left + w; x++) h.set(x + ',' + z, PIT);
    // 가장자리가 부서진 듯한 홈 (폭 2일 때만, 총 3칸을 넘지 않게)
    if (w === 2 && Math.random() < 0.18) h.set((Math.random() < .5 ? left - 1 : left + 2) + ',' + z, PIT);
    prevL = left; prevR = left + w;
  }
}
function fill(h, x0, x1, z0, z1, v) {
  for (let x = x0; x < x1; x++) for (let z = z0; z <= z1; z++) h.set(x + ',' + z, v);
}
// 전투 구역은 대부분 평지. 낭떠러지 구간은 스테이지당 최대 MAX_PIT_SEGS개
const ARENA_TYPES = { open: 5, platforms: 2, walls: 1.2, cliffFront: 0.8, cliffBack: 0.5 };
const PATH_TYPES = { barrier: 2.5, platforms: 2, open: 1.5, walls: 1.2, gaps: 1.3, bridge: 0.6, cliffFront: 0.5 };
const CITY_ARENA = { open: 4, walls: 1.5, platforms: 1, cliffFront: .4 };
const CITY_PATH = { walls: 2.5, open: 2, barrier: 1.5, platforms: 1, gaps: .6 };
const PIT_TYPES = new Set(['cliffFront', 'cliffBack', 'bridge', 'gaps']);
const MAX_PIT_SEGS = 2;
export const SEG_HINTS = { cliffFront: '절벽길 — 앞쪽은 낭떠러지', cliffBack: '벼랑 끝 — 뒤쪽은 낭떠러지', bridge: '외나무 다리 — 떨어지면 끝', gaps: '끊어진 길 — 점프로 건너라', barrier: '바리케이드 — 뛰어넘어라', walls: '좁은 골목', platforms: '잔해 더미 — 올라설 수 있다' };
export const SEG_NAMES = { open: '광장', cliffFront: '절벽길', cliffBack: '벼랑 끝', bridge: '외나무 다리', gaps: '끊어진 길', barrier: '바리케이드', walls: '좁은 골목', platforms: '잔해 더미' };


export class Stage {
  constructor(game, index, biomeKey) {
    this.index = index;
    this.final = index === STAGE_COUNT - 1;
    this.biome = BIOMES[biomeKey];
    this.biomeKey = biomeKey;
    this.lab = !!game.run.lab;            // 무기방(개발자): 평평한 빈 마당
    this.L = this.lab ? 44 : this.final ? 106 : 100;
    this.props = [];
    this.traps = [];
    this.items = [];
    this.zones = [];
    this.hmap = new Map();
    this.segments = [];

    const triggers = this.lab ? [] : stageTriggers(index);

    // ---- 지형 구간 배치: 전투 구역(아레나) 사이를 이동 구간으로 채움
    const arenaSpan = t => [t - 5, t + 13];
    let cursor = 8;
    triggers.forEach((t, zi) => {
      const [a0, a1] = arenaSpan(t);
      if (a0 - cursor >= 5) this.addSeg(this.pickSeg(PATH_TYPES), cursor, a0);
      const boss = this.final && zi === triggers.length - 1;
      this.addSeg(boss ? 'open' : this.pickSeg(ARENA_TYPES), Math.max(cursor, a0), a1);
      cursor = a1;
    });
    if (this.lab) this.addSeg('open', 0, this.L);
    else if (this.L - 6 - cursor >= 5) this.addSeg(this.pickSeg(PATH_TYPES), cursor, this.L - 6);

    this.solid = new Map();   // 주차된 차·쓰레기통 (올라설 수 있는 장애물 높이)
    this.solids = [];
    if (this.biome.city && !this.lab) this.placeCityProps();
    const seed = randi(1, 9999);
    const plan = this.biome.city ? null : planBiome(biomeKey, this.L, seed);   // 초원·사막·항구 배경 구획
    const t0 = performance.now();
    const built = buildTerrain(game.r, this.L, this.biome, seed, this.hmap, plan);
    const t1 = performance.now();
    this.terrain = built.mesh;
    this.buildHazard();
    // 장애물(벽·잔해·바리케이드)과 낭떠러지 단면: 바이옴에 맞는 물건으로
    const obs = buildObstacles(game.r, this, this.biome.city ? 'city' : biomeKey);
    this.obstacles = obs.chunks; this.pitEdges = obs.edges;
    const t2 = performance.now();
    if (plan) {
      const env = buildBiome(game.r, plan, (x, z) => this.heightAt(x, z) === PIT);
      this.envNear = env.near; this.envFar = env.far; this.envGround = env.ground; this.fogCards = env.fogCards;
    }
    this.buildMs = { terrain: Math.round(t1 - t0), obstacles: Math.round(t2 - t1), env: Math.round(performance.now() - t2) };   // 스테이지 생성 시간 (테스트 확인용)
    if (this.biome.nyc) {   // 폐허 뉴욕: 0.2m 외벽·영어 간판·바랜 도로·거리 장식·물탱크·안개막
      const isPit = (x, z) => this.heightAt(x, z) === PIT;
      this.facades = makeFacades(game.r, built.nyc.facades);
      this.signs = makeNYCSigns(game.r, built.signSpecs);
      this.roadMarks = buildNYCRoad(game.r, this.L, isPit);
      this.decor = buildNYCDecor(this.L).filter(d => !isPit(d.x, d.z));
      this.towers = built.nyc.towers;
      this.fogCards = buildFogCards(game.r, this.L);
      this.poles = []; this.wireCount = 0;
    } else if (this.biome.city) {
      this.signs = makeSigns(game.r, built.signSpecs);
      this.roadMarks = buildRoadMarks(game.r, this.L, (x, z) => this.heightAt(x, z) === PIT);
      Object.assign(this, buildPoles(this.L));
    }
    if (this.lab) return;                 // 무기방: 구역·소품·함정·무기 배치 없음 (game.startLab이 무기를 진열)

    triggers.forEach((tx, zi) => {
      const waves = [];
      // 보스는 마지막 스테이지의 마지막 구역에만 (철거반장 / 사이보그 폭주왕 중 무작위)
      const isBoss = this.final && zi === triggers.length - 1;
      const bossType = game.run.boss ?? 'boss';
      if (isBoss && bossType === 'cyborg') {
        waves.push(['grunt', 'biker', 'thrower', 'grunt']);
        waves.push(['cyborg']);
      } else if (isBoss) {
        waves.push(['grunt', 'thrower', 'grunt']);
        waves.push(['boss', 'grunt']);
      } else {
        waves.push(...this.curveWaves(game, Math.min(1, zoneT(index, zi) + ((game.run.chapter || 1) - 1)), zi === triggers.length - 1));
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
        const z0 = randi(-3, 3);
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

  // 낭떠러지 구간이 이미 많으면 평지 계열로 다시 뽑음
  pickSeg(table) {
    if (this.biome.city) table = table === ARENA_TYPES ? CITY_ARENA : CITY_PATH;
    let type = weightedPick(table);
    const pits = this.segments.filter(sg => PIT_TYPES.has(sg.type)).length;
    const prev = this.segments[this.segments.length - 1];
    if (PIT_TYPES.has(type) && (pits >= MAX_PIT_SEGS || (prev && PIT_TYPES.has(prev.type)))) {
      const safe = Object.fromEntries(Object.entries(table).filter(([k]) => !PIT_TYPES.has(k)));
      type = weightedPick(safe);
    }
    return type;
  }

  addSeg(type, a, b) {
    a = Math.floor(a); b = Math.floor(b);
    SEG[type](this.hmap, a, b);
    this.segments.push({ type, a, b });
  }

  // 난이도 곡선에 따른 구역 웨이브 구성
  curveWaves(game, t, lastOfStage) {
    const run = game.run;
    run.introduced ??= new Set();
    // 아직 소개 안 된 적 중 등장 시점이 된 것 → 이번 구역에서 소개 (구역당 최대 2종)
    const backlog = Object.keys(ENEMY_CURVE).filter(k => ENEMY_CURVE[k].from <= t + 1e-6 && !run.introduced.has(k))
      .sort((a, b) => ENEMY_CURVE[a].from - ENEMY_CURVE[b].from);
    const fresh = backlog.slice(-2);   // 밀린 게 많으면(중간 스테이지부터 시작 등) 나머지는 조용히 합류
    backlog.forEach(k => run.introduced.add(k));
    const pool = {};
    for (const k of run.introduced) {
      const c = ENEMY_CURVE[k];
      const u = Math.min(1, Math.max(0, (t - c.from) / Math.max(.01, 1 - c.from)));
      pool[k] = (c.w[0] + (c.w[1] - c.w[0]) * u) * (this.biome.city && c.city ? c.city : 1) * (k === 'biker' && game.stats?.player.fx?.has('bikers') ? 2 : 1);
    }
    const W = WAVE_CURVE;
    const nWaves = Math.round(W.waves[0] + (W.waves[1] - W.waves[0]) * t) + (lastOfStage && t < .5 ? 1 : 0);
    const waves = [];
    for (let wv = 0; wv < nWaves; wv++) {
      const size = Math.round(W.size[0] + (W.size[1] - W.size[0]) * t + wv * 0.4);
      const list = [];
      // 새로 소개되는 적: 첫 웨이브에 1명 (기본 적이 아닌 경우)
      if (wv === 0) for (const k of fresh) if (ENEMY_CURVE[k].from > 0) list.push(k);
      while (list.length < size) list.push(weightedPick(pool));
      waves.push(list);
    }
    return waves;
  }

  // 낭떠러지 가장자리에 노랑·검정 경고 줄무늬 (바닥에 칠한 것처럼 표면 바로 아래에 묻힌 얇은 큐브)
  buildHazard() {
    const out = [], T = 0.25, e = 0.012;
    const Y = [0.95, 0.78, 0.1], K = [0.08, 0.08, 0.09];
    for (let x = 0; x < this.L; x++) for (let z = -5; z <= 6; z++) {
      const h = this.heightAt(x + .5, z + .5);
      if (h === PIT || h > 1) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (this.heightAt(x + .5 + dx, z + .5 + dz) !== PIT) continue;
        for (let i = 0; i < 4; i++) {
          const u = (i + .5) * T;                       // 가장자리를 따라 4칸
          const px = dx ? x + (dx > 0 ? 1 - T / 2 - 0.02 : T / 2 + 0.02) : x + u;
          const pz = dz ? z + (dz > 0 ? 1 - T / 2 - 0.02 : T / 2 + 0.02) : z + u;
          const c = (i + x + z) % 2 ? K : Y;
          out.push(px, h - T / 2 + e, pz, T * 0.96, c[0], c[1], c[2]);
        }
      }
    }
    this.hazard = new Float32Array(out);
    this.hazardN = out.length / 7;
  }

  // 셀 높이: PIT / 0 / 1 / 2
  heightAt(x, z) {
    const k = Math.floor(x) + ',' + Math.floor(z);
    const v = this.hmap.get(k);
    if (v === PIT) return PIT;
    const s = this.solid.get(k);
    return Math.max(v === undefined ? 0 : v, s === undefined ? 0 : s);
  }

  // 도시: 길가에 주차된 차, 골목 쓰레기통 (올라설 수 있는 장애물)
  placeCityProps() {
    const free = (x0, x1, z0, z1) => {
      for (let x = x0; x < x1; x++) for (let z = z0; z <= z1; z++) if ((this.hmap.get(x + ',' + z) ?? 0) !== 0 || this.solid.has(x + ',' + z)) return false;
      return true;
    };
    const put = (model, x0, len, z0, depth, h) => {
      for (let x = x0; x < x0 + len; x++) for (let z = z0; z < z0 + depth; z++) this.solid.set(x + ',' + z, h);
      const o = { model, x: x0, z: z0, len, dep: depth };
      if (model.startsWith('car')) Object.assign(o, { car: true, hp: TRAPS.car.hp, max: TRAPS.car.hp, fuse: -1, wreck: false, flash: 0, smokeT: 0 });
      this.solids.push(o);
      return o;
    };
    let cars = 0;
    for (let tries = 0; tries < 40 && cars < 6; tries++) {
      const x0 = randi(12, this.L - 16);
      const front = Math.random() < 0.55;
      const z0 = front ? 3 : -2;   // 앞쪽 갓길 / 뒤쪽 갓길
      if (!free(x0 - 1, x0 + 5, z0, z0 + 1)) continue;
      put('car' + randi(0, 6), x0, 4, z0, 2, 1.3);
      cars++;
    }
    for (const sg of this.segments) {
      if (sg.type !== 'walls') continue;  // 뒷골목: 쓰레기통
      for (let x = sg.a + 2; x < sg.b - 2; x += randi(4, 7)) if (free(x, x + 2, -1, -1)) put('dumpster', x, 2, -1, 1, 1.15);
    }
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

  dispose(r) {
    r.deleteMesh(this.terrain);
    for (const k of ['obstacles', 'pitEdges', 'envNear', 'envFar', 'envGround']) for (const c of this[k] ?? []) r.deleteMesh(c.mesh);
    if (this.roadMarks) r.deleteMesh(this.roadMarks);
    for (const s of this.signs ?? []) r.deleteMesh(s.mesh);
    for (const f of this.facades ?? []) r.deleteMesh(f.mesh);
    for (const f of this.fogCards ?? []) r.deleteMesh(f.mesh);
  }
}
