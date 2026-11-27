// 지형 장애물(높이 맵의 벽·잔해 더미·바리케이드)과 낭떠러지 가장자리를 바이옴에 맞는 '그럴듯한 물건'으로 그림
// 판정은 그대로 높이 맵 칸(1m)이 정함. 겉모습은 그 칸을 꽉 채우도록 0.1m 복셀로 만든다:
//  - 윗면은 칸 높이(1 / 2m)에 맞춤 → 올라서는 높이와 핏자국 위치가 맞음
//  - 옆면은 칸 경계에 붙임 (덩굴·모래 더미·고드름처럼 장식만 경계 밖 0.2m 여백에)
//  - 2m 벽(넘을 수 없음)은 한 구간 = 한 물건 + 위로 솟은 윤곽(잔해 더미·비계·위 칸 컨테이너)으로 1m 발판과 구분
//  - 1m 발판(올라설 수 있음)은 부서지는 나무 상자와 헷갈리지 않게: 쓰레기 컨테이너·콘크리트 판·팔레트 짐 (윗면이 밝고 깨끗함)
import { PIT } from './level.js';
import { Chunks, grid, box, cyl, line, h3, vnoise, mixC, shadeC, rgb } from './env.js';
import { FACES } from './voxel.js';
import { OBSTACLE } from './config.js';
import { pick, rand, randi } from './math.js';
import { paintCar } from './env_models.js';
import { VoxGrid } from './voxel.js';

const S = 0.1, P = 2;   // 복셀 크기(m), 경계 밖 장식 여백(칸)
const CROWN = 12;       // 2m 벽 위로 솟는 장식 높이 여유(칸)

// ---------------------------------------------------------------- 높이 맵 → 직사각형 조각
// 같은 높이(1 또는 2)의 칸을 x 방향 → z 방향으로 넓게 묶음 (벽 구간 = 긴 직사각형, 바리케이드 = x 1칸 × z 9칸, 잔해 = 2×2)
function rects(hmap) {
  const cells = [];
  for (const [k, v] of hmap) if (v === 1 || v === 2) { const [x, z] = k.split(',').map(Number); cells.push([x, z, v]); }
  cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const used = new Set(), out = [];
  const ok = (x, z, h) => hmap.get(x + ',' + z) === h && !used.has(x + ',' + z);
  for (const [x, z, h] of cells) {
    if (used.has(x + ',' + z)) continue;
    let w = 1; while (ok(x + w, z, h)) w++;
    let d = 1; while ([...Array(w).keys()].every(i => ok(x + i, z + d, h))) d++;
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) used.add((x + i) + ',' + (z + j));
    out.push({ x, z, w, d, h });
  }
  return out;
}

// ---------------------------------------------------------------- 그리는 도구
// 칠하기 함수는 (g, c) 를 받음. c: { W, H, D (안쪽 크기, 복셀), 안쪽 시작은 (P, 0, P), seed, biome, long:'x'|'z' }
const IN = (c, x, y, z) => x >= P && x < P + c.W && y >= 0 && y < c.H && z >= P && z < P + c.D;
const FRONT = c => P + c.D - 1;        // 카메라 쪽 면 (z가 가장 큰 줄)
const fillIn = (g, c, col) => box(g, P, 0, P, P + c.W - 1, c.H - 1, P + c.D - 1, col);
const U = (x, z) => x + z;             // 면 위 가로 좌표 (앞면은 x, 옆면은 z)

const CONCRETE = [0x8a867e, 0x7e7a72, 0x94908a, 0x86827a];
const RUST = [0x6e4028, 0x7a4a2e, 0x5e3622, 0x865436];
const WOOD = [0x7a5e40, 0x6e5438, 0x846646, 0x5e4830];
const BRICK = [0x7e4636, 0x8a4e3a, 0x6e3e30, 0x965a44, 0x7a4232];
export const SNOWC = [0xc4c9cc, 0xbcc1c4, 0xb4b9bc];   // 눈 (너무 하얗게 날아가지 않게 상한)
const SAND = [0xb09a74, 0xa48e6a, 0xb8a27e];
const BLADE = [0x8a8a5a, 0x7a7e4e, 0x96925e, 0x6e7248, 0x9a9468];   // 마른 풀잎 (카키·올리브)

// 구조적인 녹: 윗 가장자리에서 흘러내린 줄, 아래 띠 (무작위 얼룩 대신)
const rustStreak = (col, u, y, top, s) => {
  const r = h3(u, 11, s);
  if (r < .16 && top - y < 3 + r * 40) return mixC(col, RUST[(u >> 1) % 4], .55 * (1 - (top - y) / (3 + r * 40)));
  return col;
};

// ================================================================ 2m 벽 (좁은 골목): 한 구간 = 한 물건
// ---- 도시: 무너진 건물 외벽 덩어리 (인도 쪽에서 쏟아져 나옴). 앞면 = 쓰러진 벽(창문 자리), 위 = 벽돌·목재 잔해 더미
function pFacade(g, c) {
  const s = c.seed, fz = FRONT(c), MORT = 0x8a7a6a;
  fillIn(g, c, (x, y, z) => {
    const u = U(x, z), row = (y / 3) | 0;
    if (y % 3 === 2) return MORT;
    if ((u + (row & 1) * 3) % 6 === 5) return MORT;
    let col = BRICK[(h3(((u + (row & 1) * 3) / 6) | 0, row, s) * BRICK.length) | 0];
    if (y < 4) col = shadeC(col, .8);
    if (vnoise(u * .12, y * .12, s + 3) > .7) col = mixC(col, 0xa89a88, .7);      // 남은 회벽
    return col;
  });
  // 쓰러진 벽의 창문 자리: 어두운 구멍 + 부서진 창틀 + 위 인방돌
  for (let wx = P + 4 + randi(0, 6); wx + 7 < P + c.W - 2; wx += 14 + randi(0, 4)) {
    for (let x = wx; x < wx + 7; x++) for (let y = 5; y < 14; y++) {
      g.set(x, y, fz, -1); g.set(x, y, fz - 1, -1); g.set(x, y, fz - 2, 0x1a1816);
      if ((x === wx || x === wx + 6 || y === 9) && h3(x, y, s) < .6) g.set(x, y, fz - 1, 0x4a3a2a);
    }
    for (let x = wx - 1; x <= wx + 7; x++) g.set(x, 14, fz, 0x9a9082);
  }
  // 위: 잔해 더미 (뒤쪽 인도로 갈수록 높게) + 삐져나온 각목·철근
  for (let x = P; x < P + c.W; x++) for (let z = P; z <= fz; z++) {
    const t = (fz - z) / c.D, hh = Math.floor(t * 6 + vnoise(x * .2, z * .25, s) * 4 - 1.5);
    for (let k = 0; k < hh; k++) g.set(x, c.H + k, z, h3(x, k, z + s) < .25 ? pick(CONCRETE) : BRICK[(x + z + k) % 5]);
  }
  for (let i = 0; i < c.W / 25; i++) { const x = P + randi(4, c.W - 5), z = P + randi(2, c.D - 6); line(g, x, c.H - 1, z, x + randi(-4, 4), c.H + randi(6, 10), z + randi(-3, 3), WOOD[i % 4], 0); }
  for (let i = 0; i < c.W / 12; i++) { const x = P + randi(2, c.W - 3), z = P + randi(2, c.D - 4); line(g, x, c.H, z, x + randi(-2, 2), c.H + randi(4, 8), z, RUST[i % 4]); }
  // 앞쪽 바닥으로 흘러내린 벽돌
  for (let x = 0; x < c.W + 2 * P; x++) for (let k = 1; k <= 2; k++) if (h3(x, k, s) < .45 - k * .12) g.set(x, 0, fz + k, pick(BRICK));
}

// ---- 도시: 공사장 합판 가림막 (포스터·낙서) + 뒤에 비계 기둥
function pHoarding(g, c) {
  const s = c.seed, fz = FRONT(c), PLY = [0x9a8466, 0x8e7a5c, 0xa48e70], POST = [0x8a6a5a, 0x6a7a7a, 0xa89a7a, 0x5a5e6a, 0x9a8a5a, 0x7a5a5a];
  fillIn(g, c, (x, y, z) => z >= fz - 1 ? -2 : (y === c.H - 1 ? pick([0x6a5e4e, 0x5e564a, 0x7a6e5e]) : 0x4a4238));   // 안쪽: 흙·잔해 (윗면만 보임)
  const top = c.H + 4;
  for (let x = P; x < P + c.W; x++) for (let y = 0; y < top; y++) for (const z of [fz, fz - 1]) {
    const pan = ((x - P) / 12) | 0;
    let col = (x - P) % 12 === 0 ? shadeC(PLY[pan % 3], .7) : PLY[(pan + s) % 3];
    if (y < 3) col = shadeC(col, .78);
    if (y === top - 1 && z === fz) col = shadeC(col, .85);
    g.set(x, y, z, col);
  }
  // 포스터 (바랜 사각형) + 낙서
  for (let i = 0; i < c.W / 9; i++) {
    const px = P + randi(1, c.W - 9), py = randi(4, 12), w = randi(5, 8), hgt = randi(6, 9), col = pick(POST);
    for (let x = px; x < px + w; x++) for (let y = py; y < py + hgt; y++) g.set(x, y, fz, y === py + hgt - 1 ? shadeC(col, 1.25) : (h3(x, y, s) < .12 ? PLY[0] : col));
  }
  for (let n = 0; n < c.W / 20; n++) { const gx = P + randi(0, c.W - 10), gy = randi(2, 8), gc = pick([0x6a4a5a, 0x4a5a6a, 0xb8b0a0]); for (let i = 0; i < 20; i++) g.set(gx + randi(0, 9), gy + randi(0, 3), fz, gc); }
  // 비계: 뒤쪽 회색 쇠파이프 틀
  const SC = 0x6a6a66;
  for (let x = P + 2; x < P + c.W; x += 20) for (let y = c.H; y < c.H + 10; y++) { g.set(x, y, P + 3, SC); g.set(x, y, P + 12, SC); }
  for (let x = P + 2; x < P + c.W - 1; x++) { g.set(x, c.H + 9, P + 3, SC); g.set(x, c.H + 9, P + 12, SC); if ((x - P) % 20 < 10) g.set(x, c.H + Math.round(((x - P - 2) % 20) * .9), P + 12, SC); }
  for (let x = P; x < P + c.W; x += 8) for (let z = P + 3; z <= P + 12; z++) g.set(x, c.H + 9, z, 0x7a6a4a);   // 발판 널
}

// ---- 도시: 쌓아 놓은 폐차 (찌그러진 차 2단 + 위에 하나)
const CARC = [0x6a5a48, 0x5e6266, 0x7a4a34, 0x8a7a4a, 0x4a5450, 0x6e4a3a];
function crushedCar(g, x0, len, y0, z0, z1, col, s, fz) {
  for (let x = x0; x < x0 + len; x++) for (let y = y0; y < y0 + 10; y++) for (let z = z0; z <= z1; z++) {
    const lx = x - x0, ly = y - y0;
    if ((lx === 0 || lx === len - 1) && (ly === 9 || ly === 0)) continue;
    let cc = col;
    if (ly < 2) cc = 0x2a2624;                                                    // 아래 차대
    else if (ly >= 6 && ly <= 7 && lx > len * .2 && lx < len * .8) cc = h3(x, y, z) < .3 ? 0x3a4248 : 0x1a1c1e;   // 찌그러진 유리 띠
    else if (ly === 5) cc = shadeC(col, .7);
    if (ly >= 2 && ly < 4) cc = mixC(cc, RUST[(lx >> 2) % 4], .45);
    g.set(x, y, z, rustStreak(cc, lx, ly, 9, s));
  }
  // 앞면 바퀴
  for (const wx of [x0 + 7, x0 + len - 8]) for (let x = wx - 3; x <= wx + 3; x++) for (let y = y0; y < y0 + 6; y++) {
    const d = Math.hypot(x + .5 - wx - .5, y + .5 - y0 - 2.5); if (d < 3.2 && fz !== null) g.set(x, y, fz + 1, d < 1.4 ? 0x6a6a64 : 0x1c1c1c);
  }
}
function pCarStack(g, c) {
  const s = c.seed, fz = FRONT(c);
  for (let tier = 0; tier < 2; tier++) {
    let x = P + (tier ? -randi(0, 3) : 0);
    while (x < P + c.W) {
      const len = Math.min(P + c.W - Math.max(P, x), randi(34, 42));
      crushedCar(g, Math.max(P, x), len, tier * 10, P, fz, pick(CARC), s + x, fz);
      x += len;
    }
  }
  if (c.W >= 40) { const len = Math.min(c.W - 8, randi(30, 40)), x0 = P + randi(2, c.W - len - 2); crushedCar(g, x0, len, c.H, P + 4, P + c.D - 8, pick(CARC), s + 99, null); }   // 위에 하나 더
  else for (let x = P + 2; x < P + c.W - 2; x += 6) cyl(g, 'y', x + 2.5, P + 8, 2.6, c.H, c.H + 1, 0x1c1c1c);   // 타이어 더미
}

// ---- 도시: 옆으로 넘어진 버스 (윗면 = 창문 줄, 앞면 = 지붕, 끝 = 앞유리·라이트)
function pBus(g, c) {
  const s = c.seed, fz = FRONT(c), school = h3(s, 1, 1) < .5;
  const body = school ? 0xa88a3a : 0xa8a69a, stripe = school ? 0x2a2622 : 0x4a5a6e;
  fillIn(g, c, (x, y, z) => {
    const lx = x - P, side = y === c.H - 1;
    let col = body;
    if (side) {
      const wz = z >= fz - 13 && z <= fz - 4;                                     // 창문 줄 (지붕 쪽)
      if (wz && lx > 8 && lx < c.W - 6 && lx % 11 > 1) col = h3(x, z, s) < .2 ? 0x3e464c : 0x1a1e22;
      if (z === fz - 16 || z === fz - 17) col = stripe;                           // 옆 띠
      if (z < P + 3) col = 0x2a2826;                                             // 바닥 쪽 가장자리
    } else if (z === fz) {                                                       // 지붕: 골·점검구
      if (lx % 10 === 0) col = shadeC(body, .82);
      if (lx % 30 >= 12 && lx % 30 <= 17 && y >= 7 && y <= 12) col = shadeC(body, .9);
    }
    if (x === P + c.W - 1 && y > 3 && y < c.H - 2 && z > P + 4 && z < fz - 2) col = 0x1a1e22;   // 앞유리
    if (x === P && y > 4 && y < c.H - 3 && z > P + 6 && z < fz - 4 && (y + z) % 3 === 0) col = 0x3a3632;   // 뒤 엔진 그릴
    return rustStreak(col, lx, z === fz ? y : 0, c.H, s);
  });
  for (const z of [fz - 3, P + 6]) for (const y of [4, c.H - 5]) g.set(P + c.W, y, z, 0xb8ae88);   // 앞 라이트
  // 위로 들린 문짝 (높이 표시)
  const dx = P + randi(10, Math.max(11, c.W - 12));
  for (let k = 0; k < 8; k++) for (let x = dx; x < dx + 7; x++) g.set(x, c.H + k, fz - 6 - (k >> 1), k === 7 ? shadeC(body, .7) : (k > 2 && k < 6 && x > dx && x < dx + 6 ? 0x1a1e22 : body));
}

// ---- 초원: 무너진 콘크리트 판 더미 + 뒤쪽에 서 있는 부서진 벽 (철근·덩굴)
function pSlabRuin(g, c) {
  const s = c.seed, fz = FRONT(c);
  let y = 0, k = 0;
  while (y < c.H) {
    const th = Math.min(c.H - y, randi(3, 5)), col = CONCRETE[k % 4];
    box(g, P, y, P, P + c.W - 1, y + th - 1, fz, (x, yy, z) => { const cc = yy === y + th - 1 && yy < c.H - 1 ? shadeC(col, .9) : col; return z === fz ? rustStreak(cc, x, yy, c.H, s) : cc; });
    if (y + th < c.H) for (let x = P; x < P + c.W; x++) if (h3(x, k, s) < .75) g.set(x, y + th - 1, fz, 0x2e2c28);
    for (let x = P + 3; x < P + c.W - 1; x += randi(6, 12)) if (h3(x, k, s + 1) < .3) line(g, x, y + 1, fz, x + randi(-1, 1), y, fz + 2, shadeC(RUST[k % 4], .75));
    y += th; k++;
  }
  // 뒤쪽 서 있는 벽 (위가 들쭉날쭉) → 2m 넘는 윤곽
  for (let x = P; x < P + c.W; x++) {
    const hh = Math.floor(3 + vnoise(x * .1, 1, s) * 9);
    for (let yy = c.H; yy < c.H + hh; yy++) for (let z = P; z < P + 4; z++) g.set(x, yy, z, (x - P) % 15 === 0 ? shadeC(CONCRETE[1], .7) : rustStreak(CONCRETE[(x >> 3) % 4], x, yy, c.H + hh, s));
    if (x % 3 === 0 && hh > 5) for (let yy = c.H + hh; yy < c.H + hh + randi(1, 4); yy++) g.set(x, yy, P + 2, RUST[yy % 4]);
  }
  vines(g, c, fz + 1);
  vines(g, { ...c, H: c.H + 8 }, P + 4);
}

// ---- 사막·항구: 컨테이너 줄 (깨끗한 주름 지붕, 녹은 흘러내린 줄만) + 군데군데 위에 한 칸 더 (뒤로 물려 쌓음)
const CONTC = { snow: [0x7a3e34, 0x3e5a58, 0x6a4a32, 0x4a5058], desert: [0x7a5a40, 0x5e625c, 0x806a3a, 0x4e5a58] };
function containerBox(g, x0, len, y0, hgt, z0, z1, base, s, endDoors) {
  const dark = shadeC(base, .66);
  for (let x = x0; x < x0 + len; x++) for (let y = y0; y < y0 + hgt; y++) for (let z = z0; z <= z1; z++) {
    const lx = x - x0, ly = y - y0;
    let col = base;
    if (lx < 2 || lx >= len - 2 || ly < 2 || ly >= hgt - 1) col = dark;           // 모서리 기둥·위아래 테
    else if (ly === hgt - 1) col = lx % 4 < 2 ? base : shadeC(base, .86);         // 지붕 골 (규칙적)
    if (ly === hgt - 1 && !(lx < 2 || lx >= len - 2)) col = lx % 4 < 2 ? shadeC(base, 1.04) : shadeC(base, .88);
    if (z === z1 && ly >= 2 && ly < hgt - 1 && lx >= 2 && lx < len - 2) col = rustStreak(lx % 4 < 2 ? base : shadeC(base, .84), lx, ly, hgt - 1, s);
    if (ly === 2 || ly === 3) col = mixC(col, RUST[lx % 4], .3);
    g.set(x, y, z, col);
  }
  for (let x = x0 + 2; x < x0 + len - 2; x++) if ((x - x0) % 4 >= 2) for (let y = y0 + 2; y < y0 + hgt - 1; y++) g.set(x, y, z1, -1);   // 앞면 주름 골 (한 칸 들어감)
  for (let x = x0 + 4; x < x0 + Math.min(len - 4, 13); x++) if (h3(x, 1, s) < .55) g.set(x, y0 + hgt - 4, z1 - ((x - x0) % 4 >= 2 ? 1 : 0), mixC(base, 0xc8c0b0, .55));   // 바랜 글씨
  if (endDoors) for (const zz of [z0 + 3, z0 + 7, z1 - 7, z1 - 3]) for (let y = y0 + 2; y < y0 + hgt - 1; y++) g.set(x0 + len, y, zz, y % 5 === 0 ? 0x5a564e : 0x8a8478);
}
function pContainers(g, c) {
  const s = c.seed, fz = FRONT(c), PAL = CONTC[c.biome] ?? CONTC.desert;
  let x = P, i = 0;
  while (x < P + c.W) {
    let len = Math.min(P + c.W - x, randi(42, 60));
    if (P + c.W - x - len < 30) len = P + c.W - x;
    const base = PAL[(i + s) % PAL.length];
    containerBox(g, x, len, 0, c.H, P, fz, base, s + i, x + len >= P + c.W);
    if (h3(i, 3, s) < .55 && len > 30) containerBox(g, x + randi(2, 6), len - randi(8, 14), c.H, c.H, P, P + 19, PAL[(i + s + 1) % PAL.length], s + i + 7, false);   // 위 칸
    x += len; i++;
  }
}

// ================================================================ 1m 바리케이드 줄
// ---- 저지 방벽: 높이 0.8m, 넓은 아래, 바랜 빨강·흰 줄무늬
function pJersey(g, c) {
  const s = c.seed, long = c.long, thin = long === 'z' ? c.W : c.D, len = long === 'z' ? c.D : c.W, HV = 8;
  const half = h => h < 2 ? thin / 2 : h < 5 ? thin / 2 - (h - 1) * .6 : thin / 2 - 2.6;
  const stripes = c.biome === 'city' || c.biome === 'plains';
  for (let t = 0; t < thin; t++) for (let y = 0; y < HV; y++) for (let l = 0; l < len; l++) {
    if (Math.abs(t + .5 - thin / 2) > half(y)) continue;
    let col = (l >> 3) % 2 ? CONCRETE[0] : CONCRETE[3];
    if (stripes && y >= 3 && ((l + y) % 12) < 6) col = mixC(col, 0x9a4a3a, .6);
    else if (stripes && y >= 3) col = mixC(col, 0xc8c0b0, .3);
    if (y < 2) col = shadeC(col, .8);
    if (l % 30 === 29 || l % 30 === 0) col = shadeC(col, .6);
    const x = long === 'z' ? P + t : P + l, z = long === 'z' ? P + l : P + t;
    g.set(x, y, z, col);
  }
}
// ---- 초원: 시멘트 블록 담 (윗단이 군데군데 무너짐)
function pBlockwall(g, c) {
  const s = c.seed, long = c.long, M = 0x6a665e;
  const brk = (u) => { const n = vnoise(u * .15, 0, s); return n > .58 ? Math.floor((n - .58) * 16) : 0; };
  fillIn(g, c, (x, y, z) => {
    const u = long === 'z' ? z : x;
    if (y >= c.H - brk(u)) return -1;
    const row = (y / 2) | 0;
    if (y % 2 === 1 && y < c.H - 1) return M;
    if ((u + (row & 1) * 2) % 4 === 3) return M;
    return CONCRETE[(h3(((u + (row & 1) * 2) / 4) | 0, row, s) * 4) | 0];
  });
  for (let u = 1; u < (long === 'z' ? c.D : c.W) - 1; u += 4) {
    const b = brk(u + P); if (b < 2) continue;
    const x = long === 'z' ? P + 4 : P + u, z = long === 'z' ? P + u : P + 4;
    for (let y = c.H - b; y < c.H - 1; y++) g.set(x, y, z, RUST[y % 4]);
  }
}
// ---- 사막·항구: 쓰러진 큰 관 (매끈한 플랜지, 받침 쪽에 모래/눈 더미)
function pPipe(g, c) {
  const s = c.seed, long = c.long, len = long === 'z' ? c.D : c.W, thin = long === 'z' ? c.W : c.D;
  const r = thin / 2, mid = P + thin / 2, paint = c.biome === 'snow' ? 0x4a5a58 : 0x6a6252;
  cyl(g, long, mid, c.H / 2, r, P, P + len - 1, (x, y, z, t) => {
    const l = t - P;
    let col = y < 3 ? RUST[2] : (l >> 4) % 3 === 0 ? RUST[1] : mixC(paint, RUST[1], y < 5 ? .5 : .15);   // 위는 남은 페인트, 아래로 녹
    if (y >= c.H - 1) col = shadeC(col, 1.1);
    return col;
  });
  for (let l = 0; l < len; l += 30) cyl(g, long, mid, c.H / 2, r + 1, P + l, P + l + 1, shadeC(RUST[2], .8));   // 플랜지
  const fillC = c.biome === 'snow' ? SNOWC : SAND;
  for (let l = 0; l < len; l++) for (let t = -P; t < thin + P; t++) for (let y = 0; y < 3; y++) {
    const x = long === 'z' ? P + t : P + l, z = long === 'z' ? P + l : P + t;
    if (g.get(x, y, z) >= 0) continue;
    const dEdge = t < 0 ? -t : t >= thin ? t - thin + 1 : 0;
    if (y < 3 - dEdge && vnoise(l * .2, t, s + 1) > .25) g.set(x, y, z, fillC[(l + y) % 3]);
  }
}
// ---- 사막: 경고 줄무늬 콘크리트 블록
function pHazard(g, c) {
  const s = c.seed, long = c.long;
  fillIn(g, c, (x, y, z) => {
    const l = long === 'z' ? z - P : x - P;
    let col = (l >> 4) % 2 ? CONCRETE[0] : CONCRETE[3];
    if (y >= 3 && y <= 7) col = ((l + y) % 8 < 4) ? 0xa89040 : 0x262422;
    if (l % 18 === 17) col = shadeC(col, .6);
    if (y >= 3 && y <= 7 && vnoise(l * .3, y * .3, s + 4) > .72) col = CONCRETE[2];   // 벗겨진 페인트
    return col;
  });
}
// ---- 항구: 팔레트 더미 (바리케이드 한 칸씩)
function pPallets(g, c) {
  const s = c.seed;
  for (let y = 0; y < c.H; y++) {
    const deck = y % 2 === 1, col = WOOD[((y >> 1) + s) % 4];
    for (let x = P; x < P + c.W; x++) for (let z = P; z < P + c.D; z++) {
      const lx = (x - P) % 10, lz = (z - P) % 10, edge = x === P || x === P + c.W - 1 || z === P || z === P + c.D - 1;
      if (deck) { if (lz % 3 !== 2 || lx === 0 || lx === 9) g.set(x, y, z, lz % 3 === 2 ? shadeC(col, .8) : col); }
      else if (lx <= 1 || lx >= 8 || (lx >= 4 && lx <= 5)) g.set(x, y, z, shadeC(col, .85));
      else if (!edge) g.set(x, y, z, shadeC(col, .45));
    }
  }
}

// ================================================================ 1m 발판 (올라설 수 있음)
// ---- 도시: 대형 쓰레기 컨테이너 (뚜껑 닫힘, 평평하고 밝은 윗면)
function pDumpster(g, c) {
  const s = c.seed, fz = FRONT(c), B = pick([0x4a5e44, 0x3e4e5a, 0x5a5444]);
  fillIn(g, c, (x, y, z) => {
    const lx = x - P;
    if (y === c.H - 1) return (x - P) === (c.W >> 1) ? shadeC(B, .6) : shadeC(B, 1.18);   // 뚜껑 (두 쪽)
    let col = (z === fz || z === P) && lx % 5 === 0 ? shadeC(B, 1.1) : B;              // 세로 갈비
    if (y < 2) col = mixC(col, RUST[lx % 4], .5);
    return rustStreak(col, lx + z, y, c.H - 2, s);
  });
  for (const x of [P - 1, P + c.W]) for (let y = 3; y < 6; y++) for (let z = P + 4; z < fz - 3; z++) g.set(x, y, z, 0x222220);   // 들어 올리는 홈
  for (let x = P + 4; x < P + 12; x++) if (h3(x, 2, s) < .6) g.set(x, 6, fz + 1, 0xa8a898);   // 바랜 글씨
}
// ---- 콘크리트 판 덩어리 (윗면은 밝고 매끈, 옆면에 철근 끝)
function pSlabTop(g, c) {
  const s = c.seed, fz = FRONT(c);
  fillIn(g, c, (x, y, z) => {
    if (y === c.H - 1) return (h3(x, z, s) < .04 || (x - P + z * 2) % 37 === 0) ? 0x7e7a72 : 0x96928a;   // 윗면 (조금 밝게) + 가는 금
    if (y === c.H - 2) return 0x7a766e;
    return (y >> 2) % 2 ? 0x86827a : 0x7a766e;
  });
  for (const [x, z] of [[P, P], [P + c.W - 1, P], [P, fz], [P + c.W - 1, fz]]) { g.set(x, c.H - 1, z, -1); g.set(x, c.H - 2, z, -1); }
  for (let x = P + 3; x < P + c.W - 2; x += 5) if (h3(x, 5, s) < .35) g.set(x, 5, fz + 1, shadeC(RUST[2], .7));   // 끊긴 철근 끝 (드문드문)
}
// ---- 사막·항구: 팔레트 위 시멘트 포대 짐 (랩으로 감쌈) / 항구는 방수포를 덮음
function pSkids(g, c) {
  const s = c.seed, fz = FRONT(c), snow = c.biome === 'snow', SACK = [0xb0a890, 0xa49c84, 0xb8b098], TARP = 0x4e5662;
  for (let x = P; x < P + c.W; x++) for (let z = P; z <= fz; z++) {
    const lx = (x - P) % 10, lz = (z - P) % 10;
    if (lx <= 1 || lx >= 8 || lx === 4 || lx === 5) g.set(x, 0, z, WOOD[2]);
    if (lz % 3 !== 2) g.set(x, 1, z, WOOD[1]);
  }
  box(g, P, 2, P, P + c.W - 1, c.H - 1, fz, (x, y, z) => {
    const row = ((y - 2) / 2) | 0, u = U(x, z) + (row & 1) * 3;
    if (snow) return y >= c.H - 3 || z === fz || x === P || x === P + c.W - 1 ? ((x + y) % 7 === 0 ? shadeC(TARP, .8) : TARP) : 0x3a3e44;
    let col = SACK[((u / 6) | 0) % 3];
    if (u % 6 === 5 || y % 2 === 1 && y < c.H - 1) col = shadeC(col, .8);
    if ((z === fz || x === P || x === P + c.W - 1) && U(x, z) % 7 === 0) col = mixC(col, 0xd0d0c8, .5);   // 랩 반사
    return col;
  });
}

// ================================================================ 바이옴 마감: 눈·모래는 가장자리·바닥에 쌓인 더미로만
function weather(g, c, kind) {
  const s = c.seed, fz = FRONT(c);
  if (c.biome === 'snow') {
    // 윗면: 앞쪽 가장자리와 모서리 근처만 눈 (불규칙)
    for (let x = 0; x < g.w; x++) for (let z = 0; z < g.d; z++) {
      let y = g.h - 1; while (y >= 0 && g.get(x, y, z) < 0) y--;
      if (y < 1) continue;
      const edgeD = Math.min(x - P, P + c.W - 1 - x, z - P, fz - z);
      if (edgeD < .5 + vnoise(x * .3, z * .3, s) * 2.5 || (y >= c.H && vnoise(x * .25, z * .25, s + 4) > .7)) g.set(x, y, z, SNOWC[(x + z) % 3]);
    }
    if (kind !== 'plat') for (let x = P; x < P + c.W; x++) if (h3(x, 7, s) < .22) { const n = randi(1, 3); for (let k = 1; k <= n; k++) if (g.get(x, c.H - 1 - k, fz + 1) < 0) g.set(x, c.H - 1 - k, fz + 1, 0xa8b6bc); }   // 고드름
    drift(g, c, SNOWC, 3);
  } else if (c.biome === 'desert') {
    drift(g, c, SAND, kind === 'wall' ? 5 : 3);
    for (let x = 0; x < g.w; x++) for (let z = 0; z < g.d; z++) {   // 윗면 모서리에만 모래 조금
      let y = g.h - 1; while (y >= 0 && g.get(x, y, z) < 0) y--;
      if (y > 0 && Math.min(x - P, P + c.W - 1 - x, z - P) < 2 && h3(x, z, s) < .4) g.set(x, y, z, SAND[(x + z) % 3]);
    }
  } else if (c.biome === 'plains') {
    for (let x = 0; x < g.w; x++) for (let z = 0; z < g.d; z++) {
      if (IN(c, x, 0, z) || g.get(x, 0, z) >= 0 || h3(x, z, s) > .32) continue;
      const hgt = randi(2, 6), col = pick(BLADE), lean = h3(x, z, s + 2) < .5 ? 1 : 0;   // 가는 풀잎 (살짝 기울어짐)
      for (let y = 0; y < hgt; y++) g.set(x + (y > hgt * .6 ? lean : 0), y, z, y === hgt - 1 ? shadeC(col, 1.12) : col);
    }
  } else {
    for (let x = 0; x < g.w; x++) for (let z = 0; z < g.d; z++) if (!IN(c, x, 0, z) && g.get(x, 0, z) < 0 && h3(x, z, s + 3) < .08) g.set(x, 0, z, pick([0x3a3836, 0x8a8070, 0x5e4a40]));
  }
}
// 물건 밑동에 쌓인 더미 (앞·옆 여백, 바깥으로 낮아짐)
function drift(g, c, cols, hmax) {
  const s = c.seed;
  for (let x = 0; x < g.w; x++) for (let z = 0; z < g.d; z++) {
    if (IN(c, x, 0, z)) continue;
    const d = Math.max(P - x, x - (P + c.W - 1), P - z, z - (P + c.D - 1), 0);
    const hh = Math.floor((hmax - d * 1.6) * (.5 + vnoise(x * .2, z * .2, s + 5) * .7));
    for (let y = 0; y < hh; y++) if (g.get(x, y, z) < 0) g.set(x, y, z, cols[(x + z + y) % cols.length]);
  }
  // 앞면 아래쪽에 기대어 쌓임
  for (let x = P; x < P + c.W; x++) { const hh = Math.floor(vnoise(x * .15, 3, s) * hmax); for (let y = 0; y < hh; y++) for (let k = 1; k <= Math.max(1, hh - y); k++) if (g.get(x, y, P + c.D - 1 + k) < 0) g.set(x, y, P + c.D - 1 + k, cols[(x + y) % cols.length]); }
}
// 덩굴: 앞면(z = fz) 위에서 아래로 늘어짐 (초원)
function vines(g, c, fz) {
  const s = c.seed, VC = [0x5a5e3a, 0x6a6a40, 0x4a5032, 0x767448];
  for (let x = 0; x < g.w; x++) {
    if (vnoise(x * .2, 0, s + 11) < .5 || h3(x, 0, s) < .3) continue;
    let topY = Math.min(g.h - 1, c.H - 1); while (topY > 0 && g.get(x, topY, fz - 1) < 0) topY--;
    const len = randi(3, Math.min(16, c.H));
    for (let k = 0; k < len; k++) { const y = topY - k; if (y < 0) break; if (g.get(x, y, fz) < 0) g.set(x, y, fz, VC[(x + k) % 4]); }
  }
}

// ================================================================ 라운드 3: 개성 있는 1m 발판
// 차 모델(env_models.js)을 0.045m 복셀로 칠한 뒤 높이를 눌러(squash) 잘라 씀 — 주차된 차와 같은 품질
const SV = 0.045;
function carGrid(idx, wreck, squash, x0 = 0, x1 = 88) {
  const src = new VoxGrid(88, 33, 40); paintCar(src, idx, wreck);
  const H = Math.ceil(33 * squash), g = new VoxGrid(x1 - x0, H, 40);
  for (let x = x0; x < x1; x++) for (let y = 0; y < H; y++) for (let z = 0; z < 40; z++) {
    const c = src.get(x, Math.min(32, Math.floor(y / squash)), z);
    if (c >= 0) g.set(x - x0, y, z, wreck ? c : (h3(x, y, z) < .25 ? mixC(c, RUST[(x >> 3) % 4], .5) : c));
  }
  return g;
}
// 도시: 넘어진 실외기 (회색 함체, 옆 루버, 위 큰 팬)
function pACUnit(g, c) {
  const s = c.seed, fz = FRONT(c), B = 0x8a8678, cx = P + c.W / 2, cz = P + c.D / 2;
  fillIn(g, c, (x, y, z) => {
    const lx = x - P, lz = z - P, edge = lx < 1 || lx >= c.W - 1 || lz < 1 || lz >= c.D - 1;
    if (y === c.H - 1) { const d = Math.hypot(x + .5 - cx, z + .5 - cz); if (d < 7.5) return d > 6.5 ? 0x4e4c48 : ((Math.round(Math.atan2(z - cz, x - cx) * 2.5) & 1) ? 0x2a2a28 : 0x1a1a18); return edge ? shadeC(B, .75) : shadeC(B, .92); }
    if (edge) return shadeC(B, .75);
    if (y >= 2 && y <= 7 && y % 2 === 0) return 0x4e4c48;            // 루버
    return y < 2 ? mixC(B, RUST[lx % 4], .4) : B;
  });
  for (let x = P + 3; x < P + 9; x++) if (h3(x, 3, s) < .6) g.set(x, 8, fz + 1, 0x5a5a56);   // 이름판
}
// 도시: 묶어 둔 저지 방벽 2개 (공사장 자재)
function pJerseyBundle(g, c) {
  for (let k = 0; k < 2; k++) for (let t = 0; t < 10; t++) for (let y = 0; y < 9; y++) for (let z = P; z < P + c.D; z++) {
    const half = y < 2 ? 5 : y < 5 ? 5 - (y - 1) * .6 : 2.6;
    if (Math.abs(t + .5 - 5) > half) continue;
    const l = z - P; let col = (l >> 3) % 2 ? CONCRETE[0] : CONCRETE[3];
    if (y >= 3 && ((l + y) % 12) < 6) col = mixC(col, 0x9a4a3a, .55); else if (y >= 3) col = mixC(col, 0xc8c0b0, .25);
    if (y < 2) col = shadeC(col, .8);
    g.set(P + k * 10 + t, y, z, col);
  }
  for (const z of [P + 5, P + c.D - 6]) for (let x = P; x < P + c.W; x++) for (let y = 0; y < 10; y++) if (g.get(x, y, z) >= 0 && (y === 8 || g.get(x, y + 1, z) < 0)) g.set(x, y + (y === 8 ? 1 : 0), z, 0x8a6a3a);   // 묶은 끈
}
// 초원: 쓰러진 벽 덩어리 (들쭉날쭉한 윤곽, 벽돌 단면, 철근)
function pWallChunk(g, c) {
  const s = c.seed, fz = FRONT(c), cut = (x, z) => vnoise(x * .25, z * .25, s) * 5;
  fillIn(g, c, (x, y, z) => {
    const ed = Math.min(x - P, P + c.W - 1 - x, z - P, fz - z);
    if (ed < cut(x, z) - 2 && y > 2) return -1;                         // 깨진 윤곽
    if (y === c.H - 1) return h3(x, z, s) < .1 ? 0x6a665e : vnoise(x * .3, z * .3, s + 2) > .66 ? 0x6a6648 : 0x7e7a72;   // 윗면 (이끼)
    return y % 4 === 3 ? 0x6a665e : (((x + z) >> 2) + (y >> 2)) % 2 ? 0x7a6a5a : 0x76726a;   // 벽돌·콘크리트 층
  });
  for (let i = 0; i < 4; i++) { const x = P + randi(2, c.W - 3), z = P + randi(2, c.D - 3); line(g, x, c.H - 3, z, x + randi(-3, 3), c.H + randi(1, 3), z + randi(-3, 3), RUST[i]); }
}
// 초원: 철근이 삐져나온 잔해 무덤
function pMound(g, c) {
  const s = c.seed, cx = P + c.W / 2, cz = P + c.D / 2, COL = [0x7a766e, 0x6e6a62, 0x6e4a3a, 0x86827a, 0x5e5a54];
  for (let x = P - 1; x <= P + c.W; x++) for (let z = P - 1; z <= P + c.D; z++) {
    const d = Math.hypot((x + .5 - cx) / (c.W / 2), (z + .5 - cz) / (c.D / 2));
    const hh = Math.min(c.H, Math.floor(c.H * 1.35 * (1 - d * d * .55) + (vnoise(x * .4, z * .4, s) - .5) * 4));
    for (let y = 0; y < hh; y++) g.set(x, y, z, COL[(((x >> 1) * 3 + (z >> 1) * 5 + (y >> 1)) % 5)]);
  }
  for (let i = 0; i < 6; i++) { const x = P + randi(3, c.W - 4), z = P + randi(3, c.D - 4); line(g, x, c.H - 3, z, x + randi(-5, 5), c.H + randi(0, 3), z + randi(-4, 4), RUST[i % 4]); }
}
// 초원: 넘어진 콘크리트 화분 (흙이 앞으로 쏟아지고 마른 가지)
function pPlanter(g, c) {
  const s = c.seed, fz = FRONT(c);
  fillIn(g, c, (x, y, z) => {
    const lx = x - P, inner = lx > 1 && lx < c.W - 2 && y > 1 && y < c.H - 2;
    if (inner && z > fz - 8) return z === fz - 7 ? 0x3e3428 : -1;      // 앞으로 열린 입구 (옆으로 넘어짐)
    return y === c.H - 1 ? 0x7e7a72 : ((lx + y) % 9 === 0 ? 0x6a665e : 0x76726a);
  });
  for (let x = P + 2; x < P + c.W - 2; x++) for (let z = fz - 6; z <= fz + 2; z++) { const hh = Math.floor(3 - Math.max(0, z - fz) * 1 + vnoise(x * .3, z * .3, s) * 2); for (let y = 2; y < 2 + hh; y++) g.set(x, z > fz ? y - 2 : y, z, (x + y) % 3 ? 0x4a3e30 : 0x56483a); }
  for (let i = 0; i < 4; i++) { const x = P + randi(4, c.W - 5); line(g, x, 4, fz - 2, x + randi(-4, 4), randi(5, 8), fz + 2, 0x4e4034); }
}
// 항구: 눈 덮인 계류 함 / 해치 덮개 (어두운 쇠, 테두리, 손잡이)
function pHatch(g, c) {
  const s = c.seed, B = 0x3e4448;
  fillIn(g, c, (x, y, z) => {
    const lx = x - P, lz = z - P, rim = lx < 2 || lx >= c.W - 2 || lz < 2 || lz >= c.D - 2;
    if (y === c.H - 1) return rim ? shadeC(B, 1.15) : vnoise(x * .25, z * .25, s) > .3 ? SNOWC[(x + z) % 3] : 0x4a5054;
    if (y === c.H - 2 && !rim) return shadeC(B, .7);
    return y < 3 ? mixC(B, RUST[lx % 4], .35) : (lx % 6 === 0 ? shadeC(B, .85) : B);
  });
  for (const hx of [P + 5, P + c.W - 6]) { g.set(hx, c.H, P + c.D / 2, 0x7a7a74); g.set(hx + 1, c.H, P + c.D / 2, 0x7a7a74); }   // 손잡이
  for (let x = P + 3; x < P + 10; x++) g.set(x, 5, FRONT(c) + 1, 0x8a7a44);   // 바랜 노란 표시
}

const PAINT = { facade: pFacade, hoarding: pHoarding, carstack: pCarStack, bus: pBus, slabruin: pSlabRuin, containers: pContainers,
  jersey: pJersey, acunit: pACUnit, jerseys: pJerseyBundle, wallchunk: pWallChunk, mound: pMound, planter: pPlanter, hatch: pHatch, blockwall: pBlockwall, pipe: pPipe, hazard: pHazard, pallets: pPallets, dumpster: pDumpster, slabtop: pSlabTop, skids: pSkids };
// 벽 구간 하나 = 한 종류, 바리케이드 줄 하나 = 한 종류
const KINDS = {
  city:   { wall: ['facade', 'hoarding', 'carstack'], barrier: ['jersey'], plat: ['dumpster', 'acunit', 'jerseys', 'dumpster'] },
  plains: { wall: ['slabruin'], barrier: ['blockwall', 'jersey'], plat: ['carhull', 'wallchunk', 'mound', 'planter'] },
  desert: { wall: ['containers'], barrier: ['pipe', 'hazard'], plat: ['skids', 'slabtop'] },
  snow:   { wall: ['containers'], barrier: ['pallets', 'pipe'], plat: ['hatch', 'skids'] },
};

function paintPiece(ch, kind, biome, x, z, w, d, h, long, seed, type) {
  const c = { W: w * 10, H: h * 10, D: d * 10, seed, biome, long };
  const g = grid(c.W + 2 * P + 1, c.H + (kind === 'containers' ? 21 : h === 2 ? CROWN : 4), c.D + 2 * P);
  PAINT[kind](g, c);
  weather(g, c, type);
  ch.add(g, S, x - P * S, 0, z - P * S, { seed });
}

// 바리케이드 줄 끝: 꼬깔·통행금지 판 (도시·사막·항구) / 초원은 잔해
function rowEnds(ch, biome, x, z0, z1, seed) {
  const cone = (cx, cz, k) => {
    const g = grid(8, 9, 8);
    for (let y = 0; y < 9; y++) { const r = y === 0 ? 3.9 : 3 - y * .3; cyl(g, 'y', 4, 4, r, y, y, y === 0 ? 0x2a2826 : (y === 4 || y === 5) ? 0xc8c4b8 : biome === 'snow' && y === 8 ? SNOWC[0] : 0xa8643a); }
    ch.add(g, S, cx - .4, 0, cz - .4, { seed: seed + k });
  };
  if (biome === 'plains') {
    for (const cz of [z0 - .5, z1 + .3]) { const g = grid(9, 4, 6); for (let xx = 0; xx < 9; xx++) for (let zz = 0; zz < 6; zz++) { const hh = Math.floor(4 - Math.hypot(xx - 4, zz - 3) * .8); for (let y = 0; y < hh; y++) g.set(xx, y, zz, CONCRETE[(xx + zz + y) % 4]); } ch.add(g, S, x - .1, 0, cz - .3, { seed }); }
    return;
  }
  cone(x + .3, z1 + .35, 1); cone(x + .85, z1 + .6, 2); cone(x + .5, z0 - .5, 3);
  if (biome === 'city') {   // 줄무늬 통행금지 판 (다리 둘)
    const g = grid(14, 11, 3);
    for (let xx = 0; xx < 14; xx++) for (let y = 6; y < 10; y++) g.set(xx, y, 1, ((xx + y) >> 1) % 2 ? 0xa8643a : 0xc8c4b8);
    for (const xx of [1, 12]) for (let y = 0; y < 10; y++) g.set(xx, y, 0, 0x4a4844);
    ch.add(g, S, x - .2, 0, z0 - 1.0, { seed });
  }
}

// ---------------------------------------------------------------- 낭떠러지 가장자리: 깨진 단면·철근·뿌리·모래 줄기·고드름
const EDGE = {
  city:   { chunk: [0x3a3836, 0x5e5a54], hang: RUST, hangLen: [2, 5], hangK: .35, rebar: true, rub: [0x46423e, 0x6e6a64, 0x5a3a30] },
  plains: { chunk: [0x5e4a38, 0x4e3e30], hang: [0x5a4632, 0x6a5a3a, 0x4a3a28, 0x6a6a40], hangLen: [3, 9], hangK: .5, rebar: false, rub: [0x6e6a62, 0x5e4a38, 0x7a766c] },
  desert: { chunk: [0x8a8274, 0x9a8460], hang: SAND, hangLen: [4, 14], hangK: .35, rebar: false, rub: SAND },
  snow:   { chunk: [0x5a5854, 0x4e4c48], hang: [0xa8b6bc, 0x9cacb4, 0xb4c0c4], hangLen: [2, 6], hangK: .55, rebar: true, rub: [0x5e5c58, 0xb4b9bc] },
};
function pitEdges(ch, st, biome) {
  const E = EDGE[biome], isPit = (x, z) => st.heightAt(x + .5, z + .5) === PIT;
  for (let x = -2; x < st.L + 2; x++) for (let z = -5; z <= 7; z++) {
    if (isPit(x, z)) {
      // 안쪽 모서리(움푹 들어간 칸)를 잔해로 메워 계단 모양을 누그러뜨림 (판정은 그대로)
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        if (isPit(x + dx, z) || isPit(x, z + dz) || st.heightAt(x + dx + .5, z + .5) !== 0 || st.heightAt(x + .5, z + dz + .5) !== 0) continue;
        const g = grid(10, 9, 10), cx = dx < 0 ? 0 : 9, cz = dz < 0 ? 0 : 9;
        for (let u = 0; u < 10; u++) for (let v = 0; v < 10; v++) { const d = Math.hypot(u - cx, v - cz), hh = Math.floor(8 - d * 1.6 + vnoise(u * .5, v * .5, x + z) * 2); for (let y = 0; y < hh; y++) g.set(u, y, v, E.rub[(u + v + y) % E.rub.length]); }
        ch.add(g, S, x, -1.15, z, { seed: x * 7 + z });
      }
      continue;
    }
    if (st.heightAt(x + .5, z + .5) !== 0) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!isPit(x + dx, z + dz)) continue;
      const g = grid(dx ? 4 : 10, 14, dx ? 10 : 4), seed = x * 31 + z * 7 + dx * 3 + dz;
      const out = (u, k) => dx > 0 ? [k, u] : dx < 0 ? [3 - k, u] : dz > 0 ? [u, k] : [u, 3 - k];   // u: 가장자리 따라, k: 바깥으로
      for (let u = 0; u < 10; u++) {
        const n = vnoise(u * .35, x + z, seed), ledge = 1 + Math.floor(n * 2.6);
        for (let y = 3; y < 7 + Math.floor(n * 4); y++) for (let k = 0; k < ledge - (y > 8 ? 1 : 0); k++) { const [a, b] = out(u, k); g.set(a, 13 - y, b, E.chunk[(y > 5 ? 1 : 0)]); }
        if (h3(u, x, z + seed) < E.hangK) { const len = randi(E.hangLen[0], E.hangLen[1]); const k = Math.min(3, ledge); for (let y = 0; y < len; y++) { const [a, b] = out(u, k); g.set(a, 13 - 6 - y, b, E.hang[(u + y) % E.hang.length]); } }
      }
      if (E.rebar) for (let u = 1 + randi(0, 3); u < 10; u += randi(4, 9)) if (h3(u, x, z) < .5) { const yy = 13 - randi(3, 5); for (let k = 0; k < 4; k++) { const [a, b] = out(u, k); g.set(a, yy - (k >> 1), b, RUST[k]); } }
      if (biome === 'city' && h3(x, z, dx + dz * 3) < .1) for (let k = 0; k < 4; k++) { const [a, b] = out(5, k); for (const [da, db] of [[0, 0], [1, 0], [0, 1], [1, 1]]) g.set(Math.min(g.w - 1, a + (dx ? 0 : da)), 2 + db, Math.min(g.d - 1, b + (dx ? da : 0)), 0x4a4440); }   // 끊긴 하수관
      const ox = dx > 0 ? x + 1 : dx < 0 ? x - 0.4 : x, oz = dz > 0 ? z + 1 : dz < 0 ? z - 0.4 : z;
      ch.add(g, S, ox, -1.4, oz, { seed });
    }
  }
}
// 낭떠러지 바닥 쪽: 사막은 흘러내린 모래 무덤, 초원은 흙·돌 (어둠 속에 희미하게)
function pitFloor(ch, st, biome) {
  if (biome !== 'desert' && biome !== 'plains') return;
  const cols = biome === 'desert' ? SAND : [0x4e3e30, 0x5e5a54, 0x3e3428];
  for (let x = -2; x < st.L + 2; x++) for (let z = -5; z <= 7; z++) {
    if (st.heightAt(x + .5, z + .5) !== PIT || h3(x, z, 5) > .5) continue;
    const g = grid(10, 6, 10);
    for (let u = 0; u < 10; u++) for (let v = 0; v < 10; v++) { const hh = Math.floor(6 - Math.hypot(u - 4.5, v - 4.5) * 1.1 + vnoise(u * .4, v * .4, x) * 2); for (let y = 0; y < hh; y++) g.set(u, y, v, cols[(u + v + y) % 3]); }
    ch.add(g, S, x, -3.4, z, { seed: x + z });
  }
}

// ---------------------------------------------------------------- 외나무 다리: 다리 밑이 비어 보이게 상판 아래 보·교각·난간
function bridges(ch, st, biome) {
  const isPit = (x, z) => st.heightAt(x + .5, z + .5) === PIT;
  for (const sg of st.segments) {
    if (sg.type !== 'bridge') continue;
    const len = (sg.b - sg.a) * 10, timber = biome === 'snow', steel = biome === 'desert';
    const BEAM = timber ? 0x4e3e2e : steel ? RUST[1] : 0x7e7a72, PIER = timber ? 0x3e3226 : steel ? RUST[2] : 0x86827a;
    for (const [zEdge, dir] of [[3, 1], [-3, -1]]) {
      // 가장자리 보 (상판 아래, 낭떠러지 쪽으로 0.3m)
      const g = grid(len, 14, 4), oz = dir > 0 ? zEdge : zEdge - .4;
      for (let x = 0; x < len; x++) for (let y = 0; y < 14; y++) for (let k = 0; k < 4; k++) {
        const kk = dir > 0 ? k : 3 - k;   // 0 = 상판 쪽
        const rail = y >= 9;               // 난간 (상판보다 0.5m 위까지)
        if (!rail && kk < 3 && y >= 1 && y <= 7) g.set(x, y, k, (y === 1 || y === 7) ? shadeC(BEAM, .8) : BEAM);
        if (rail && kk === 1) {
          if (timber) { if (x % 15 === 0 || y === 13) g.set(x, y, k, y === 13 ? 0x8a7652 : 0x4e3e2e); }
          else if (steel) { if (x % 10 === 0 || y === 13 || y === 11) g.set(x, y, k, (x + y) % 9 ? RUST[(x >> 2) % 4] : 0x8a7a44); }
          else { if (y <= 12 && (x % 20 < 3 || y <= 10)) g.set(x, y, k, x % 20 < 3 ? CONCRETE[1] : CONCRETE[(x >> 4) % 4]); if (y === 13) g.set(x, y, k, RUST[(x >> 3) % 4]); }   // 콘크리트 난간 + 녹슨 손잡이 쇠
        }
      }
      for (let x = 0; x < len; x++) if (vnoise(x * .08, zEdge, sg.a + 3) < (timber || steel ? .3 : .18)) for (let y = 9; y < 14; y++) for (let k = 0; k < 4; k++) g.set(x, y, k, -1);   // 난간이 끊긴 곳
      ch.add(g, S, sg.a, -1.0, oz, { seed: sg.a });
    }
    // 교각: 상판 아래로 깊이 내려감 (항구는 나무 말뚝이 물속으로)
    for (let x = sg.a + 2; x < sg.b - 1; x += timber ? 3 : 6) {
      const H = 60, g = grid(10, H, 64);
      for (const zz of timber ? [2, 30, 58] : [6, 54]) cyl(g, 'y', 5, zz + 2, timber ? 2.2 : 3.4, 0, H - 1, (xx, y) => y % 12 === 0 ? shadeC(PIER, .8) : PIER);
      if (!timber) for (let y = 4; y < H; y += 14) line(g, 5, y, 8, 5, y + 12, 54, shadeC(PIER, .85), 0), line(g, 5, y + 12, 8, 5, y, 54, shadeC(PIER, .85), 0);
      ch.add(g, S, x - .5, -1.0 - H * S, -3.0, { seed: x });
    }
  }
}

// ---------------------------------------------------------------- 항구: 낭떠러지 아래 얼음 낀 바닷물 (다리 밑 포함)
function pitWater(ch, st, deck) {
  const top = FACES[2], W = rgb(OBSTACLE.water), ICE = [rgb(0x9aa8ae), rgb(0x8a989e), rgb(0xb0bcc0)];
  for (let x = -2; x < st.L + 2; x++) for (let z = -5; z <= 7; z++) {
    if (st.heightAt(x + .5, z + .5) !== PIT && !deck?.has(x + ',' + z)) continue;
    const mb = ch.mb(x, x + 1, z);
    mb.quad(top, x, OBSTACLE.waterY - 1, z, 1, 1, 1, W);
    if (h3(x, z, 77) < .4) { const s = rand(.25, .6), px = x + rand(0, 1 - s), pz = z + rand(0, 1 - s); for (const f of FACES) if (f.n[1] !== -1) mb.quad(f, px, OBSTACLE.waterY - .05, pz, s, .08, s * rand(.6, 1), pick(ICE)); }
  }
}

// 쌓아 놓은 폐차 벽: 진짜 차 모델을 눌러 2단으로 쌓고, 뒤는 고철 더미로 메움 (+ 위에 하나 더)
function carStack(ch, p, seed) {
  const fill = { W: p.w * 10, H: 20, D: p.d * 10, seed, biome: 'city' };
  const g = grid(fill.W + 2 * P, 26, fill.D + 2 * P), SCR = [0x3a3634, 0x4a4440, 0x5a3a2a, 0x2e2c2a];
  box(g, P, 0, P, P + fill.W - 1, 19, P + fill.D - 13, (x, y, z) => SCR[(((x >> 1) + (y >> 1) * 3 + z) % 4)]);   // 뒤쪽 고철
  for (let x = P; x < P + fill.W; x++) for (let z = P; z < P + fill.D - 13; z++) if (h3(x, z, seed) < .3) g.set(x, 20 + (h3(x, z, seed + 1) < .3 ? 1 : 0), z, pick(SCR));
  ch.add(g, S, p.x - P * S, 0, p.z - P * S, { seed, bottom: false });
  const n = Math.max(1, Math.floor(p.w / 4)), off = (p.w - n * 3.96) / 2, zf = p.z + p.d - 1.8;
  for (let tier = 0; tier < 2; tier++) for (let i = 0; i < n; i++) {
    const idx = randi(0, 6), car = carGrid(idx, h3(i, tier, seed) < .3, 0.66);
    ch.add(car, SV, p.x + off + i * 3.96 + (tier ? rand(-.25, .25) : 0), tier * 1.0, zf, { seed: seed + i * 7 + tier });
  }
  if (p.w >= 5) ch.add(carGrid(randi(2, 6), true, 0.5), SV, p.x + rand(0, p.w - 4), 2.0, p.z + .3, { seed: seed + 99 });   // 위에 하나 더 (뒤로)
}
// 초원 발판: 반으로 잘린 녹슨 차체 (풀숲)
function carHull(ch, p, seed) {
  const front = Math.random() < .5, g = carGrid(randi(2, 6), Math.random() < .5, 0.72, front ? 44 : 0, front ? 88 : 44);
  ch.add(g, SV, p.x + (p.w - 1.98) / 2, 0, p.z + (p.d - 1.8) / 2, { seed });
  const gg = grid(24, 7, 24);   // 밑동 풀
  for (let x = 0; x < 24; x++) for (let z = 0; z < 24; z++) { if ((x > 2 && x < 21 && z > 2 && z < 21) || h3(x, z, seed) < .45) continue; const hh = randi(2, 6), col = BLADE[(x + z) % 5]; for (let y = 0; y < hh; y++) gg.set(x + (y > hh * .6 ? (x < 12 ? -1 : 1) : 0), y, z, col); }
  ch.add(gg, S, p.x - .2, 0, p.z - .2, { seed });
}

// ---------------------------------------------------------------- 진입점
// deck: 다리 상판 칸(밑이 비어 있음). 반환: { chunks (핏자국 묻는 장애물), edges (낭떠러지 단면·다리 구조) }
export function buildObstacles(r, st, biome, deck) {
  const K = KINDS[biome] ?? KINDS.city, ch = new Chunks(8), ed = new Chunks(12);
  let seed = 1, lastPlat = null;
  for (const p of rects(st.hmap)) {
    seed += 17;
    if (p.h === 2) {                              // 좁은 골목 벽: 구간 전체가 한 물건
      let kind = pick(K.wall);
      if (biome === 'city' && p.w >= 7 && p.w <= 14 && Math.random() < .35) kind = 'bus';
      if (kind === 'carstack') carStack(ch, p, seed); else paintPiece(ch, kind, biome, p.x, p.z, p.w, p.d, 2, 'x', seed, 'wall');
    } else if (p.w === 1 && p.d >= 4 || p.d === 1 && p.w >= 4) {   // 바리케이드 줄: 줄 하나는 같은 종류
      const kind = pick(K.barrier), long = p.w === 1 ? 'z' : 'x', len = long === 'z' ? p.d : p.w;
      const step = kind === 'pipe' ? len : kind === 'pallets' ? 1 : 3;
      for (let i = 0; i < len; i += step) {
        const n = Math.min(step, len - i);
        if (long === 'z') paintPiece(ch, kind, biome, p.x, p.z + i, 1, n, 1, 'z', seed + i, 'barrier');
        else paintPiece(ch, kind, biome, p.x + i, p.z, n, 1, 1, 'x', seed + i, 'barrier');
      }
      if (long === 'z') rowEnds(ch, biome, p.x, p.z, p.z + p.d, seed);
    } else {                                      // 잔해 더미 (올라설 수 있음)
      let kind; do kind = pick(K.plat); while (kind === lastPlat && new Set(K.plat).size > 1);   // 같은 물건이 줄줄이 반복되지 않게
      lastPlat = kind;
      if (kind === 'carhull') carHull(ch, p, seed); else paintPiece(ch, kind, biome, p.x, p.z, p.w, p.d, p.h, p.w >= p.d ? 'x' : 'z', seed, 'plat');
    }
  }
  pitEdges(ed, st, biome);
  pitFloor(ed, st, biome);
  bridges(ed, st, biome);
  if (biome === 'snow') pitWater(ed, st, deck);
  return { chunks: ch.build(r), edges: ed.build(r) };
}
