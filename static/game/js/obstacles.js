// 지형 장애물(높이 맵의 벽·잔해 더미·바리케이드)과 낭떠러지 가장자리를 바이옴에 맞는 '그럴듯한 물건'으로 그림
// 판정은 그대로 높이 맵 칸(1m)이 정함. 겉모습은 그 칸을 꽉 채우도록 0.1m 복셀로 만든다:
//  - 윗면은 정확히 칸 높이(1 / 2m) → 올라서는 높이와 핏자국 위치가 맞음
//  - 옆면은 칸 경계에 붙임 (덩굴·모래 더미·고드름처럼 장식만 경계 밖 0.2m 여백에)
import { PIT } from './level.js';
import { Chunks, grid, box, cyl, line, h3, vnoise, mixC, shadeC, rgb } from './env.js';
import { FACES } from './voxel.js';
import { OBSTACLE } from './config.js';
import { pick, rand, randi } from './math.js';

const S = 0.1, P = 2;   // 복셀 크기(m), 경계 밖 장식 여백(칸)

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
// 칠하기 함수는 (g, c) 를 받음. c: { W, H, D (안쪽 크기, 복셀), x0=y0=0 안쪽 시작은 P, seed, biome, long:'x'|'z' }
const IN = (c, x, y, z) => x >= P && x < P + c.W && y >= 0 && y < c.H && z >= P && z < P + c.D;
const FRONT = c => P + c.D - 1;        // 카메라 쪽 면 (z가 가장 큰 줄)
// 직육면체 안쪽 전부를 칠함
const fillIn = (g, c, col) => box(g, P, 0, P, P + c.W - 1, c.H - 1, P + c.D - 1, col);
// 면 위 좌표 u (가로): 앞뒤 면은 x, 옆면은 z
const U = (x, z) => x + z;

const CONCRETE = [0x8a867e, 0x7e7a72, 0x94908a, 0x86827a];
const RUST = [0x6e4028, 0x7a4a2e, 0x5e3622, 0x865436];
const WOOD = [0x7a5e40, 0x6e5438, 0x846646, 0x5e4830];

// ---- 벽돌 벽 조각 (도시): 무너진 벽, 위쪽이 들쭉날쭉, 회벽 자국·낙서·그을음
function pBrick(g, c) {
  const BR = [0x7e4636, 0x8a4e3a, 0x6e3e30, 0x965a44, 0x7a4232], MORT = 0x8a7a6a, s = c.seed;
  const top = (x, z) => { const n = vnoise(x * .18, z * .2, s); return n > .55 ? c.H - 1 - Math.floor((n - .55) * 14) : c.H - 1; };
  fillIn(g, c, (x, y, z) => {
    if (y > top(x, z)) return -1;
    const u = U(x, z), row = (y / 3) | 0;
    if (y % 3 === 2) return MORT;
    if ((u + (row & 1) * 3) % 6 === 5) return MORT;
    const id = ((u + (row & 1) * 3) / 6) | 0;
    let col = BR[(h3(id, row, s) * BR.length) | 0];
    if (y < 4) col = shadeC(col, .8);                                         // 아래쪽 때
    if (vnoise(u * .15, y * .15, s + 3) > .72) col = mixC(col, 0xa89a88, .75);  // 남은 회벽
    if (vnoise(u * .2, y * .1, s + 9) > .78) col = shadeC(col, .55);           // 그을음
    return col;
  });
  // 빠진 벽돌 (앞면이 움푹)
  const fz = FRONT(c);
  for (let i = 0; i < c.W * c.H / 40; i++) {
    const x = P + randi(0, c.W - 6), y = randi(0, c.H - 4) - (randi(0, 2) % 3); const row = (y / 3) | 0, y0 = row * 3;
    for (let k = 0; k < 5; k++) for (let j = 0; j < 2; j++) if (g.get(x + k, y0 + j, fz) >= 0 && y0 + j < c.H - 2) g.set(x + k, y0 + j, fz, -1);
  }
  // 바닥에 흩어진 벽돌 조각 (앞 여백)
  for (let x = 0; x < c.W + 2 * P; x++) if (h3(x, 3, s) < .35) g.set(x, 0, fz + 1 + (h3(x, 4, s) < .5 ? 1 : 0), pick(BR));
}

// ---- 모래주머니 벽 (도시)
function pSandbag(g, c) {
  const T = [0x9a8c6a, 0x8a7e5e, 0xa49676, 0x7e7256], s = c.seed;
  fillIn(g, c, (x, y, z) => {
    const u = U(x, z), row = (y / 2) | 0, off = (row & 1) * 3, along = (u + off) % 6;
    const id = ((u + off) / 6) | 0;
    let col = T[(h3(id, row, s) * T.length) | 0];
    if (along === 5) col = shadeC(col, .62);                     // 주머니 사이 이음
    else if (y % 2 === 0) col = shadeC(col, .84);                // 아래쪽 그늘 (둥근 느낌)
    if (y === c.H - 1 && (x + z * 3) % 5 === 4) col = shadeC(col, .7);   // 맨 위 주머니 무늬
    return col;
  });
  // 이음 부분 앞면을 살짝 파서 볼록한 주머니처럼
  const fz = FRONT(c);
  for (let x = P; x < P + c.W; x++) for (let y = 0; y < c.H; y++) { const row = (y / 2) | 0; if ((x + (row & 1) * 3) % 6 === 5 && y % 2 === 1) g.set(x, y, fz, -1); }
}

// ---- 나무 상자 (1m 상자를 쌓음, 가끔 방수포)
function pCrates(g, c) {
  const s = c.seed, FR = 0x4a3826;
  for (let cx = 0; cx < c.W / 10; cx++) for (let cz = 0; cz < c.D / 10; cz++) for (let cy = 0; cy < c.H / 10; cy++) {
    const base = WOOD[(h3(cx, cy, cz + s) * WOOD.length) | 0], x0 = P + cx * 10, z0 = P + cz * 10, y0 = cy * 10;
    box(g, x0, y0, z0, x0 + 9, y0 + 9, z0 + 9, (x, y, z) => {
      const lx = x - x0, ly = y - y0, lz = z - z0;
      const ex = lx === 0 || lx === 9, ey = ly === 0 || ly === 9, ez = lz === 0 || lz === 9;
      if ((ex && ey) || (ex && ez) || (ey && ez)) return FR;                       // 모서리 틀
      if ((ez || ex) && (ly === lx || ly === 9 - lx) && ez) return shadeC(FR, 1.15); // 앞뒤 대각 버팀목
      if (ly % 3 === 2) return shadeC(base, .72);                                  // 판자 틈
      return h3(x, y, z + s) < .08 ? shadeC(base, .86) : base;
    });
    if (h3(cx, cy, s + 5) < .35) box(g, x0 + 3, y0 + 4, z0 + 9, x0 + 6, y0 + 5, z0 + 9, 0x2e2a24);   // 스텐실 표시
  }
  if (c.H >= 20 && h3(s, 1, 2) < .5) {   // 방수포: 위층을 덮고 앞으로 늘어짐
    const TC = pick([0x4e5a44, 0x5a5448, 0x46505a]);
    for (let x = P; x < P + c.W; x++) for (let z = P; z < P + c.D; z++) g.set(x, c.H - 1, z, h3(x, z, s) < .2 ? shadeC(TC, .8) : TC);
    for (let x = P; x < P + c.W; x++) { const drop = 3 + Math.floor(vnoise(x * .3, 0, s) * 6); for (let y = c.H - drop; y < c.H; y++) g.set(x, y, FRONT(c), (x % 4 === 0) ? shadeC(TC, .78) : TC); }
  }
}

// ---- 무너진 콘크리트 판 (모서리가 깨지고 철근이 드러남)
function pSlab(g, c) {
  const s = c.seed;
  fillIn(g, c, (x, y, z) => {
    const n = vnoise(x * .25, z * .25 + y * .1, s);
    let col = CONCRETE[(n * 3.99) | 0];
    if (y < 3) col = shadeC(col, .85);
    if (y === c.H - 1 && vnoise(x * .5, z * .5, s + 4) > .7) col = shadeC(col, .7);   // 윗면 금
    return col;
  });
  // 가장자리 깨짐 + 철근
  for (let x = P; x < P + c.W; x++) for (let z = P; z < P + c.D; z++) {
    const edge = x === P || z === P || x === P + c.W - 1 || z === P + c.D - 1;
    if (!edge) continue;
    const dep = Math.floor(vnoise(x * .4, z * .4, s + 2) * 6) - 2;
    for (let k = 0; k < dep; k++) g.set(x, c.H - 1 - k, z, -1);
    if (dep >= 2 && h3(x, z, s) < .5) line(g, x, c.H - dep, z, x + (z === P + c.D - 1 ? 0 : 0), c.H - 2, z + (z === P + c.D - 1 ? 1 : 0), pick(RUST));
  }
  for (let x = P + 1; x < P + c.W - 1; x += 4) if (h3(x, 2, s) < .45) line(g, x, c.H - 4, P + c.D - 1, x + 1, c.H - 4, P + c.D + 1, RUST[1]);   // 앞으로 삐죽 나온 철근
}

// ---- 콘크리트 벽 패널 (초원): 이음 줄, 빗물 얼룩, 바랜 낙서, 무너진 윗부분의 철근
function pPanel(g, c) {
  const s = c.seed, fz = FRONT(c), GR = [0x7a5a6a, 0x5a6a6a, 0x8a7a5a, 0x6a5a4a];
  const broken = (x, z) => { const n = vnoise(x * .12, z * .12, s); return n > .5 ? Math.floor((n - .5) * 18) : 0; };
  fillIn(g, c, (x, y, z) => {
    if (y >= c.H - broken(x, z)) return -1;
    const u = U(x, z);
    let col = CONCRETE[(vnoise(u * .3, y * .3, s) * 3.99) | 0];
    if (u % 15 === 0) col = shadeC(col, .68);                                   // 패널 이음
    if (y === 10) col = shadeC(col, .8);
    const streak = h3(u, 0, s) < .3 ? 8 + h3(u, 1, s) * 10 : 0;                 // 위에서 흘러내린 빗물 자국
    if (c.H - y < streak) col = shadeC(col, .8);
    if (y < 3) col = mixC(col, 0x5e5444, .4);                                   // 흙 튐
    return col;
  });
  // 바랜 낙서
  if (h3(s, 9, 9) < .6) { const gx = P + randi(2, Math.max(3, c.W - 12)), gy = randi(3, 8), gc = pick(GR); for (let i = 0; i < 26; i++) { const x = gx + randi(0, 10), y = gy + randi(0, 4); if (g.get(x, y, fz) >= 0) g.set(x, y, fz, mixC(g.get(x, y, fz), gc, .7)); } }
  // 철근: 무너진 곳에서 위로 솟음
  for (let x = P + 1; x < P + c.W - 1; x += 3) for (let z = P + 1; z < P + c.D - 1; z += 4) {
    const b = broken(x, z);
    if (b >= 3) for (let y = c.H - b; y < c.H - 1 + (h3(x, z, s) < .4 ? 0 : -1); y++) g.set(x, y, z, RUST[(x + y) % 4]);
  }
  vines(g, c, fz + 1);
}

// ---- 쓰러진 콘크리트 판 더미 (초원): 판 사이 틈, 비어져 나온 철근
function pSlabs(g, c) {
  const s = c.seed, fz = FRONT(c);
  let y = 0, k = 0;
  while (y < c.H) {
    const th = Math.min(c.H - y, randi(3, 5)), off = randi(-1, 1), col = CONCRETE[k % 4];
    box(g, P, y, P, P + c.W - 1, y + th - 1, P + c.D - 1, (x, yy, z) => yy === y + th - 1 && yy < c.H - 1 ? shadeC(col, .9) : vnoise(x * .3, z * .3, s + k) > .75 ? shadeC(col, .82) : col);
    if (y + th < c.H) box(g, P, y + th - 1, fz, P + c.W - 1, y + th - 1, fz, (x) => h3(x, k, s) < .7 ? 0x2e2c28 : -2);   // 판 사이 틈 (어둡게)
    if (off > 0) box(g, P, y, fz + 1, P + c.W - 1, y + th - 2, fz + 1, (x) => vnoise(x * .2, k, s) > .4 ? col : -2);       // 살짝 튀어나온 판
    for (let x = P + 2; x < P + c.W - 1; x += 3) if (h3(x, k, s + 1) < .3) line(g, x, y + 1, fz, x + randi(-1, 1), y + 1 + randi(-1, 1), fz + 2, RUST[k % 4]);
    y += th; k++;
  }
  vines(g, c, fz + 1);
}

// ---- 시멘트 블록 담 (초원 바리케이드)
function pBlockwall(g, c) {
  const s = c.seed, long = c.long, M = 0x6a665e;
  const brk = (u) => { const n = vnoise(u * .15, 0, s); return n > .58 ? Math.floor((n - .58) * 16) : 0; };
  fillIn(g, c, (x, y, z) => {
    const u = long === 'z' ? z : x;
    if (y >= c.H - brk(u)) return -1;
    const row = (y / 2) | 0;
    if (y % 2 === 1 && y < c.H - 1) return M;
    if ((u + (row & 1) * 2) % 4 === 3) return M;
    const id = ((u + (row & 1) * 2) / 4) | 0;
    return CONCRETE[(h3(id, row, s) * 4) | 0];
  });
  for (let u = 1; u < (long === 'z' ? c.D : c.W) - 1; u += 4) {
    const b = brk(u + P); if (b < 2) continue;
    const x = long === 'z' ? P + 4 : P + u, z = long === 'z' ? P + u : P + 4;
    for (let y = c.H - b; y < c.H - 1; y++) g.set(x, y, z, RUST[y % 4]);
  }
}

// ---- 저지 방벽 (콘크리트, 바랜 빨강·흰 줄무늬)
function pJersey(g, c) {
  const s = c.seed, long = c.long, thin = long === 'z' ? c.W : c.D, len = long === 'z' ? c.D : c.W;
  const half = h => h < 2 ? thin / 2 : h < 6 ? thin / 2 - (h - 1) * 0.4 : thin / 2 - 1.8;   // 단면: 아래가 넓고 위가 좁음
  const stripes = c.biome !== 'desert' && c.biome !== 'snow';
  for (let t = 0; t < thin; t++) for (let y = 0; y < c.H; y++) for (let l = 0; l < len; l++) {
    if (Math.abs(t + .5 - thin / 2) > half(y)) continue;
    const seam = l % 30 === 29 || l % 30 === 0;
    let col = CONCRETE[(vnoise(l * .3, y * .3, s) * 3.99) | 0];
    if (stripes && y >= 4 && ((l + y) % 12) < 6) col = mixC(col, 0x9a4a3a, .62);
    else if (stripes && y >= 4) col = mixC(col, 0xc8c0b0, .35);
    if (y < 2) col = shadeC(col, .78);
    if (seam) col = shadeC(col, .6);
    if (vnoise(l * .25, y * .4, s + 5) > .78) col = shadeC(col, .75);          // 깨진 자국
    const x = long === 'z' ? P + t : P + l, z = long === 'z' ? P + l : P + t;
    g.set(x, y, z, col);
  }
  // 이음마다 들어 올리는 쇠고리
  for (let l = 15; l < len; l += 30) { const x = long === 'z' ? P + (thin >> 1) : P + l, z = long === 'z' ? P + l : P + (thin >> 1); g.set(x, c.H, z, RUST[0]); }
}

// ---- 드럼통 (팔레트 위에 2×2개씩, 층마다)
function pDrums(g, c) {
  const s = c.seed, DC = [0x7a4a30, 0x56605c, 0x857246, 0x6a3a2a, 0x5a5a52, 0x4a5a4a];
  for (let ly = 0; ly < c.H; ly += 10) {
    box(g, P, ly, P, P + c.W - 1, ly, P + c.D - 1, (x, y, z) => (x + z) % 4 === 0 ? -2 : WOOD[(x + z) % 3]);      // 팔레트
    for (let cx = 0; cx < c.W; cx += 5) for (let cz = 0; cz < c.D; cz += 5) {
      const base = DC[(h3(cx, ly, cz + s) * DC.length) | 0];
      for (let y = ly + 1; y < ly + 10; y++) for (let dx = 0; dx < 5; dx++) for (let dz = 0; dz < 5; dz++) {
        if ((dx === 0 || dx === 4) && (dz === 0 || dz === 4)) continue;
        const ry = y - ly, x = P + cx + dx, z = P + cz + dz;
        let col = base;
        if (ry === 3 || ry === 6) col = shadeC(base, .7);                                      // 테
        if (vnoise(x * .4 + cz, y * .35, s + cx) > .64) col = mixC(col, RUST[(x + y) % 4], .8);  // 녹
        if (ry === 9) col = (dx === 0 || dx === 4 || dz === 0 || dz === 4) ? shadeC(base, 1.1) : shadeC(base, .78);   // 뚜껑
        if (ry === 9 && dx === 1 && dz === 1) col = 0x1e1c1a;
        g.set(x, y, z, col);
      }
    }
  }
}

// ---- 녹슨 컨테이너 (주름진 철판, 문 쪽 잠금 막대)
function pContainer(g, c) {
  const s = c.seed, long = c.long, len = long === 'x' ? c.W : c.D;
  const base = c.color ?? pick(c.biome === 'snow' ? [0x7a3a30, 0x3e5a58, 0x6a4a30, 0x4a4e58] : [0x7a4a32, 0x5a5448, 0x806a3a, 0x6a3a2e]);
  const dark = shadeC(base, .62);
  fillIn(g, c, (x, y, z) => {
    const l = long === 'x' ? x - P : z - P, side = long === 'x' ? x : z;
    const rail = y < 2 || y >= c.H - 2, post = l < 2 || l >= len - 2;
    let col = base;
    if (rail || post) col = dark;
    else if (l % 4 >= 2) col = shadeC(base, .82);                                // 주름 골
    if (vnoise(l * .2, y * .25, s) > .66) col = mixC(col, RUST[(l + y) % 4], .85); // 녹 얼룩
    if (!rail && y > c.H - 5 && h3(l, 0, s) < .25) col = mixC(col, RUST[1], .6);   // 위에서 흐른 녹물
    return col;
  });
  // 주름: 골 부분 앞면을 한 칸 파냄
  const fz = FRONT(c);
  if (long === 'x') for (let x = P + 2; x < P + c.W - 2; x++) if ((x - P) % 4 >= 2) for (let y = 2; y < c.H - 2; y++) g.set(x, y, fz, -1);
  // 문 쪽 끝: 세로 잠금 막대
  const ex = long === 'x' ? P + c.W - 1 : null;
  if (long === 'x') for (const dz of [3, 7, c.D - 8, c.D - 4]) if (dz > 1 && dz < c.D - 1) for (let y = 2; y < c.H - 2; y++) g.set(ex + 1, y, P + dz, 0x8a8478);
  // 흰 글씨 자리 (바랜 스텐실)
  if (long === 'x') for (let x = P + 4; x < P + Math.min(c.W - 4, 14); x++) if (h3(x, 1, s) < .6) g.set(x, c.H - 4, fz - 1, 0xb8b0a0);
}

// ---- 모래에 묻힌 기계 (사막 벽): 녹슨 함체, 환기 창살, 굵은 관, 경고 줄무늬
function pMachine(g, c) {
  const s = c.seed, base = pick([0x6a5a3a, 0x5a5a4a, 0x6e4a32]), fz = FRONT(c);
  fillIn(g, c, (x, y, z) => {
    let col = (x - P) % 8 === 0 ? shadeC(base, .7) : base;
    if (vnoise(x * .25, y * .25 + z * .1, s) > .6) col = mixC(col, RUST[(x + y) % 4], .85);
    if (y >= 4 && y < 6 && z === fz) col = ((x + y) % 6 < 3) ? 0x9a8a3a : 0x2a2824;   // 경고 띠
    return col;
  });
  for (let x = P + 2; x < P + c.W - 2; x++) if ((x - P) % 8 > 1 && (x - P) % 8 < 7) for (let y = 9; y < 15; y++) if (y % 2) g.set(x, y, fz, 0x1e1c1a);   // 환기 창살
  // 굵은 관: 앞면을 따라 가로로
  cyl(g, 'x', 17.5, fz + 1, 1.6, P, P + c.W - 1, (x) => (x - P) % 12 < 2 ? shadeC(RUST[2], .8) : RUST[(x >> 2) % 4]);
  // 앞쪽 모래 더미 (아래 일부를 덮음)
  for (let x = 0; x < c.W + 2 * P; x++) { const hgt = 2 + Math.floor(vnoise(x * .15, 0, s + 7) * 7); for (let y = 0; y < hgt; y++) for (let k = 0; k < 2 + (y < hgt - 2 ? 1 : 0); k++) g.set(x, y, fz + 1 - k + (y < 2 ? 1 : 0), SAND[(x + y) % 3]); }
}

// ---- 쓰러진 큰 관 (사막·항구 바리케이드): 플랜지·받침대
function pPipe(g, c) {
  const s = c.seed, long = c.long, len = long === 'z' ? c.D : c.W, thin = long === 'z' ? c.W : c.D;
  const r = thin / 2, mid = P + thin / 2;
  cyl(g, long, mid, c.H / 2, r, P, P + len - 1, (x, y, z, t) => {
    const l = t - P;
    let col = RUST[(vnoise(l * .2, y * .3, s) * 3.99) | 0];
    if (vnoise(l * .1, y * .2, s + 3) > .68) col = mixC(col, 0x5e6258, .7);   // 남은 페인트
    if (l % 30 === 0 || l % 30 === 1) col = shadeC(RUST[2], .8);
    return col;
  });
  for (let l = 0; l < len; l += 30) cyl(g, long, mid, c.H / 2, r + 1, P + l, P + l + 1, (x, y, z) => (x + y + z) % 3 === 0 ? 0x8a7a62 : shadeC(RUST[2], .75));   // 플랜지(볼트)
  // 바닥 귀퉁이와 받침
  const fillC = c.biome === 'snow' ? SNOW : SAND;
  for (let l = 0; l < len; l++) for (let t = -P; t < thin + P; t++) for (let y = 0; y < 3; y++) {
    const x = long === 'z' ? P + t : P + l, z = long === 'z' ? P + l : P + t;
    if (g.get(x, y, z) >= 0) continue;
    const dEdge = t < 0 ? -t : t >= thin ? t - thin + 1 : 0;
    if (y < 3 - dEdge && vnoise(l * .2, t, s + 1) > .2) g.set(x, y, z, fillC[(l + y) % 3]);
  }
}

// ---- 경고 줄무늬 콘크리트 블록 (사막)
function pHazard(g, c) {
  const s = c.seed, long = c.long, len = long === 'z' ? c.D : c.W;
  fillIn(g, c, (x, y, z) => {
    const l = long === 'z' ? z - P : x - P;
    let col = CONCRETE[(vnoise(l * .3, y * .3, s) * 3.99) | 0];
    if (y >= 3 && y <= 7) col = ((l + y) % 8 < 4) ? mixC(0xa89040, col, .25) : 0x2e2c28;
    if (l % 18 === 17) col = shadeC(col, .55);
    if (vnoise(l * .3, y * .3, s + 4) > .74) col = mixC(col, CONCRETE[2], .8);   // 벗겨진 페인트
    return col;
  });
  for (let l = 6; l < len; l += 18) for (const dt of [3, -4]) {
    const x = long === 'z' ? P + (dt > 0 ? dt : c.W + dt) : P + l, z = long === 'z' ? P + l : P + (dt > 0 ? dt : c.D + dt);
    g.set(x, c.H, z, RUST[0]); g.set(x + (long === 'x' ? 1 : 0), c.H, z + (long === 'z' ? 1 : 0), RUST[0]);
  }
}

// ---- 팔레트 더미 (항구)
function pPallets(g, c) {
  const s = c.seed;
  for (let y = 0; y < c.H; y++) {
    const deck = y % 2 === 1, col = WOOD[((y >> 1) + s) % 4];
    for (let x = P; x < P + c.W; x++) for (let z = P; z < P + c.D; z++) {
      const lx = (x - P) % 10, lz = (z - P) % 10;
      if (deck) { if (lz % 3 !== 2 || lx === 0 || lx === 9) g.set(x, y, z, lz % 3 === 2 ? shadeC(col, .8) : col); }
      else if (lx <= 1 || lx >= 8 || (lx >= 4 && lx <= 5)) g.set(x, y, z, shadeC(col, .85));
      else if (y === 0 || (x === P || x === P + c.W - 1 || z === P || z === P + c.D - 1) === false) g.set(x, y, z, shadeC(col, .45));   // 속은 어둡게 막음
    }
  }
}

// 바이옴 날씨 마감: 눈 덮임 / 모래 쌓임 / 마른 풀
const SNOW = [0xd2d6d8, 0xc4c9cc, 0xdadedf], SAND = [0xb8a078, 0xaa9068, 0xc2aa82];
const GRASS = [0x9a8c5e, 0x8a7c50, 0xa89a6a, 0x7a7046];
function weather(g, c) {
  const s = c.seed;
  if (c.biome === 'snow') {
    for (let x = 0; x < g.w; x++) for (let z = 0; z < g.d; z++) {
      let y = g.h - 1; while (y >= 0 && g.get(x, y, z) < 0) y--;
      if (y < 0) continue;
      if (vnoise(x * .3, z * .3, s) > .22) g.set(x, y, z, SNOW[(x + z) % 3]);
      if (y + 1 < g.h && y < c.H - 1 && vnoise(x * .4, z * .4, s + 2) > .6) g.set(x, y + 1, z, SNOW[0]);   // 낮은 곳엔 소복이
    }
    // 고드름: 앞면 윗 모서리 아래로
    const fz = FRONT(c);
    for (let x = P; x < P + c.W; x++) if (h3(x, 7, s) < .4) { const n = randi(1, 4); for (let k = 1; k <= n; k++) g.set(x, c.H - 1 - k, fz + 1, k === n ? 0xb8c8d0 : 0xa8bcc6); }
    for (let x = 0; x < g.w; x++) for (const z of [0, 1, g.d - 2, g.d - 1]) if (g.get(x, 0, z) < 0 && vnoise(x * .3, z, s) > .45) g.set(x, 0, z, SNOW[x % 3]);
  } else if (c.biome === 'desert') {
    for (let x = 0; x < g.w; x++) for (let z = 0; z < g.d; z++) {
      let y = g.h - 1; while (y >= 0 && g.get(x, y, z) < 0) y--;
      if (y >= 0 && y >= c.H - 1 && vnoise(x * .25, z * .25, s) > .7) g.set(x, y, z, SAND[(x + z) % 3]);
    }
    for (let x = 0; x < g.w; x++) for (let z = 0; z < g.d; z++) if (!IN(c, x, 0, z) && g.get(x, 0, z) < 0 && vnoise(x * .2, z * .2, s + 1) > .4) { g.set(x, 0, z, SAND[x % 3]); if (vnoise(x * .3, z * .3, s + 6) > .7) g.set(x, 1, z, SAND[1]); }
  } else if (c.biome === 'plains') {
    for (let x = 0; x < g.w; x++) for (let z = 0; z < g.d; z++) {
      if (IN(c, x, 0, z) || g.get(x, 0, z) >= 0 || h3(x, z, s) > .3) continue;
      const hgt = randi(2, 5), col = pick(GRASS);
      for (let y = 0; y < hgt; y++) g.set(x, y, z, y === hgt - 1 ? shadeC(col, 1.12) : col);
    }
    for (let x = 0; x < g.w; x++) for (let z = 0; z < g.d; z++) {   // 이끼
      let y = g.h - 1; while (y >= 0 && g.get(x, y, z) < 0) y--;
      if (y >= 0 && vnoise(x * .3, z * .3, s + 8) > .7) g.set(x, y, z, mixC(g.get(x, y, z), 0x5e6040, .6));
    }
  } else {   // 도시: 먼지·쓰레기 조금
    for (let x = 0; x < g.w; x++) for (let z = 0; z < g.d; z++) if (!IN(c, x, 0, z) && g.get(x, 0, z) < 0 && h3(x, z, s + 3) < .08) g.set(x, 0, z, pick([0x3a3836, 0x8a8070, 0x5a5048]));
  }
}
// 덩굴: 앞면(z = fz) 위에서 아래로 늘어짐 (초원)
function vines(g, c, fz) {
  const s = c.seed, VC = [0x5a5e3a, 0x6a6a40, 0x4a5032, 0x767448];
  for (let x = 0; x < g.w; x++) {
    if (vnoise(x * .2, 0, s + 11) < .5 || h3(x, 0, s) < .3) continue;
    let topY = c.H - 1; while (topY > 0 && g.get(x, topY, fz - 1) < 0) topY--;
    const len = randi(3, Math.min(16, c.H));
    for (let k = 0; k < len; k++) { const y = topY - k; if (y < 0) break; g.set(x, y, fz, VC[(x + k) % 4]); if (h3(x, y, s) < .25) g.set(x + 1, y, fz, VC[2]); }
  }
}

// 바이옴·조각 종류별 칠하기 함수
const PAINT = { brick: pBrick, sandbag: pSandbag, crates: pCrates, slab: pSlab, panel: pPanel, slabs: pSlabs, blockwall: pBlockwall, jersey: pJersey, drums: pDrums, container: pContainer, machine: pMachine, pipe: pPipe, hazard: pHazard, pallets: pPallets };
// 벽(2칸 높이)은 x로 잘라 여러 물건을 늘어놓음: [종류, 최소 길이, 최대 길이(m)]
const KINDS = {
  city:   { wall: [['brick', 2, 4], ['sandbag', 2, 3], ['crates', 1, 3], ['brick', 2, 3]], barrier: ['jersey', 'jersey', 'sandbag'], plat: ['crates', 'slab', 'crates'] },
  plains: { wall: [['panel', 3, 5], ['slabs', 2, 4], ['panel', 2, 4]], barrier: ['blockwall', 'jersey'], plat: ['slabs', 'slab', 'slabs'] },
  desert: { wall: [['drums', 2, 3], ['container', 3, 6], ['machine', 3, 5]], barrier: ['pipe', 'hazard'], plat: ['drums', 'hazard', 'crates'] },
  snow:   { wall: [['container', 3, 6], ['pallets', 2, 3], ['crates', 2, 3], ['container', 3, 5]], barrier: ['pipe', 'pallets', 'jersey'], plat: ['pallets', 'crates', 'drums'] },
};

function paintPiece(ch, kind, biome, x, z, w, d, h, long, seed, extra = {}) {
  const c = { W: w * 10, H: h * 10, D: d * 10, seed, biome, long, ...extra };
  const g = grid(c.W + 2 * P, c.H + 3, c.D + 2 * P);
  PAINT[kind](g, c);
  weather(g, c);
  ch.add(g, S, x - P * S, 0, z - P * S, { seed, bottom: false });
}

// ---------------------------------------------------------------- 낭떠러지 가장자리: 깨진 단면·철근·뿌리·모래 줄기·고드름
const EDGE = {
  city:   { lip: [0x3a3836, 0x46423e], chunk: [0x6e6a64, 0x5e5a54], hang: RUST, hangLen: [2, 5], hangK: .35, rebar: true },
  plains: { lip: [0x6e6a62, 0x7a766c], chunk: [0x5e4a38, 0x4e3e30], hang: [0x5a4632, 0x6a5a3a, 0x4a3a28], hangLen: [3, 9], hangK: .5, rebar: true },
  desert: { lip: [0x8a8274, 0x7e7668], chunk: [0x9a8460, 0x8a7656], hang: SAND, hangLen: [4, 12], hangK: .3, rebar: false },
  snow:   { lip: [0x6a6864, 0x5e5c58], chunk: [0x5a5854, 0x4e4c48], hang: [0xb8c8d0, 0xa8bcc6, 0xc8d4d8], hangLen: [2, 6], hangK: .55, rebar: true },
};
function pitEdges(ch, st, biome) {
  const E = EDGE[biome], isPit = (x, z) => st.heightAt(x + .5, z + .5) === PIT;
  for (let x = -2; x < st.L + 2; x++) for (let z = -5; z <= 7; z++) {
    if (isPit(x, z) || st.heightAt(x + .5, z + .5) !== 0) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!isPit(x + dx, z + dz)) continue;
      // 가장자리 한 칸(1m) 단면 그리드: 가로 10 × 높이 14(-1.4~0) × 앞으로 4
      const g = grid(dx ? 4 : 10, 14, dx ? 10 : 4), seed = x * 31 + z * 7 + dx * 3 + dz;
      const out = (u, k) => dx > 0 ? [k, u] : dx < 0 ? [3 - k, u] : dz > 0 ? [u, k] : [u, 3 - k];   // u: 가장자리 따라, k: 바깥으로
      for (let u = 0; u < 10; u++) {
        const n = vnoise(u * .35, x + z, seed), ledge = 1 + Math.floor(n * 2.6);
        // 깨진 덩어리: 줄무늬 아래(-0.3m 아래)에 툭 튀어나온 판
        for (let y = 3; y < 7 + Math.floor(n * 4); y++) for (let k = 0; k < ledge - (y > 8 ? 1 : 0); k++) { const [a, b] = out(u, k); g.set(a, 13 - y, b, E.chunk[(u + y) % 2]); }
        // 아래로 늘어진 것
        if (h3(u, x, z + seed) < E.hangK) { const len = randi(E.hangLen[0], E.hangLen[1]); const k = Math.min(3, ledge); for (let y = 0; y < len; y++) { const [a, b] = out(u, k); g.set(a, 13 - 6 - y, b, E.hang[(u + y) % E.hang.length]); } }
      }
      if (E.rebar) for (let u = 1 + randi(0, 3); u < 10; u += randi(4, 9)) if (h3(u, x, z) < .5) { const yy = 13 - randi(3, 5); for (let k = 0; k < 4; k++) { const [a, b] = out(u, k); g.set(a, yy - (k >> 1), b, RUST[k]); } }
      const ox = dx > 0 ? x + 1 : dx < 0 ? x - 0.4 : x, oz = dz > 0 ? z + 1 : dz < 0 ? z - 0.4 : z;
      ch.add(g, S, ox, -1.4, oz, { seed });
    }
  }
}

// ---------------------------------------------------------------- 항구: 낭떠러지 아래 얼음 낀 바닷물
function pitWater(ch, st) {
  const top = FACES[2], W = rgb(OBSTACLE.water), ICE = [rgb(0x9aa8ae), rgb(0x8a989e), rgb(0xb0bcc0)];
  for (let x = -2; x < st.L + 2; x++) for (let z = -5; z <= 7; z++) {
    if (st.heightAt(x + .5, z + .5) !== PIT) continue;
    const mb = ch.mb(x, x + 1, z);
    mb.quad(top, x, OBSTACLE.waterY - 1, z, 1, 1, 1, W);
    if (h3(x, z, 77) < .4) { const s = rand(.25, .6), px = x + rand(0, 1 - s), pz = z + rand(0, 1 - s); for (const f of FACES) if (f.n[1] !== -1) mb.quad(f, px, OBSTACLE.waterY - .05, pz, s, .08, s * rand(.6, 1), pick(ICE)); }
  }
}

// ---------------------------------------------------------------- 진입점
// 반환: { chunks (핏자국 묻는 장애물), edges (낭떠러지 단면), water }
export function buildObstacles(r, st, biome) {
  const K = KINDS[biome] ?? KINDS.city, ch = new Chunks(8), ed = new Chunks(12);
  let seed = 1;
  for (const p of rects(st.hmap)) {
    seed += 17;
    if (p.h === 2) {                              // 좁은 골목 벽: x를 따라 여러 물건
      let x = p.x;
      while (x < p.x + p.w) {
        const [kind, lo, hi] = pick(K.wall);
        let len = Math.min(p.x + p.w - x, randi(lo, hi));
        if (p.x + p.w - x - len === 1 && kind !== 'crates') len++;
        paintPiece(ch, kind, biome, x, p.z, len, p.d, 2, 'x', seed + x);
        x += len;
      }
    } else if (p.w === 1 && p.d >= 4 || p.d === 1 && p.w >= 4) {   // 바리케이드 줄: 줄 하나는 같은 종류
      const kind = pick(K.barrier), long = p.w === 1 ? 'z' : 'x', len = long === 'z' ? p.d : p.w;
      const step = kind === 'pipe' ? len : kind === 'pallets' ? 1 : 3;
      for (let i = 0; i < len; i += step) {
        const n = Math.min(step, len - i);
        if (long === 'z') paintPiece(ch, kind, biome, p.x, p.z + i, 1, n, 1, 'z', seed + i);
        else paintPiece(ch, kind, biome, p.x + i, p.z, n, 1, 1, 'x', seed + i);
      }
    } else {                                      // 잔해 더미 (올라설 수 있음)
      paintPiece(ch, pick(K.plat), biome, p.x, p.z, p.w, p.d, p.h, p.w >= p.d ? 'x' : 'z', seed);
    }
  }
  pitEdges(ed, st, biome);
  if (biome === 'snow') pitWater(ed, st);
  return { chunks: ch.build(r), edges: ed.build(r) };
}
