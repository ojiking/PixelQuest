// 폐허가 된 뉴욕 거리 (도심 바이옴) — 기준: docs/art/target_ingame.webp
// 1m 블록 덩어리 위에 0.2m 복셀 외벽(벽돌·창·비상계단·차양·셔터)을 덧붙여 디테일을 낸다.
import { VoxGrid, meshGrid, MeshBuilder, FACES, hexToRgb, hash3 } from './voxel.js';
import { rand, randi, pick, shuffle } from './math.js';
import { makeSign } from './city.js';

export const FV = 0.2;                 // 외벽 복셀 크기(m)
export const FRONT_Z = -6;             // 건물 정면(벽 표면) 위치
const BRICKS = [[0x8a4a38, 0x7a4232, 0x94523c], [0x7a4434, 0x6a3a2c, 0x84483a], [0x9a5a42, 0x8a5038, 0xa4624a], [0x6e4032, 0x603628, 0x784636], [0x8e6a52, 0x7e5c46, 0x987458]];
const C = {
  mortar: 0x9a8676, stone: 0x8a7e70, stoneD: 0x6a5e52, cornice: 0x5e5248,
  glass: 0x1e242a, glassL: 0x3a4650, dark: 0x0e0f12, frame: 0x4a3e36,
  wood: 0x7a5a3a, woodD: 0x5a4028, rust: 0x5a3424, rustL: 0x7a4a2e, iron: 0x2e2622,
  ac: 0xa8a294, acD: 0x7a766c, shutter: 0x6e6c68, shutterD: 0x55534f,
  awn: [[0x8e4a3c, 0xbab098], [0x485a46, 0xbab098], [0x7e6a3e, 0x3a3230]],   // 차양: 30% 채도 낮춤
  graffiti: [0x8a5a7a, 0x5a7a7a, 0xb8b0a0, 0x7a6a3a, 0x6a4a5a],
};
const SIGN_TEXT = ['BODEGA', 'DELI', 'PAWN SHOP', 'LIQUOR', 'HOTEL', 'PIZZA', 'LAUNDRY', 'GROCERY', 'BAR', 'CHECKS CASHED', 'TATTOO', 'DINER', 'HARDWARE', 'PHARMACY', 'SHOES', 'CAFE'];
const SIGN_COL = [[0x8a3a2a, 0xd8c8a8], [0x2e4a36, 0xd8c8a8], [0xc8b898, 0x6a2a22], [0x2a2826, 0xc8a24a], [0x6a5a3a, 0xe0d4b8], [0x3a4250, 0xd0c4a8]];

// ---------------------------------------------------------------- 블록 덩어리 + 원경 (World 블록)
// ids: { build[], far, trim, rail }  반환: 외벽·간판·물탱크 명세
export function buildNYCBlocks(w, L, ids) {
  const facades = [], signs = [], towers = [];
  let bx = -12, k = 0;
  while (bx < L + 14) {
    const bw = randi(5, 9), bd = randi(5, 8), bh = randi(8, 15);
    const zf = FRONT_Z - 1;                    // 블록 정면 = z -6
    const col = ids.build[randi(0, ids.build.length - 1)];
    for (let x = bx; x < bx + bw; x++) for (let z = zf - bd + 1; z <= zf; z++) for (let y = 0; y < bh; y++) w.set(x, y, z, col);
    const store = pick(['bodega', 'boarded', 'shutter', 'shutter', 'bodega', 'door']);
    facades.push({ x: bx, w: bw, h: bh, store, brick: k % BRICKS.length, fire: Math.random() < 0.55 && bw >= 6, seed: k * 13 + 7 });
    if (store === 'bodega' || Math.random() < 0.5) {
      const sw = Math.min(bw - 0.8, rand(2.6, 4.4));
      signs.push({ x: bx + (bw - sw) / 2, y: 2.35, z: FRONT_Z + 0.42, w: sw, h: 0.7, vertical: false, big: store === 'bodega' });
    }
    if (Math.random() < 0.3 && bh >= 10) signs.push({ x: bx + 0.25, y: rand(4, 6), z: FRONT_Z + 0.42, w: 0.7, h: rand(2.2, 3), vertical: true });
    if (Math.random() < 0.35) towers.push({ x: bx + bw / 2 + rand(-1, 1), y: bh, z: zf - bd / 2 });
    bx += bw + (Math.random() < 0.12 ? 2 : 0);
    k++;
  }
  // 고가 철로 (z -14..-12, 높이 6~7): 녹슨 상판 + 기둥
  for (let x = -14; x < L + 16; x++) for (let z = -14; z <= -12; z++) {
    w.set(x, 7, z, ids.rail); if (z === -14 || z === -12) w.set(x, 8, z, x % 2 ? ids.rail : ids.trim);
    if (x % 7 === 0 && z !== -13) for (let y = 0; y < 7; y++) w.set(x, y, z, ids.rail);
  }
  // 먼 스카이라인: 안개 속 고층 건물 + 첨탑 하나
  for (let x = -14; x < L + 16; x += randi(3, 6)) {
    const hgt = randi(12, 30), z0 = randi(-30, -20), ww = randi(3, 6);
    for (let xx = x; xx < x + ww; xx++) for (let zz = z0; zz < z0 + 3; zz++) for (let y = 0; y < hgt; y++) w.set(xx, y, zz, (y % 3 === 1 && (xx + zz) % 2 === 0) ? ids.trim : ids.far);
  }
  const sx = Math.floor(L * 0.55);
  for (let y = 0; y < 34; y++) { const r = y < 26 ? 2 : y < 30 ? 1 : 0; for (let xx = sx - r; xx <= sx + r; xx++) for (let zz = -27 - r; zz <= -27 + r; zz++) w.set(xx, y, zz, ids.far); }
  for (let y = 34; y < 40; y++) w.set(sx, y, -27, ids.far);
  return { facades, signs, towers };
}

// ---------------------------------------------------------------- 외벽 메시 (0.2m 복셀)
function facadeGrid(f) {
  const W = f.w * 5, H = f.h * 5, D = 6;            // 깊이 1.2m: 벽(0) · 창틀·문턱(1~2) · 비상계단·차양(2~5)
  const g = new VoxGrid(W, H + 2, D);
  const br = BRICKS[f.brick], hh = (x, y, s = 0) => hash3(x + f.seed, y + s, f.seed * 3);
  // 벽돌: 3톤 + 아래로 갈수록 때 + 창 아래 얼룩
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = br[(hh(x, y) * 3) | 0];
    if (y % 3 === 2 && hh(x, y, 5) < .25) c = C.mortar;
    g.set(x, y, 0, c);
  }
  // 처마 장식 (맨 위 2줄 튀어나옴) + 옥상 난간
  for (let x = 0; x < W; x++) { g.set(x, H - 1, 1, C.cornice); g.set(x, H - 2, 1, C.cornice); g.set(x, H - 1, 2, C.stoneD); if (x % 4 === 0) g.set(x, H - 3, 1, C.stoneD); g.set(x, H, 0, C.cornice); if (hh(x, 1) < .5) g.set(x, H + 1, 0, C.cornice); }
  // 1층 상점 (높이 0~14칸 = 2.8m)
  const sx0 = 2, sx1 = W - 3;
  if (f.store === 'shutter') {
    for (let y = 0; y <= 11; y++) for (let x = sx0; x <= sx1; x++) g.set(x, y, 0, y % 2 ? C.shutter : C.shutterD);
    for (let x = sx0; x <= sx1; x++) g.set(x, 12, 1, C.iron);
    // 낙서: 흐린 색 덩어리 글자
    for (let n = 0; n < 3; n++) {
      const cx = randi(sx0 + 2, sx1 - 6), cy = randi(2, 8), gc = pick(C.graffiti);
      for (let i = 0; i < 18; i++) { const x = cx + randi(0, 6), y = cy + randi(0, 3); if (x <= sx1) g.set(x, y, 0, gc); }
    }
  } else {
    // 진열창 + 문 (판자 또는 유리)
    for (let y = 0; y <= 12; y++) for (let x = sx0; x <= sx1; x++) {
      const frame = y === 0 || y === 12 || x === sx0 || x === sx1 || (x - sx0) % 8 === 0;
      g.set(x, y, 0, frame ? C.frame : (f.store === 'door' ? C.glass : C.dark));
    }
    if (f.store === 'boarded' || f.store === 'bodega') {     // 판자: 가로·대각선
      for (let x = sx0 + 1; x < sx1; x++) for (const y of [3, 7, 10]) if (hh(x, y) < .85) g.set(x, y, 1, hh(x, y, 2) < .5 ? C.wood : C.woodD);
      for (let i = 0; i < 9; i++) { g.set(sx0 + 1 + i, 2 + i, 1, C.woodD); g.set(sx1 - 1 - i, 2 + i, 1, C.woodD); }
    }
    if (f.store === 'door') for (let y = 1; y <= 11; y += 2) for (let x = sx0 + 1; x < sx1; x++) if (hh(x, y, 9) < .3) g.set(x, y, 0, C.glassL);
  }
  // 차양 (bodega): 줄무늬, 앞으로 기울어 튀어나옴
  if (f.store === 'bodega') {
    const [a, b] = pick(C.awn);
    for (let x = sx0 - 1; x <= sx1 + 1; x++) for (let d = 0; d < 4; d++) {
      const y = 15 - d;
      g.set(x, y, 1 + d, ((x >> 1) % 2) ? a : b);
      if (d === 3) g.set(x, y - 1, 1 + d, ((x >> 1) % 2) ? a : b);   // 늘어진 끝단
    }
  }
  // 위층 창문: 층마다 13칸, 창 4×6칸 + 위 인방돌 + 아래 창턱
  const cols = []; for (let x = 2; x + 4 <= W - 2; x += 7) cols.push(x);
  for (let fy = 17; fy + 8 < H - 3; fy += 13) {
    for (const wx of cols) {
      const kind = hh(wx, fy, 4);
      for (let y = fy; y < fy + 6; y++) for (let x = wx; x < wx + 4; x++) {
        let c = C.glass;
        if (kind < .3 && hh(x, y, 7) < .45) c = C.dark;                        // 깨진 유리
        else if (kind > .82) c = (y - fy) % 2 ? C.wood : C.woodD;              // 판자로 막음
        else if (hh(x, y, 8) < .12) c = C.glassL;                               // 반사
        g.set(x, y, 0, c);
      }
      for (let x = wx - 1; x <= wx + 4; x++) { g.set(x, fy + 6, 1, C.stone); g.set(x, fy - 1, 1, C.stoneD); }   // 인방돌·창턱
      if (kind > .55 && kind <= .82 && !f.fire) {                               // 에어컨 실외기
        for (let x = wx; x < wx + 3; x++) for (let y = fy - 1; y < fy + 1; y++) for (let d = 1; d <= 3; d++) g.set(x, y, d, d === 3 && x === wx + 1 ? C.acD : C.ac);
      }
    }
  }
  // 비상계단: 층마다 발판(깊이 3칸) + 난간 + 사이 계단
  if (f.fire) {
    const x0 = Math.max(1, (W >> 1) - 9), x1 = Math.min(W - 2, x0 + 17);
    let fl = 0;
    for (let fy = 16; fy + 8 < H - 3; fy += 13) {
      for (let x = x0; x <= x1; x++) for (let d = 2; d <= 4; d++) g.set(x, fy, d, (x + d) % 2 ? C.rust : C.iron);
      for (let x = x0; x <= x1; x++) { g.set(x, fy + 5, 5, C.rustL); if ((x - x0) % 3 === 0) for (let y = fy + 1; y < fy + 5; y++) g.set(x, y, 5, C.iron); }
      for (const x of [x0, x1]) for (let y = fy + 1; y <= fy + 5; y++) for (let d = 2; d <= 5; d++) if (y === fy + 5 || d === 5) g.set(x, y, d, C.iron);
      // 위층으로 올라가는 계단 (지그재그)
      if (fy + 13 + 8 < H - 3) for (let i = 0; i < 12; i++) { const x = fl % 2 ? x1 - 2 - i : x0 + 2 + i; g.set(x, fy + 1 + i, 3, C.iron); g.set(x, fy + 1 + i, 2, C.rust); }
      fl++;
    }
    // 아래로 내려오는 사다리
    for (let y = 6; y < 16; y++) if (y % 2) g.set(x1 - 1, y, 3, C.iron);
  }
  return g;
}

export function makeFacades(r, specs) {
  return specs.map(f => ({ x: f.x, mesh: meshGrid(r, facadeGrid(f), FV, [0, 0, 0]).mesh, w: f.w }));
}

export function makeNYCSigns(r, specs) {
  const names = shuffle([...SIGN_TEXT]);
  return specs.map((s, i) => {
    const [bg, fg] = s.big ? [0x8a3a2a, 0xe0d0b0] : pick(SIGN_COL);
    const text = s.big ? 'BODEGA' : names[i % names.length];
    return { ...s, mesh: makeSign(r, text, s.w, s.h, bg, fg, s.vertical) };
  });
}

// ---------------------------------------------------------------- 도로: 바랜 차선 + 균열·땜질 자국
export function buildNYCRoad(r, L, isPit) {
  const mb = new MeshBuilder(), top = FACES[2], y = 0.012;
  const Y = hexToRgb(0xa88a3a), WH = hexToRgb(0xa8a296), CR = hexToRgb(0x302d2a), PT = hexToRgb(0x3a3633);
  const strip = (x0, x1, z0, z1, c, keep = 1) => {
    for (let x = x0; x < x1; x += 1) {
      const xe = Math.min(x1, x + 1);
      if (isPit(x + 0.5, (z0 + z1) / 2) || Math.random() > keep) continue;
      mb.quad(top, x, y - 1, z0, xe - x, 1, z1 - z0, c);
    }
  };
  strip(-12, L + 14, 1.38, 1.5, Y, .8);  strip(-12, L + 14, 1.6, 1.72, Y, .8);   // 바래고 끊긴 중앙선
  strip(-12, L + 14, 4.75, 4.85, WH, .7);
  for (let x = -12; x < L + 14; x += 4) strip(x, x + 2, -0.3, -0.2, WH, .6);
  // 균열: 지그재그 가는 선
  const crack = (x, z, ang, steps, depth) => {   // 제멋대로 꺾이고 갈라지는 균열
    for (let i = 0; i < steps; i++) {
      ang += rand(-.55, .55);
      const st = rand(.1, .25), nx = x + Math.cos(ang) * st, nz = Math.max(-1.9, Math.min(4.7, z + Math.sin(ang) * st));
      if (!isPit(x, z)) mb.quad(top, Math.min(x, nx), y - 0.998, Math.min(z, nz), Math.abs(nx - x) + .045, 1, Math.abs(nz - z) + .045, CR);
      if (depth < 2 && Math.random() < .12) crack(nx, nz, ang + rand(-1.4, 1.4), (steps - i) >> 1, depth + 1);
      x = nx; z = nz;
    }
  };
  for (let n = 0; n < L * 0.4; n++) crack(rand(-10, L + 12), rand(-1.8, 4.6), rand(0, 6.28), randi(6, 18), 0);
  // 땜질한 아스팔트 조각
  for (let n = 0; n < L * 0.05; n++) { const x = rand(-10, L + 12), z = rand(-1.5, 4.2); if (!isPit(x, z)) mb.quad(top, x, y - 0.999, z, rand(0.8, 2), 1, rand(0.6, 1.4), PT); }
  // 노이즈 덩어리 (0.1m 격자): 패인 구멍·물웅덩이
  const blob = (cx, cz, rad, col, rim, yy) => {
    for (let gx = -rad; gx <= rad; gx += 0.1) for (let gz = -rad; gz <= rad; gz += 0.1) {
      const d = Math.hypot(gx, gz * 1.3) / rad + (hash3((cx + gx) * 10, 3, (cz + gz) * 10) - .5) * .25;
      if (d > 1 || isPit(cx + gx, cz + gz)) continue;
      mb.quad(top, cx + gx, yy - 1, cz + gz, 0.1, 1, 0.1, rim && d > .72 ? rim : col);
    }
  };
  for (let n = 0; n < L * 0.06; n++) blob(rand(-10, L + 12), rand(-1.4, 4.3), rand(.25, .55), hexToRgb(0x242220), hexToRgb(0x56524c), y + .0015);   // 패인 구멍
  for (let n = 0; n < L * 0.05; n++) blob(rand(-10, L + 12), rand(-1.8, -0.8) + (Math.random() < .4 ? 5.2 : 0), rand(.35, .8), hexToRgb(0x2e3236), hexToRgb(0x3a3e40), y + .002);   // 물웅덩이 (길가)
  // 맨홀 뚜껑 (둥근 쇠, 격자 무늬)
  for (let x = rand(4, 12); x < L + 10; x += rand(14, 22)) {
    const cz = rand(0.2, 3.2); if (isPit(x, cz)) continue;
    for (let gx = -.35; gx <= .35; gx += .05) for (let gz = -.35; gz <= .35; gz += .05) {
      const d = Math.hypot(gx, gz); if (d > .35) continue;
      const c = d > .3 ? 0x2a2826 : (Math.round(gx * 20) + Math.round(gz * 20)) % 3 === 0 ? 0x3e3a36 : 0x4e4842;
      mb.quad(top, x + gx, y + .002 - 1, cz + gz, .05, 1, .05, hexToRgb(c));
    }
  }
  // 빗물받이 (인도 경계석 앞)
  for (let x = rand(2, 9); x < L + 10; x += rand(9, 15)) {
    if (isPit(x, -1.85)) continue;
    mb.quad(top, x, y + .002 - 1, -1.95, 0.9, 1, 0.3, hexToRgb(0x2a2826));
    for (let k = 0; k < 7; k++) mb.quad(top, x + 0.06 + k * 0.12, y + .003 - 1, -1.9, 0.05, 1, 0.2, hexToRgb(0x101010));
  }
  // 흩어진 벽돌 조각 (작은 상자)
  const BRK = [0x8a4a38, 0x7a4232, 0x6e6a64];
  for (let n = 0; n < L * 0.5; n++) {
    const x = rand(-10, L + 12), z = Math.random() < .6 ? rand(-1.9, -1.2) : rand(-1, 4.6); if (isPit(x, z)) continue;
    const w = rand(.12, .22), d = rand(.06, .12), c = hexToRgb(BRK[n % 3]).map(v => v * (0.85 + Math.random() * .2));
    for (const f of FACES) if (f.n[1] !== -1 && f.n[2] !== -1) mb.quad(f, x, 0, z, w, .07, d, c);
  }
  return mb.build(r);
}

// ---------------------------------------------------------------- 거리 장식 (밟고 지나가는 소품, 판정 없음)
export function buildNYCDecor(L, free) {
  const decor = [];
  for (let x = 6 + rand(0, 4); x < L + 6; x += rand(10, 14)) decor.push({ model: 'streetlamp', x, z: -5.3, rot: rand(-0.08, 0.12) });
  for (let x = rand(2, 6); x < L + 8; x += rand(3, 7)) {
    const z = rand(-5.7, -4.8);
    decor.push({ model: pick(['trashbags', 'rubble', 'trashbags', 'rubble', 'newspaper']), x, z, rot: rand(-0.4, 0.4) });
  }
  for (let x = rand(8, 20); x < L; x += rand(18, 30)) decor.push({ model: 'barrier', x, z: rand(-5.6, -5.0), rot: rand(-0.15, 0.15) });
  for (let x = rand(5, 12); x < L + 4; x += rand(16, 24)) decor.push({ model: 'hydrant', x, z: -4.9, rot: 0 });
  return decor;
}

// 반투명 안개막: 건물 뒤·철로 앞·스카이라인 앞에 아래가 짙은 띠를 겹쳐 깊이감
export function buildFogCards(r, L) {
  const cards = [];
  const mk = (z, h) => {
    const mb = new MeshBuilder(), f = FACES[4];
    mb.quad(f, -14, 0, z, L + 30, h, 0.001, [1, 1, 1]);
    return mb.build(r);
  };
  // 맨 앞(-5.4): 건물 바로 앞을 흐리게 덮는 먼지막 → 거리와 건물 사이 깊이감 (화면에 보이는 층)
  for (const [z, layers] of [[-24, [[0, 14, .34], [14, 10, .2], [24, 10, .1]]], [-17, [[0, 9, .3], [9, 7, .16]]], [-10, [[0, 6, .22], [6, 6, .1]]], [-5.45, [[0, 1.4, .26], [1.4, 1.6, .17], [3, 3, .1], [6, 6, .06]]]]) {
    for (const [y0, h, a] of layers) cards.push({ mesh: mk(z, h), y: y0, a });
  }
  return cards;
}
