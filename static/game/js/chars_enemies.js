// 적·보스·로봇 고밀도 복셀 모델 (복셀 4.5cm) — 기준: docs/art/ref/chars_small_a/b, chars_big, robots
// 실루엣만 보고도 누군지 알아보도록 캐릭터마다 머리 장식·등짐·어깨 모양을 다르게 잡는다.
//  보통 체형: 뱀돌이와 같은 뼈대 (다리 18 · 몸통 9 · 팔 16칸)
//  큰 체형: 다리 21 · 몸통 12 · 팔 20칸, 어깨·팔이 훨씬 굵음 (config 배율 1.3~1.7과 곱해 약 1.4배 이상)
//  꼬마: 다리 13 · 몸통 7 · 팔 12칸, 머리가 큼
import { VoxGrid, hash3 } from './voxel.js';
import { H, desat, shade, pick, tone, grime, mul, recolor, Sub, ell, rbox, spike, line, stamp, faceBase, torsoShape, armShape, legShape, assemble } from './chars_hd.js';

// ---------------------------------------------------------------- 공통 색
const SK = { tan: 0xcf9466, pale: 0xdca478, dark: 0xa86c44, olive: 0xbf8758, kid: 0xe8b48a, ruddy: 0xd39272 };
const STEEL = 0x8a8e92, STEEL_D = 0x5c6064, STEEL_L = 0xb8bcbe, RUST = 0x7a4a2c, RUST_D = 0x5a3420;
const STUD = 0xa8a69e, STUD_D = 0x7a7872;
const THREAD = 0xd8d0c0;
const skinT = (c) => (x, y, z) => pick(x, y, z, c, shade(c, .9), shade(c, 1.07), .2, .1);

// ---------------------------------------------------------------- 공통 격자
// 머리: 뱀돌이 얼굴 좌표(x 7..18, z 3..14)를 그대로 쓰되 사방에 여유 (뿔·꼬리·모히칸)
function headGrid(w = 28, h = 30, d = 28, dx = 4, dz = 5) {
  const g = new VoxGrid(w, h, d), s = new Sub(g, dx, 0, dz);
  return { g, s, origin: [12.5 + dx, 0, 9 + dz] };
}
// 몸통: 아래로 3칸(허리 아래 늘어지는 장식), 뒤로 dx칸(배낭·칼집) 여유
function torsoGrid(P, dx = 5, up = 20, pz = 5) {
  const X = P.X ?? 10, TH = P.TH ?? 9, D = P.D ?? 18;
  const g = new VoxGrid(X + dx + 6, TH + up, D + 2 * pz), s = new Sub(g, dx, 3, pz);
  return { g, s, origin: [X / 2 + dx, 3, D / 2 + pz], joint: TH - 1 + 3, far: 3 };
}
// 신발 마무리: 밑창 홈, 끈, 발목 테두리
function bootDeco(g, P, B) {
  const Wx = P.Wx ?? 13, D = P.D ?? 9, b1 = P.boot1 ?? 6, so = P.sole ?? 1;
  for (let x = 0; x < Wx; x++) for (let z = 0; z < D; z++) { if (x % 2 === 0) mul(g, x, 0, z, .72); }
  for (let z = 0; z < D; z++) for (let x = 0; x < Wx; x++) mul(g, x, so, z, 1.12);                   // 밑창 윗선
  if (B.lace) { const zc = Math.floor(D / 2); for (let y = so + 2; y <= b1; y++) for (const z of [zc - 1, zc]) {   // 발등 끈 (가운데 X자)
    let fx = -1; for (let x = Wx - 1; x >= 0; x--) if (g.get(x, y, z) >= 0) { fx = x; break; }
    if (fx >= 0) g.set(fx, y, z, (y + z) % 2 ? B.lace : shade(B.lace, .7));
  } }
  if (B.toe) for (let y = so + 1; y <= so + 2; y++) for (let z = 0; z < D; z++) for (let x = (P.toe ?? 12) - 3; x < Wx; x++) recolor(g, x, y, z, B.toe(x, y, z));
  if (B.collar) for (let z = 0; z < D; z++) for (let x = 0; x < Wx; x++) recolor(g, x, b1, z, B.collar);
  if (B.buckle) for (const z of [0, D - 1]) { g.fill(3, b1 - 2, z, 6, b1 - 2, z, B.buckle); g.set(6, b1 - 2, z, STUD); g.fill(2, b1 - 4, z, 6, b1 - 4, z, B.buckle); g.set(6, b1 - 4, z, STUD); }
}
// 찢어진 바지: 맨살 + 흰 실밥
function rip(g, x, y0, y1, z0, z1, skin) {
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) if (g.get(x, y, z) >= 0) g.set(x, y, z, shade(skin, .92 + hash3(x, y, z) * .1));
  for (let z = z0 - 1; z <= z1 + 1; z++) { if (hash3(z, y0, x) < .7) recolor(g, x, y0 - 1, z, THREAD); if (hash3(z, y1, x) < .7) recolor(g, x, y1 + 1, z, THREAD); }
}
// 옆 주머니 (z면): 덮개 + 단추
function pocket(g, z, x0, x1, y0, y1, c, btn = STUD_D) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) recolor(g, x, y, z, y === y1 ? shade(c, .78) : (x === x0 || x === x1) ? shade(c, .88) : shade(c, 1.06));
  recolor(g, Math.round((x0 + x1) / 2), y1, z, btn);
}
// 징 (둥근 금속 점)
const stud = (g, x, y, z) => g.set(x, y, z, hash3(x, y, z) < .5 ? STUD : 0xbcbab2);
// 바깥쪽 면 (앞팔 = +z, 뒷팔 = -z)
const outZ = (front, D) => front ? D - 1 : 0;

// 모히칸: 정수리 가운데 줄을 따라 가시 다발을 부채꼴로 세움 (밑동은 굵고 끝은 가늘게)
function mohawk(s, o) {
  for (let k = 0; k < o.n; k++) {
    const t = k / (o.n - 1), bx = o.x0 + (o.x1 - o.x0) * t, ang = (t - (o.mid ?? .5)) * o.spread, L = o.len(t);
    for (let i = 0; i <= L; i++) {
      const x = Math.round(bx + Math.sin(ang) * i), y = Math.round(o.base + Math.cos(ang) * i), thin = i > L * (o.thin ?? .55);
      const c = i > L * .8 ? o.cl : i < L * .3 ? o.cd : o.c;
      for (let z = thin ? 8 : 7; z <= (thin ? 9 : 10); z++) { s.set(x, y, z, pick(x, y, z, c, shade(c, .85), shade(c, 1.1), .2, .1)); if (!thin) s.set(x + 1, y, z, pick(x + 1, y, z, c, shade(c, .85), c)); }
    }
  }
}

// 보통 체형 뼈대 수치
const NORMAL = { THn: 9, AU: 7, AL: 9, LU: 8, LL: 10, shZ: 11.5, hipZ: 0.21, shUp: 3 };
const ARM_N = { W: 9, D: 9, AH: 16, f1: 4, w1: 6, fo1: 8, b1: 11 };
const LEG_N = { Wx: 13, D: 9, LH: 18, boot1: 6, toe: 12, px0: 1, px1: 9 };
// 큰 체형 뼈대 수치 (몸통 12칸, 어깨 반지름 크게, 다리 길게)
const BIG = { THn: 12, AU: 9, AL: 11, LU: 10, LL: 11, shZ: 14.5, hipZ: 0.27, shUp: 3 };
const ARM_B = { W: 12, D: 12, AH: 20, f1: 5, w1: 7, fo1: 10, b1: 14, foreBulge: true };
const LEG_B = { Wx: 15, D: 11, LH: 21, boot1: 7, toe: 14, px0: 1, px1: 11 };
const TOR_B = { X: 12, TH: 12, D: 22, inset: y => y <= 1 ? 3 : y <= 4 ? 2 : y <= 6 ? 1 : 0, chestY: [7, 10] };

// =====================================================================================
// 1) 골목 깡패 — 후드를 푹 눌러쓴 길거리 펑크 (뾰족한 후드 실루엣, 붕대 감은 주먹)
// =====================================================================================
function grunt(r) {
  const skin = SK.tan, HO = 0x5a5654, HOt = tone(HO, .18, .08, .9, 1.08), STR = 0xf2eee4, TEE = 0x2a2828;
  // 머리 + 후드
  const hd = headGrid(); const s = hd.s;
  faceBase(s, { skin, stub: 0x4a3424, mouth: 'grit', brow: 0x1a100a, cranium: 3, beardH: 2 });
  for (let z = 3; z <= 14; z++) for (let y = 6; y <= 9; y++) for (let x = 15; x <= 18; x++) mul(s, x, y, z, y >= 8 ? .6 : .8);   // 후드 그늘에 묻힌 이마·눈
  // 후드: 얼굴보다 한참 큰 매끈한 천 덩어리(주름은 줄무늬 명암), 얼굴 앞으로 2칸 더 나와 얼굴이 어두운 구멍 안에 들어앉음
  const cloth = (x, y, z) => shade(HO, 1 + Math.sin(y * .8 + Math.abs(z - 8.5) * .35) * .05 - (x < 8 ? .06 : 0) + (hash3(x, y, z) < .08 ? -.06 : 0));
  const inFace = (x, y, z) => x >= 13 && y <= 9 && z >= 3 && z <= 14;
  ell(s, 11.6, 8.8, 8.5, 8.6, 10.2, 9.4, cloth, (x, y, z) => !inFace(x, y, z) && s.get(x, y, z) < 0 && y >= 0);
  ell(s, 7.5, 13.5, 8.5, 5.2, 5.4, 6.2, cloth, (a, b, c) => s.get(a, b, c) < 0);                         // 둥글게 뒤로 늘어진 정수리 (뾰족하지 않게)
  ell(s, 9.5, 1.2, 8.5, 8.2, 2.6, 11.2, cloth, (a, b, c) => !inFace(a, b, c) && a < 16 && s.get(a, b, c) < 0);   // 어깨까지 흘러내린 천
  // 얼굴 구멍: 안쪽 안감은 아주 어둡게, 가장 바깥 테두리는 밝게 → 어두운 틀이 얼굴을 감쌈
  for (let y = 0; y <= 12; y++) for (let z = 0; z <= 17; z++) {
    let fx = -1; for (let x = 21; x >= 13; x--) if (s.get(x, y, z) >= 0) { fx = x; break; }
    if (fx < 0) continue;
    const opening = (z >= 3 && z <= 14 && y <= 9);
    if (opening) continue;
    const edge = (z === 2 || z === 15) && y <= 10 || (y === 10 || y === 11) && z >= 2 && z <= 15;
    if (edge) { s.set(fx, y, z, shade(HO, 1.3)); for (let x = 15; x < fx; x++) if (s.get(x, y, z) >= 0) s.set(x, y, z, 0x1a1818); }
  }
  for (let z = 3; z <= 14; z++) for (let x = 15; x <= 19; x++) if (s.get(x, 10, z) >= 0 && s.get(x, 9, z) < 0) s.set(x, 10, z, 0x161414);   // 챙 밑면 그늘
  for (let y = 0; y <= 10; y++) for (const z of [3, 14]) for (let x = 16; x <= 19; x++) if (s.get(x, y, z) < 0 && x >= 18) s.set(x, y, z, 0x1a1818);   // 얼굴 양옆 어두운 틈
  for (let x = 0; x <= 19; x++) for (let y = 11; y <= 21; y++) recolor(s, x, y, 8, shade(HO, .78));   // 가운데 솔기
  // 몸통: 열린 후드 집업 + 검은 티 + 목걸이 체인 + 허리 체인
  const T = { X: 10, TH: 9, D: 18 }; const tg = torsoGrid(T); const t = tg.s;
  torsoShape(t, T, (rg, x, y, z) => {
    if (rg === 'belt') return z >= 8 && z <= 9 && x >= 8 ? 0xa8a090 : tone(0x3e2a1c)(x, y, z);
    if ((rg === 'chest' || x >= 9) && z >= 6 && z <= 11) return tone(TEE, .2, .1)(x, y, z);
    if (x >= 9 && (z === 5 || z === 12)) return y % 2 ? 0x8a8680 : 0x6a6662;                          // 지퍼 단
    if (y <= 2 && rg !== 'trap') return (x + z) % 2 ? shade(HO, .82) : shade(HO, .92);                // 밑단 고무줄
    return HOt(x, y, z);
  });
  for (let y = 4; y <= 8; y++) { t.set(11, y, 6, y === 4 ? 0x6a6458 : THREAD); t.set(11, y, 11, y === 4 ? 0x6a6458 : THREAD); }   // 후드 끈
  for (const [y, z] of [[8, 7], [7, 7], [6, 8], [6, 9], [7, 10], [8, 10]]) t.set(11, y, z, STUD);           // 목걸이 체인
  for (let i = 0; i < 6; i++) t.set(4 + i, 1 - (i < 3 ? i : 5 - i), 15 + (i % 2), i % 2 ? STEEL_L : STEEL);   // 허리에서 늘어진 체인
  // 팔: 후드 소매(바깥 줄무늬 두 줄) + 걷어 올린 소맷단 + 붕대 감은 손
  const TAPE = 0xcabfa6, tapeT = (x, y, z) => (x + y * 2 + z) % 5 === 0 ? shade(TAPE, .82) : pick(x, y, z, TAPE, shade(TAPE, .92), 0xd8cfba);
  const mkArm = front => armShape(ARM_N, (rg, x, y, z) => {
    const W = 9, D = 9, oz = outZ(front, D), outer = front ? z >= D - 2 : z <= 1;
    if (rg === 'fist') return x >= W - 1 && y <= 2 ? skinT(skin)(x, y, z) : tapeT(x, y, z);
    if (rg === 'wrist') return tapeT(x, y, z);
    if (rg === 'fore') return y === 8 ? ((x + z) % 2 ? shade(HO, .78) : shade(HO, .9)) : skinT(skin)(x, y, z);
    if (outer && (x === 2 || x === 3 || x === 5 || x === 6)) return STR;                              // 바깥 두 줄 (굵게)
    return HOt(x, y, z);
  }, front);
  const armF = mkArm(true), armB = mkArm(false);
  // 다리: 찢어진 갈색 카고 바지 + 투박한 작업화
  const PANT = 0x5e4430, PT = tone(PANT, .28, .16);
  const leg = legShape({ ...LEG_N, cuff: 2 }, (rg, x, y, z) => rg === 'pant' ? PT(x, y, z) : rg === 'cuff' ? ((x + y) % 3 ? shade(PANT, .8) : shade(PANT, .95)) : rg === 'sole' ? 0x2a2420 : tone(0x4a3020)(x, y, z));
  bootDeco(leg, LEG_N, { lace: 0x9a8a70, collar: 0x3a261a });
  rip(leg, 9, 10, 12, 2, 6, skin);
  for (const z of [0, 8]) pocket(leg, z, 3, 7, 11, 14, PANT);
  return assemble(r, { ...NORMAL, head: hd, torso: tg, armF, armB, leg });
}

// =====================================================================================
// 2) 돌격 헬멧 — 뼈 뿔 두 개 달린 찌그러진 강철 투구 + 징 박힌 붉은 가죽 재킷 + 큰 건틀릿
// =====================================================================================
function charger(r) {
  const skin = SK.ruddy, LEA = desat(0x6a2420, .25), LT = tone(LEA, .3, .16), TANK = 0xc4bba6, GL = 0x5a3a22, GLT = tone(GL, .28, .14);
  const hd = headGrid(30, 34, 42, 4, 12); const s = hd.s;
  faceBase(s, { skin, stache: 0x2a1a10, mouth: 'frown', brow: 0x1e120a, thickBrow: true, stub: 0x7a5a44, beardH: 1 });
  // 투구: 둥근 강철 + 리벳 띠 + 코 가리개 + 녹
  const helm = (x, y, z) => grime(x, y, z, pick(x, y, z, STEEL, STEEL_D, STEEL_L, .26, .14), RUST, .16, 3);
  ell(s, 12, 8.2, 8.5, 7.6, 7.6, 8.8, helm, (x, y) => y >= 8);
  for (let x = 3; x <= 20; x++) for (let z = -1; z <= 18; z++) if (s.get(x, 8, z) >= 0 || s.get(x, 9, z) >= 0) {   // 테두리 띠
    if (s.get(x, 8, z) >= 0) s.set(x, 8, z, shade(STEEL_D, .9)); if (s.get(x, 9, z) >= 0) s.set(x, 9, z, (x + z) % 3 === 0 ? STUD : STEEL_D);
  }
  for (let y = 10; y <= 15; y++) for (let z = 0; z <= 17; z++) if (z === 8 && s.get(19, y, z) >= 0) s.set(19, y, z, STEEL_D);   // 가운데 이음매
  s.fill(19, 5, 8, 19, 7, 9, STEEL); s.set(19, 7, 8, STUD);
  // 뼈 뿔: 옆으로 뻗다가 위로 휘어 오름 (밑동은 갈색 띠)
  // 굵은 뼈 뿔: 옆으로 크게 뻗었다가 위로 휘어 오르며 가늘어짐 (3/4 시점에서도 양쪽 다 보이게 멀리 뻗음)
  const horn = (side) => {
    const P = [[12, 11, 0, 3.4], [12.2, 12, -3, 3.3], [12.6, 13.2, -5.8, 3.0], [13.2, 15.2, -8, 2.6], [13.8, 17.8, -9.2, 2.2], [14.4, 20.4, -9.4, 1.7], [15, 22.6, -8.8, 1.2], [15.6, 24.2, -7.8, .8]];
    for (let i = 0; i < P.length - 1; i++) for (let k = 0; k < 4; k++) {
      const t = k / 4, A = P[i], B = P[i + 1], q = A.map((v, j) => v + (B[j] - v) * t);
      const zz = side > 0 ? 17 - q[2] : q[2], seg = i + t;
      ell(s, q[0], q[1], zz + .5, q[3], q[3], q[3], (a, b, c) => seg < .8 ? 0x5a3e28 : seg > 5.6 ? 0xb8a880 : seg > 4.6 ? 0xdccfae : pick(a, b, c, 0xf2e8cc, 0xe2d6b6, 0xfcf6e6, .25, .12), (a, b, c) => s.get(a, b, c) < 0 || seg > .5);
    }
    for (let k = 0; k < 3; k++) { const q = P[1].map((v, j) => v + (P[2][j] - v) * (k / 3)); ell(s, q[0], q[1], (side > 0 ? 17 - q[2] : q[2]) + .5, q[3] + .25, q[3] * .35, q[3] + .25, () => 0x5a3e28); }   // 밑동 가죽 띠
  };
  horn(-1); horn(1);
  // 몸통: 열린 라이더 재킷(옷깃·징) + 더러운 흰 러닝셔츠
  const T = { X: 10, TH: 9, D: 18 }; const tg = torsoGrid(T); const t = tg.s;
  torsoShape(t, T, (rg, x, y, z) => {
    if (rg === 'belt') return z >= 8 && z <= 9 && x >= 8 ? STUD : tone(0x2e1e14)(x, y, z);
    if ((rg === 'chest' || x >= 9) && z >= 6 && z <= 11) return grime(x, y, z, tone(TANK, .2, .1)(x, y, z), 0x9a8a6a, .1);
    return LT(x, y, z);
  });
  for (let y = 4; y <= 10; y++) for (const z of [5, 12]) { t.set(10, y, z, shade(LEA, .8)); if (y >= 6) t.set(11, y, z + (z < 9 ? -1 : 1) * 0, shade(LEA, 1.1)); }   // 옷깃
  for (let y = 3; y <= 9; y += 2) { stud(t, 11, y, 5); stud(t, 11, y, 12); }
  for (let z = 2; z <= 15; z += 2) stud(t, 5, 11, z);                                                     // 어깨 징 줄
  for (let y = 2; y <= 7; y += 2) { stud(t, 10, y, 3); stud(t, 10, y, 14); }
  // 팔: 재킷 소매(어깨 징) + 넓게 벌어진 징 박힌 건틀릿
  const AP = { ...ARM_N, W: 10, D: 10, foIn: 0, wIn: 0 };
  const mkArm = front => {
    const a = armShape(AP, (rg, x, y, z) => rg === 'fist' || rg === 'wrist' || rg === 'fore' ? (rg === 'fore' && y === 8 ? shade(GL, .7) : GLT(x, y, z)) : LT(x, y, z), front);
    const sb = a.s;
    for (let x = 0; x <= 9; x++) for (let z = 0; z <= 9; z++) { if (sb.get(x, 8, z) >= 0) sb.set(x, 8, z, shade(GL, .7)); }   // 건틀릿 입구 테
    for (let x = 1; x <= 8; x += 3) stud(sb, x, 7, front ? 10 : -1);                                   // 바깥 징 (튀어나옴)
    for (let z = 2; z <= 8; z += 3) stud(sb, 10, 6, z);
    for (let z = 1; z <= 8; z += 2) stud(sb, 10, 4, z);                                                // 주먹 마디 징
    for (let x = 2; x <= 8; x += 3) stud(sb, x, 13, front ? 10 : -1);
    return a;
  };
  const armF = mkArm(true), armB = mkArm(false);
  const PANT = 0x3c3c40, PT = tone(PANT, .28, .16);
  const leg = legShape({ ...LEG_N, cuff: 1 }, (rg, x, y, z) => rg === 'pant' ? PT(x, y, z) : rg === 'cuff' ? shade(PANT, .85) : rg === 'sole' ? 0x242020 : tone(0x523822)(x, y, z));
  bootDeco(leg, LEG_N, { lace: 0x8a7a60, collar: 0x3a2618, toe: () => STEEL_D });
  rip(leg, 9, 10, 12, 2, 5, skin);
  for (const z of [0, 8]) pocket(leg, z, 3, 6, 12, 14, PANT);
  return assemble(r, { ...NORMAL, head: hd, torso: tg, armF, armB, leg });
}

// =====================================================================================
// 3) 벽돌 배달부 — 노란 모자 + 녹색 조끼 + 등에 벽돌을 산더미처럼 쌓은 큰 배낭 (등이 솟은 실루엣)
// =====================================================================================
function thrower(r) {
  const skin = SK.pale, CAP = 0xd8a01e, CT = tone(CAP, .2, .1, .9, 1.08),   // 포인트 색: 진한 겨자색 모자 (동전 노랑보다 어둡고 주황 쪽)
  VEST = 0x4c5632, VT = tone(VEST, .28, .16), TEE = 0xcfc8b8;
  const PACK = 0x5a4028, PKT = tone(PACK, .3, .16), BRICK = 0xb4462e;
  const hd = headGrid(); const s = hd.s;
  faceBase(s, { skin, stub: 0x5a3a22, mouth: 'snarl', brow: 0x2a180c, cranium: 3, beardH: 2 });
  for (const z of [3, 14]) s.fill(12, 3, z, 15, 7, z, 0x4a2c18);                                          // 구레나룻
  for (let y = 5; y <= 9; y++) for (let z = 3; z <= 14; z++) { recolor(s, 7, y, z, 0x4a2c18); recolor(s, 8, y, z, 0x4a2c18); }   // 뒷머리
  // 모자: 둥근 정수리 + 앞으로 뻗은 챙 + 앞 패치
  // 야구 모자: 머리에 꼭 맞는 높은 돔(여섯 쪽 솔기·꼭지 단추) + 앞으로만 뻗은 휜 챙 — 옆·뒤로는 챙 없음
  ell(s, 12.2, 9, 8.5, 6.2, 5.0, 6.8, (x, y, z) => (Math.abs(z - 8.5) < .6 || Math.abs(x - 12.2) < .6) && y >= 12 ? shade(CAP, .84) : CT(x, y, z), (x, y) => y >= 9);   // 낮고 납작한 정수리
  for (let x = 5; x <= 18; x++) for (let z = 1; z <= 16; z++) if (s.get(x, 9, z) >= 0 && (s.get(x + 1, 9, z) < 0 || s.get(x, 9, z + 1) < 0 || s.get(x, 9, z - 1) < 0 || x === 18)) s.set(x, 9, z, shade(CAP, .8));   // 띠
  for (let x = 18; x <= 24; x++) for (let z = 4; z <= 13; z++) {                                           // 길게 앞으로 뻗은 챙 (가장자리는 아래로 휨)
    if (x >= 23 && (z === 4 || z === 13)) continue;
    const y = (z <= 4 || z >= 13) ? 8 : 9;
    s.set(x, y, z, x === 24 ? shade(CAP, .72) : shade(CAP, .9)); if (y === 9) s.set(x, 8, z, 0x4a3a1a);
  }
  stamp(s, ['###', '#.#', '###'], 18, 13, 7, 'x', 0x6a3a1a); s.set(18, 12, 8, 0xd8c8a0);                    // 앞 패치
  s.fill(12, 14, 8, 12, 14, 9, shade(CAP, .7));
  for (let z = 6; z <= 11; z++) recolor(s, 6, 10, z, 0x3a3a3a);                                           // 뒤 조절끈
  // 몸통 + 큰 배낭(뒤로 9칸) + 벽돌 더미
  const T = { X: 10, TH: 9, D: 18 }; const tg = torsoGrid(T, 13, 30, 9); const t = tg.s;
  torsoShape(t, T, (rg, x, y, z) => {
    if (rg === 'belt') return z >= 8 && z <= 9 && x >= 8 ? STUD : tone(0x3a2818)(x, y, z);
    if ((rg === 'chest' || x >= 9) && z >= 6 && z <= 11) return tone(TEE, .2, .1)(x, y, z);
    return VT(x, y, z);
  });
  for (const z of [3, 14]) { for (let y = 3; y <= 5; y++) for (let zz = z - 1; zz <= z + 1; zz++) t.set(10, y, zz, y === 5 ? shade(VEST, .75) : shade(VEST, 1.08)); t.set(10, 5, z, STUD); }   // 조끼 주머니
  for (const z of [4, 13]) for (let y = 2; y <= 10; y++) t.set(y >= 9 ? 6 : 10, y, z, shade(PACK, .8));      // 멜빵
  for (const z of [4, 13]) { t.set(10, 6, z, STUD); t.set(10, 6, z + (z < 9 ? 1 : -1), STUD_D); }
  rbox(t, -11, 0, -3, -1, 15, 20, PKT, 2);                                                               // 배낭 몸체
  for (let y = 2; y <= 7; y++) for (let z = 3; z <= 14; z++) t.set(-11, y, z, y === 7 ? shade(PACK, .75) : shade(PACK, 1.05));   // 뒤 주머니
  t.set(-11, 7, 8, STUD); t.set(-11, 7, 9, STUD); t.set(-11, 4, 6, STUD_D); t.set(-11, 4, 11, STUD_D);
  for (const z of [-1, 18]) for (let y = 3; y <= 9; y++) for (let x = -7; x <= -3; x++) t.set(x, y, z, y === 9 ? shade(PACK, .75) : shade(PACK, 1.02));   // 옆 주머니
  for (let x = -10; x <= -1; x++) for (const z of [0, 17]) t.set(x, 12, z, 0x3a2a1a);                  // 끈
  // 벽돌 더미: 머리 뒤에 어깨보다 넓게, 계단식으로 쌓은 붉은 벽돌 (줄눈·윗면 구멍)
  const brickC = (x, y, z) => {
    const course = Math.floor((y - 16) / 2), off = course % 2 ? 3 : 0, bz = Math.floor((z + 8 + off) / 6), bx = Math.floor((x + 20 + off) / 4);
    const joint = (z + 8 + off) % 6 === 0 || (x + 20 + off) % 4 === 0;
    const b = shade(BRICK, .86 + hash3(bz, course, bx) * .26);
    return joint ? 0x6a3a2a : pick(x, y, z, b, shade(b, .9), shade(b, 1.08), .2, .1);
  };
  const layers = [[16, 19, -12, -2, -8, 25], [20, 23, -12, -3, -7, 24], [24, 25, -11, -4, -2, 6], [24, 25, -10, -5, 13, 21]];   // 어깨보다 넓은 납작한 더미 + 위에 몇 덩이
  for (const [y0, y1, x0, x1, z0, z1] of layers) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) t.set(x, y, z, brickC(x, y, z));
  for (const [y0, y1, x0, x1, z0, z1] of layers) for (let x = x0 + 1; x < x1; x += 2) for (let z = z0 + 1; z < z1; z += 3) if (t.get(x, y1 + 1, z) < 0) t.set(x, y1, z, 0x4a1a12);   // 윗면 구멍
  // 팔: 흰 반팔 + 맨 팔뚝 + 손목 붕대
  const mkArm = front => armShape(ARM_N, (rg, x, y, z) => {
    if (rg === 'sh' || (rg === 'bic' && y >= 10)) return y === 10 ? shade(TEE, .85) : tone(TEE, .2, .1)(x, y, z);
    if (rg === 'wrist') return (x + y + z) % 3 ? 0xc8bca4 : 0xa89c84;
    return skinT(skin)(x, y, z);
  }, front);
  const armF = mkArm(true), armB = mkArm(false);
  const PANT = 0x5a4632, PT = tone(PANT, .28, .16);
  const leg = legShape({ ...LEG_N, cuff: 2 }, (rg, x, y, z) => rg === 'pant' ? PT(x, y, z) : rg === 'cuff' ? ((x + y) % 3 ? shade(PANT, .8) : shade(PANT, .95)) : rg === 'sole' ? 0x2a2420 : tone(0x4a3222)(x, y, z));
  bootDeco(leg, LEG_N, { lace: 0x9a8a70, collar: 0x36241a });
  rip(leg, 9, 11, 12, 3, 6, skin); rip(leg, 9, 15, 15, 2, 3, skin);
  for (const z of [0, 8]) pocket(leg, z, 3, 7, 11, 14, PANT);
  return assemble(r, { ...NORMAL, head: hd, torso: tg, armF, armB, leg });
}

// =====================================================================================
// 4) 맨홀 방패병 — 꼬리 날리는 회색 두건 + 수염 + 올리브 민소매 + 울퉁불퉁한 맨팔 (방패는 따로)
// =====================================================================================
function shielder(r) {
  const skin = SK.olive, BAN = 0x6e6a66, BT = tone(BAN, .3, .16), TANK = 0x535a30, TT = tone(TANK, .3, .16);
  const hd = headGrid(); const s = hd.s;
  faceBase(s, { skin, stub: 0x3a2a1e, mouth: 'frown', brow: 0x1a100a, thickBrow: true, beardH: 3, cranium: 3 });
  for (let y = 0; y <= 1; y++) for (let z = 4; z <= 13; z++) s.set(18, y, z, hash3(z, y, 3) < .6 ? 0x3a2a1e : 0x2a1c12);   // 덥수룩한 턱수염
  s.fill(18, 0, 6, 18, -0, 11, 0x2a1c12);
  for (let x = 7; x <= 16; x++) for (let y = 0; y <= 5; y++) for (const z of [2, 3, 14, 15]) if (s.get(x, y, z) >= 0 && y <= 3) s.set(x, y, z, 0x3a2a1e);
  // 두건: 머리를 덮고 뒤에서 묶어 두 꼬리가 뒤로 날림
  ell(s, 12, 8.6, 8.5, 6.6, 5.4, 7.2, (x, y, z) => (y === 9 && x >= 16) ? shade(BAN, .82) : BT(x, y, z), (x, y) => y >= 9);
  for (let z = 2; z <= 15; z++) for (let y = 7; y <= 8; y++) if (s.get(18, y, z) < 0 && s.get(17, y, z) >= 0 && y === 8) s.set(18, y, z, shade(BAN, .9));
  s.fill(4, 9, 7, 5, 11, 10, shade(BAN, .78)); s.set(4, 10, 8, shade(BAN, .65));                        // 매듭
  const tail = (z0, y0, dy) => { for (let i = 0; i <= 4; i++) { const x = 3 - i, y = Math.round(y0 - i * dy + (i % 3 === 1 ? .7 : 0)); g2(x, y, z0 + (i >= 4 ? 1 : 0)); } };
  const g2 = (x, y, z) => { s.set(x, y, z, BT(x, y, z)); s.set(x, y - 1, z, shade(BAN, .78)); s.set(x, y, z + 1, BT(x, y, z + 1)); };
  tail(6, 10, 1.1); tail(10, 10, 1.5);   // 짧게 아래로 늘어짐
  // 몸통: 올리브 민소매(겨드랑이가 깊게 파임), 굵은 맨 어깨
  const T = { X: 10, TH: 9, D: 18 }; const tg = torsoGrid(T); const t = tg.s;
  torsoShape(t, T, (rg, x, y, z) => {
    if (rg === 'belt') return z >= 8 && z <= 9 && x >= 8 ? STUD : tone(0x3a2818)(x, y, z);
    if (rg === 'trap') return (z >= 4 && z <= 5) || (z >= 12 && z <= 13) ? shade(TANK, .9) : skinT(skin)(x, y, z);
    if (y >= 6 && (z <= 2 || z >= 15)) return skinT(skin)(x, y, z);
    if (y >= 8 && x >= 8 && z >= 6 && z <= 11) return skinT(skin)(x, y, z);                              // 파인 목둘레
    return grime(x, y, z, TT(x, y, z), 0x3a3a22, .1);
  });
  // 팔: 크고 울퉁불퉁한 맨팔 + 손가락 없는 장갑 + 징 박힌 손목 띠
  const AP = { ...ARM_N, W: 10, D: 10, foreBulge: true };
  const DIRT = 0x8a5a3a;
  const mkArm = front => {
    const a = armShape(AP, (rg, x, y, z) => {
      if (rg === 'fist') return y >= 2 || x < 9 ? tone(0x2a2420)(x, y, z) : skinT(skin)(x, y, z);
      if (rg === 'wrist') return y === 6 ? 0x1e1a18 : 0x2a2420;
      return grime(x, y, z, skinT(skin)(x, y, z), DIRT, .08, 7);
    }, front);
    for (let x = 1; x <= 8; x += 2) { stud(a.s, x, 6, front ? 9 : 0); } for (let z = 1; z <= 8; z += 2) stud(a.s, 9, 6, z);
    for (let z = 1; z <= 8; z++) mul(a.s, 5, 12, z, .86);                                                  // 어깨·이두 경계
    return a;
  };
  const armF = mkArm(true), armB = mkArm(false);
  const PANT = 0x5a5a34, PT = tone(PANT, .28, .16);
  const leg = legShape({ ...LEG_N, cuff: 1 }, (rg, x, y, z) => rg === 'pant' ? PT(x, y, z) : rg === 'cuff' ? shade(PANT, .8) : rg === 'sole' ? 0x262220 : tone(0x4a3020)(x, y, z));
  bootDeco(leg, LEG_N, { lace: 0x8a7a60, collar: 0x36241a });
  rip(leg, 9, 10, 11, 4, 6, skin);
  for (const z of [0, 8]) pocket(leg, z, 2, 7, 11, 15, PANT);
  return assemble(r, { ...NORMAL, head: hd, torso: tg, armF, armB, leg, opts: { brawl: { arm: .5, hand: .5, leg: .24 }, armSpread: -.2 } });   // 두 팔을 앞으로 뻗어 방패 뒤에 둠
}

// =====================================================================================
// 5) 폭주족 — 불꽃 무늬 광택 빨강 풀페이스 헬멧 + 어깨 가시 가죽 조끼 + 문신 맨팔
// =====================================================================================
function biker(r) {
  const skin = SK.tan, HEL = 0xd8341a,   // 포인트 색: 광택 나는 주홍 헬멧 (피의 진홍과 구별되게 주황 쪽)
  LEA = 0x242020, LT = tone(LEA, .3, .14), TANK = 0xbdb4a2, TAT = 0x2a2226;
  const hd = headGrid(); const s = hd.s;
  // 헬멧: 머리보다 큰 둥근 공 + 검은 바이저 + 턱 환기구 + 옆 볼트 + 불꽃
  const flame = (x, y, z) => {          // 옆면 불꽃: 뒤쪽 아래에서 앞쪽으로 혀처럼 뻗음
    if (x > 9 || x < 2 || y < 3 || y > 14) return 0;
    const d = ((y + x * .7) % 4.4 + 4.4) % 4.4, len = 9 - Math.floor((y + x * .7) / 4.4) * 1.5;   // 뒤에서 앞으로 뻗는 불꽃 혀
    if (x > len) return 0;
    return d < .9 && x < len - 2 ? 2 : d < 2.1 ? 1 : 0;
  };
  ell(s, 12, 7.6, 8.5, 8.0, 8.6, 8.8, (x, y, z) => {
    const side = z <= 3 || z >= 14;
    const f = side ? flame(x, y, z) : (y >= 12 && x <= 15 && Math.abs(z - 8.5) < 6 && ((x + Math.round(Math.abs(z - 8.5))) % 6 < 2) ? 1 : 0);
    if (f === 2) return 0xe8b030; if (f === 1) return 0xd8661c;
    return y >= 12 && Math.abs(z - 8.5) < 1.6 ? 0xffb08a : y >= 13 && x >= 12 && Math.abs(z - 8.5) < 3 ? 0xf86a44 : pick(x, y, z, HEL, shade(HEL, .85), shade(HEL, 1.15), .2, .1);
  });
  // 바이저: 앞에서 옆까지 감싸는 검은 띠 (3/4 시점에서도 보이게)
  const surf = (x, y, z) => s.get(x + 1, y, z) < 0 || s.get(x - 1, y, z) < 0 || s.get(x, y, z + 1) < 0 || s.get(x, y, z - 1) < 0 || s.get(x, y + 1, z) < 0;
  for (let y = 4; y <= 9; y++) for (let z = -1; z <= 18; z++) for (let x = 9; x <= 21; x++) {
    if (s.get(x, y, z) < 0 || !surf(x, y, z)) continue;
    if (x >= 15 || ((z <= 3 || z >= 14) && x >= 10)) s.set(x, y, z, y === 8 && (x + z) % 5 === 0 ? 0x5a5e66 : y === 9 || y === 4 ? 0x0e0e10 : 0x1c1c22);
  }
  // 턱 가리개: 앞으로 한 칸 튀어나온 턱 + 환기구
  for (let y = 0; y <= 3; y++) for (let z = 4; z <= 13; z++) { let fx = -1; for (let x = 21; x >= 10; x--) if (s.get(x, y, z) >= 0) { fx = x; break; } if (fx > 0) { s.set(fx + 1, y, z, y === 3 ? shade(HEL, .7) : (y === 1 && z % 2 === 0 && z > 4 && z < 13) ? 0x1a1a1a : pick(fx, y, z, HEL, shade(HEL, .86), shade(HEL, 1.1))); } }
  for (const z of [-1, 18]) { s.fill(11, 6, z, 13, 8, z, 0x6a6a6e); s.set(12, 7, z, STUD); }
  // 몸통: 징·가시 박힌 가죽 조끼 + 흰 러닝 + 체인 목걸이
  const T = { X: 10, TH: 9, D: 18 }; const tg = torsoGrid(T); const t = tg.s;
  torsoShape(t, T, (rg, x, y, z) => {
    if (rg === 'belt') return z >= 8 && z <= 9 && x >= 8 ? STUD : tone(0x1a1616)(x, y, z);
    if ((rg === 'chest' || x >= 9) && z >= 6 && z <= 11) return tone(TANK, .2, .1)(x, y, z);
    return LT(x, y, z);
  });
  for (let y = 3; y <= 8; y++) { stud(t, 10, y, 5); stud(t, 10, y, 12); }
  for (const [y, z] of [[8, 7], [7, 7], [6, 8], [6, 9], [7, 10], [8, 10], [5, 8]]) t.set(11, y, z, STUD);
  for (const z of [2, 4, 13, 15]) spike(t, 5, 11, z, [0, 1, 0], 3, STEEL_L);                                // 어깨 가시
  for (const z of [3, 14]) spike(t, 8, 10, z, [0, 1, 0], 2, STEEL_L);
  for (let y = 2; y <= 8; y += 2) for (const z of [0, 17]) stud(t, 5, y, z < 9 ? -1 : 18);
  // 팔: 맨팔(불꽃 문신) + 징 박힌 손가락 없는 장갑 + 손목 가시 띠
  const AP = { ...ARM_N, W: 10, D: 10 };
  const mkArm = front => {
    const a = armShape(AP, (rg, x, y, z) => {
      if (rg === 'fist') return y >= 2 || x < 9 ? tone(0x1c1a1a)(x, y, z) : skinT(skin)(x, y, z);
      if (rg === 'wrist') return 0x1a1818;
      return skinT(skin)(x, y, z);
    }, front);
    const sb = a.s, oz = front ? 9 : 0;
    stamp(sb, ['..#..', '.##.#', '##.##', '.#.#.', '#...#', '.###.'], 2, 14, oz, 'z', TAT);                // 바깥 위팔 불꽃 문신
    for (let z = 1; z <= 8; z += 2) stud(sb, 10, 4, z);
    for (let x = 1; x <= 8; x += 3) spike(sb, x, 6, front ? 10 : -1, [0, 0, front ? 1 : -1], 2, STEEL_L);
    for (let z = 1; z <= 8; z += 3) spike(sb, 10, 6, z, [1, 0, 0], 2, STEEL_L);
    return a;
  };
  const armF = mkArm(true), armB = mkArm(false);
  const JEAN = 0x4a5874, JT = tone(JEAN, .3, .16);
  const leg = legShape({ ...LEG_N, cuff: 2 }, (rg, x, y, z) => rg === 'pant' ? JT(x, y, z) : rg === 'cuff' ? (y === 8 ? 0x7a8aa4 : 0x5e6e8a) : rg === 'sole' ? 0x1e1c1c : tone(0x262222)(x, y, z));
  bootDeco(leg, LEG_N, { buckle: 0x4a4a4e, collar: 0x161414, toe: () => 0x3a3a3e });
  rip(leg, 9, 10, 12, 2, 6, skin); rip(leg, 9, 15, 15, 3, 5, skin); rip(leg, 4, 13, 14, 0, 0, skin);
  return assemble(r, { ...NORMAL, head: hd, torso: tg, armF, armB, leg, opts: { brawl: { arm: .05, hand: .55, leg: .24 }, armSpread: .36, ride: { arm: .45, hand: .5 } } });   // 큰 팔: 주먹을 더 낮게, 오토바이에선 팔을 낮게 뻗어 핸들
}

// =====================================================================================
// 6) 그림자 닌자 — 검은 두건·복면 + 뒤로 길게 날리는 빨간 머리띠 꼬리 + 등에 멘 칼집 + 빨간 허리띠
// =====================================================================================
function ninja(r) {
  const skin = SK.tan, CL = 0x3a3638, CT = tone(CL, .3, .16, .8, 1.22), GI = tone(0x423e40, .3, .16, .82, 1.2), GI2 = tone(0x524c4c, .3, .14, .85, 1.15), PNT = 0x2c2829, RED = 0xe0401c, RT = tone(RED, .2, .1, .88, 1.1);   // 포인트 색: 주홍 머리띠·허리띠
  const hd = headGrid(34, 30, 28, 12, 5); const s = hd.s;
  faceBase(s, { skin, mouth: 'none', nose: false, brow: 0x140c08, stub: 0, ears: false });
  // 두건: 머리를 감싸고 눈만 드러남 (복면은 코까지)
  ell(s, 11.8, 8.2, 8.5, 7.2, 9.0, 8.4, CT, (x, y, z) => !(x >= 15 && y >= 4 && y <= 6 && z >= 3 && z <= 14) && s.get(x, y, z) < 0);
  for (let y = 0; y <= 3; y++) for (let z = 3; z <= 14; z++) { s.set(18, y, z, CT(18, y, z)); s.set(17, y, z, CT(17, y, z)); }   // 복면
  for (let z = 4; z <= 13; z++) s.set(19, 3, z, shade(CL, 1.2)); s.fill(19, 2, 8, 19, 2, 9, shade(CL, 1.1));
  for (let z = 3; z <= 14; z++) if (s.get(18, 6, z) < 0) s.set(18, 6, z, 0x140c08);
  // 빨간 머리띠: 이마를 감고 뒤로 매듭, 두 꼬리가 길게 물결치며 날림
  for (let x = 4; x <= 20; x++) for (let z = -1; z <= 18; z++) for (let y = 7; y <= 8; y++) {
    if (s.get(x, y, z) >= 0 && (s.get(x + 1, y, z) < 0 || s.get(x - 1, y, z) < 0 || s.get(x, y, z + 1) < 0 || s.get(x, y, z - 1) < 0)) s.set(x, y, z, y === 8 ? RED : shade(RED, .8));
  }
  s.fill(3, 7, 7, 3, 9, 10, shade(RED, .7));
  const tail = (z0, y0, len, amp, ph) => { for (let i = 0; i < len; i++) { const x = 2 - i, y = Math.round(y0 + Math.sin(i * .7 + ph) * amp - i * .12), z = z0 + Math.round(i * .15); s.set(x, y, z, RT(x, y, z)); s.set(x, y - 1, z, shade(RED, .75)); s.set(x, y, z + 1, RT(x, y, z + 1)); } };
  tail(6, 9, 13, 1.3, 0); tail(10, 7, 11, 1.1, 1.8);
  // 몸통: 검은 도복 + 가슴 가로지르는 가죽끈(버클) + 빨간 허리띠(옆으로 늘어진 매듭) + 등에 칼집
  const T = { X: 10, TH: 9, D: 18 }; const tg = torsoGrid(T, 6); const t = tg.s;
  torsoShape(t, T, (rg, x, y, z) => {
    if (y <= 2 && rg !== 'trap') return RT(x, y, z);
    if (rg === 'trap') return CT(x, y, z);
    if ((x >= 9) && Math.abs(z - (17 - y * 1.3)) < 1) return shade(CL, 1.55);                               // 여밈선 (밝게)
    if (x >= 9 && z > 17 - y * 1.3) return GI2(x, y, z);                                                    // 겹친 앞판 (한 톤 밝게)
    return y % 3 === 0 ? shade(CL, .82) : GI(x, y, z);                                                      // 가로 주름
  });
  for (let y = 0; y <= 2; y++) for (let x = 2; x <= 9; x++) { recolor(t, x, y, 3, RT(x, y, 3)); }
  for (let i = 0; i < 5; i++) { t.set(8 - (i >> 1), -i * .8 | 0, 15, RT(8, i, 15)); t.set(9 - (i >> 1), -(i * .8 | 0), 16, shade(RED, .75)); }   // 늘어진 매듭 꼬리
  t.fill(10, 0, 13, 11, 2, 15, RT(10, 1, 14));
  line(t, 10, 9, 3, 10, 3, 14, (x, y, z) => 0x4a3424); line(t, 11, 9, 3, 11, 3, 14, (x, y, z) => 0x3a2818);  // 가슴 끈
  t.fill(11, 6, 7, 11, 7, 8, 0x8a8478); t.set(12, 6, 7, STUD);
  line(t, -1, 9, 3, -1, 3, 14, 0x3a2818);
  // 칼집: 등에 대각선, 손잡이가 오른 어깨 위로 솟음
  for (let i = 0; i <= 22; i++) {
    const y = -2 + i, z = Math.round(i * .86), x = i >= 13 ? -4 : -2 - Math.round(i / 7);
    const c = i >= 15 ? ((i % 2) ? 0x1a1414 : 0x8a1a1a) : i === 14 ? 0xa88a2a : i <= 1 ? 0x8a8478 : shade(0x2a1e1a, i % 4 ? 1 : 1.3);
    t.set(x, y, z, c); t.set(x - 1, y, z, shade(c, .85)); if (i === 14) { t.set(x, y, z + 1, c); t.set(x, y, z - 1, c); t.set(x - 1, y, z + 1, c); t.set(x - 1, y, z - 1, c); }
  }
  // 팔: 헐렁한 검은 소매 + 회색 팔 붕대 + 맨주먹
  const WR = 0x5e5a56;
  const mkArm = front => armShape({ ...ARM_N, foIn: 1 }, (rg, x, y, z) => {
    if (rg === 'fist') return skinT(skin)(x, y, z);
    if (rg === 'wrist' || rg === 'fore') return (y + (x + z > 8 ? 1 : 0)) % 2 ? WR : shade(WR, .8);
    return y === 9 || y === 12 ? shade(CL, .78) : GI(x, y, z);                                               // 소매 주름
  }, front);
  const armF = mkArm(true), armB = mkArm(false);
  const leg = legShape({ ...LEG_N, cuff: 0 }, (rg, x, y, z) => {
    if (rg === 'pant') return y >= 9 && y <= 12 ? ((y + z) % 3 ? WR : shade(WR, .78)) : tone(PNT, .3, .16, .8, 1.25)(x, y, z);      // 정강이 붕대
    return rg === 'sole' ? 0x161214 : tone(0x1e1a1c)(x, y, z);
  });
  for (let y = 13; y <= 17; y++) for (let z = 0; z < 9; z++) { if (leg.get(10, y, z) < 0 && y <= 15) leg.set(10, y, z, CT(10, y, z)); }   // 헐렁한 바지
  bootDeco(leg, LEG_N, { collar: 0x2a2626 });
  for (let x = 6; x <= 12; x++) for (let y = 0; y <= 4; y++) recolor(leg, x, y, 4, 0x0e0c0c);                 // 버선 발가락 홈
  return assemble(r, { ...NORMAL, head: hd, torso: tg, armF, armB, leg });
}

// =====================================================================================
// 7) 폭죽 꼬마 — 도화선 붙은 둥근 폭탄 헬멧(해골·귀마개) + 미친 웃음 + 줄무늬 티 + 빨간 운동화
// =====================================================================================
function bomber(r) {
  const skin = SK.kid, HEL = 0x2e2c2e, RED = desat(0xa8302a, .2), WH = 0xd8d0c0;
  const HT = (x, y, z) => pick(x, y, z, HEL, shade(HEL, .92), shade(HEL, 1.08), .12, .05);   // 매끈한 쇠 껍데기 (얼룩 적게)
  const hd = headGrid(); const s = hd.s;
  faceBase(s, { skin, mouth: 'grin', brow: 0x3a2214, wild: true, eyeH: 3, eyeY: 4, angry: true, top: 9, jaw: true });
  s.set(17, 2, 3, 0xd88a6a); s.set(17, 3, 14, 0xd88a6a); s.set(16, 5, 15, 0xd88a6a);                       // 볼 상처
  s.fill(17, 4, 13, 17, 4, 14, 0xd8ccb0); s.set(17, 5, 14, 0xc0b498);                                       // 반창고
  // 폭탄 헬멧: 머리보다 훨씬 큰 매끈한 공 + 밝은 반사 + 테두리 + 귀마개 + 앞이마 해골 + 도화선
  ell(s, 11.6, 10.4, 8.5, 9.8, 10.2, 10.6, HT, (x, y) => y >= 8 && !(x >= 17 && y <= 8));
  ell(s, 15.5, 15.5, 6.5, 2.6, 2.2, 2.4, () => 0x6a686c, (x, y, z) => s.get(x, y, z) >= 0 && (s.get(x + 1, y, z) < 0 || s.get(x, y + 1, z) < 0));   // 반사광
  for (let x = 1; x <= 22; x++) for (let z = -2; z <= 19; z++) if (s.get(x, 8, z) >= 0 && s.get(x, 7, z) < 0 && (x <= 16 || z <= 2 || z >= 15)) s.set(x, 8, z, 0x4a484c);
  for (let z = 3; z <= 14; z++) { s.set(19, 8, z, 0x4a484c); s.set(20, 8, z, 0x3a383c); }                  // 이마 위 테
  for (const z of [-3, 20]) { ell(s, 11.5, 6, z + .5, 3.0, 3.0, 1.3, (x, y) => (x + y) % 3 ? 0x6a6a6e : 0x8a8a8e); s.set(11, 6, z + (z < 0 ? -1 : 1), STUD); }
  // 해골: 헬멧 앞면(이마 위)에 — 앞에서 보이는 가장 바깥 복셀에 칠함
  const SKULL = ['.#####.', '#######', '#..#..#', '#######', '.##.##.', '..###..', '..#.#..'];
  SKULL.forEach((row, rr) => [...row].forEach((ch, i) => {
    const y = 17 - rr, z = 5 + i; let fx = -1; for (let x = 23; x >= 10; x--) if (s.get(x, y, z) >= 0) { fx = x; break; }
    if (fx > 0) s.set(fx, y, z, ch === '#' ? 0xf8f4ea : 0x101010);   // 포인트 색: 밝은 해골
  }));
  s.fill(10, 20, 7, 13, 21, 10, 0x5a5a5e); s.fill(11, 22, 8, 12, 22, 9, 0x6a6a6e);                       // 도화선 꽂이
  line(s, 12, 23, 9, 10, 26, 9, 0x8a6a3a); s.set(9, 27, 9, 0x8a6a3a);
  for (const [x, y, z, c] of [[9, 28, 9, 0xfff4c0], [8, 28, 9, 0xffa030], [10, 29, 9, 0xffe060], [9, 29, 10, 0xff7a20], [8, 29, 8, 0xffd040], [10, 28, 10, 0xffa030], [9, 30, 9, 0xffffe8], [7, 27, 9, 0xff7a20], [10, 30, 8, 0xffd040], [8, 30, 10, 0xffe060], [9, 31, 9, 0xfff4c0], [11, 29, 10, 0xff9a30]]) s.set(x, y, z, c);
  // 몸통: 넓고 통통한 꼬마 몸 (볼록한 배) — 빨강·흰 줄무늬 티 + 가방 끈 + 허리띠
  const T = { X: 11, TH: 8, D: 20, inset: y => y <= 1 ? 2 : y <= 2 ? 1 : 0, trap: 2, chestY: [4, 6], belly: [1, 5, 1] };
  const tg = torsoGrid(T); const t = tg.s;
  torsoShape(t, T, (rg, x, y, z) => {
    if (rg === 'belt' && y === 0) return z >= 9 && z <= 10 && x >= 9 ? STUD : 0x4a3424;
    if (rg === 'trap') return skinT(skin)(x, y, z);
    return grime(x, y, z, ((y >> 0) % 2 ? RED : WH), 0x8a7a6a, .07);
  });
  line(t, 12, 7, 3, 12, 1, 15, 0x6a4a2a); line(t, 11, 7, 3, 11, 1, 15, 0x5a3a20); line(t, -1, 7, 16, -1, 1, 3, 0x6a4a2a);
  rbox(t, 10, -2, 13, 12, 1, 17, tone(0x7a5432), 1); t.set(12, 0, 15, STUD_D);                            // 작은 가방
  for (let y = -2; y <= 1; y++) for (let x = 1; x <= 4; x++) t.set(x, y, -1, [0xa8302a, 0xc84a3a, 0x8a2622][(x + y + 3) % 3]);   // 옆에 찬 폭죽 다발
  // 팔: 줄무늬 반팔 + 짧고 굵은 팔 + 붕대 + 큰 주먹
  const AP = { W: 9, D: 9, AH: 13, f1: 4, w1: 5, fo1: 8, b1: 10 };
  const mkArm = front => armShape(AP, (rg, x, y, z) => {
    if (rg === 'sh' || (rg === 'bic' && y >= 10)) return y % 2 ? RED : WH;
    if (rg === 'wrist' || (rg === 'fore' && y === 6)) return (x + y + z) % 3 ? 0xd8ccb0 : 0xb8ac94;
    return skinT(skin)(x, y, z);
  }, front);
  const armF = mkArm(true), armB = mkArm(false);
  // 다리: 굵고 짧은 다리 — 청반바지 + 맨무릎(반창고) + 빨간 줄 양말 + 큰 빨간 운동화
  const LP = { Wx: 13, D: 10, LH: 12, boot1: 4, toe: 12, px0: 1, px1: 9 };
  const DEN = 0x3e4a66;
  const leg = legShape(LP, (rg, x, y, z) => {
    if (rg === 'pant') return y >= 8 ? tone(DEN, .3, .16)(x, y, z) : y <= 6 ? (y === 6 ? RED : WH) : skinT(skin)(x, y, z);
    if (rg === 'sole') return 0xd8d0c0;
    return tone(RED, .22, .12)(x, y, z);
  });
  for (let z = 0; z < 10; z++) for (let x = 0; x <= 10; x++) if (leg.get(x, 8, z) >= 0 && hash3(x, 8, z) < .5) leg.set(x, 8, z, THREAD);   // 해진 밑단
  for (let y = 8; y <= 11; y++) for (let z = 0; z < 10; z++) for (const x of [0, 10]) if (leg.get(x === 0 ? 1 : 9, y, z) >= 0) leg.set(x, y, z, tone(DEN, .3, .16)(x, y, z));   // 통 넓은 반바지
  for (let z = 0; z < 10; z++) for (let x = 8; x < 13; x++) { recolor(leg, x, 2, z, WH); }                  // 흰 앞코
  bootDeco(leg, LP, { lace: WH });
  leg.fill(9, 7, 4, 9, 7, 5, 0xd8ccb0);
  return assemble(r, { THn: 8, AU: 5, AL: 8, LU: 5, LL: 7, shZ: 12.5, hipZ: 0.22, shUp: 2, head: hd, torso: tg, armF, armB, leg, legO: [5.5, 5],
    opts: { brawl: { arm: .15, hand: .75, leg: .22 }, armSpread: .4, legSpread: .14 } });
}

// =====================================================================================
// 8) 철거 덩치 (큰 체형) — 검은 모히칸 + 더러운 흰 러닝 + 문신한 거대한 팔 + 징 손목띠 + 체인 허리띠
// =====================================================================================
function brute(r) {
  const skin = SK.tan, TANK = 0xc8c0aa, PANT = 0x2e3450, TAT = 0x2a2226;
  const hd = headGrid(); const s = hd.s;
  faceBase(s, { skin, mouth: 'snarl', brow: 0x140c08, thickBrow: true, stub: 0x6a4a34, cranium: 3.2, earring: STUD, jaw: true, scalp: (x, y, z) => Math.abs(z - 8.5) < 2.5 ? 0x2a1e18 : shade(SK.tan, hash3(x, y, z) < .4 ? .82 : .9) });
  s.set(17, 7, 4, 0xe0a888); s.set(17, 8, 5, 0xe0a888); s.set(17, 6, 4, 0xe0a888);                       // 흉터
  // 무거운 턱·광대·눈두덩: 턱이 옆과 앞으로 튀어나오고 이마뼈가 눈을 덮음
  for (let y = 0; y <= 3; y++) for (let x = 9; x <= 16; x++) for (const z of [1, 2, 15, 16]) if (!(y === 3 && (z === 1 || z === 16))) s.set(x, y, z, hash3(x, y, z) < .6 ? 0x7a5a40 : shade(SK.tan, .86));
  for (let z = 4; z <= 13; z++) { s.set(18, 0, z, hash3(z, 0, 18) < .6 ? 0x7a5a40 : shade(SK.tan, .9)); s.set(17, 0, z, shade(SK.tan, .86)); }
  for (let z = 2; z <= 15; z++) { s.set(18, 7, z, shade(SK.tan, .9)); s.set(19, 6, z, z <= 7 || z >= 10 ? 0x140c08 : shade(SK.tan, .82)); }
  // 모히칸: 앞이 높은 검은 가시 다발 (머리 반 높이)
  mohawk(s, { n: 9, x0: 4, x1: 17, base: 11, spread: .35, mid: .4, len: t => 8 + t * 3, c: 0x221a16, cd: 0x2e2420, cl: 0x141010 });
  // 몸통 (큰 체형): 구멍 나고 얼룩진 흰 러닝 + 맨어깨 + 체인 허리띠
  const tg = torsoGrid(TOR_B); const t = tg.s;
  torsoShape(t, TOR_B, (rg, x, y, z) => {
    if (rg === 'belt') return z >= 10 && z <= 11 && x >= 10 ? STUD : tone(0x3a281a)(x, y, z);
    if (rg === 'trap' || (y >= 8 && (z <= 3 || z >= 18))) return (rg === 'trap' && ((z >= 5 && z <= 6) || (z >= 15 && z <= 16))) ? TANK : skinT(skin)(x, y, z);
    if (y >= 10 && x >= 10 && z >= 7 && z <= 14) return skinT(skin)(x, y, z);
    return grime(x, y, z, tone(TANK, .22, .12)(x, y, z), hash3(x, y, z * 3) < .5 ? 0x8a7656 : 0x6a5a40, .14, 5);
  });
  for (const [y, z] of [[5, 6], [5, 7], [6, 7], [4, 14], [3, 13]]) t.set(13, y, z, skinT(skin)(13, y, z));    // 러닝 구멍
  for (let i = 0; i < 16; i++) { const z = 3 + i, y = -1 + Math.round(Math.abs(Math.sin(i / 15 * Math.PI)) * -2) + 1; t.set(13, y, z, i % 2 ? STEEL_L : STEEL); }   // 늘어진 체인
  for (let i = 0; i < 4; i++) t.set(12, -i, 4, i % 2 ? STEEL_L : STEEL);
  // 팔 (큰 체형): 거대한 맨팔 + 해골·문양 문신 + 징 손목띠
  const mkArm = front => {
    const a = armShape(ARM_B, (rg, x, y, z) => rg === 'wrist' ? (y === 7 ? 0x1a1616 : 0x241e1c) : skinT(skin)(x, y, z), front);   // 포인트 색: 밝은 강철 가시 손목띠
    const sb = a.s, oz = front ? 11 : 0;
    stamp(sb, ['.####.', '######', '#..#.#', '######', '.#..#.', '.####.'], 3, 18, oz, 'z', TAT);     // 해골 문신
    stamp(sb, ['#..#', '.##.', '#..#', '.##.'], 3, 10, oz, 'z', TAT);                                    // 팔뚝 문양
    for (let x = 1; x <= 10; x += 3) spike(sb, x, 6.5 | 0, front ? 12 : -1, [0, 0, front ? 1 : -1], 2, 0xe8ecf0, 0xffffff);
    for (let z = 1; z <= 10; z += 3) spike(sb, 12, 6, z, [1, 0, 0], 2, 0xe8ecf0, 0xffffff);
    for (let z = 1; z <= 10; z++) mul(sb, 6, 15, z, .86);
    return a;
  };
  const armF = mkArm(true), armB = mkArm(false);
  const PT = tone(PANT, .3, .16);
  const leg = legShape({ ...LEG_B, cuff: 1 }, (rg, x, y, z) => rg === 'pant' ? PT(x, y, z) : rg === 'cuff' ? shade(PANT, .8) : rg === 'sole' ? 0x1e1c1a : tone(0x2a2624)(x, y, z));
  bootDeco(leg, LEG_B, { lace: 0x6a6460, collar: 0x1a1616, toe: (x, y, z) => pick(x, y, z, STEEL, STEEL_D, STEEL_L) });
  rip(leg, 11, 11, 14, 2, 7, skin); rip(leg, 11, 17, 18, 5, 8, skin);
  for (let z = 0; z < 11; z++) for (let x = 2; x <= 10; x++) if (leg.get(x, 8, z) >= 0 && hash3(x, z, 8) < .4) leg.set(x, 8, z, THREAD);
  return assemble(r, { ...BIG, head: hd, torso: tg, armF, armB, leg, legO: [6.5, 5.5] });
}

// =====================================================================================
// 9) 철거반장 굴삭 (보스, 큰 체형) — 전등 달린 노란 안전모 + 큰 콧수염 + 형광 조끼 + 배불뚝이 + 노란 장갑 + 공구 허리띠
// =====================================================================================
function boss(r) {
  const skin = SK.ruddy, HAT = 0xe8b81c,   // 포인트 색: 선명한 노란 안전모
  VEST = desat(0xb8602a, .38), REF = 0xa8a69c, UNDER = 0xa49a84, PANT = 0x34405e, GLV = desat(0xc09a2c, .22);
  const hd = headGrid(); const s = hd.s;
  faceBase(s, { skin, stache: 0x5a3418, bushy: true, mouth: 'none', brow: 0x3a2214, thickBrow: true, bigNose: true, noseC: 0xc0604e, stub: 0x8a6a54, beardH: 1, jaw: true });
  // 안전모: 높은 돔 + 앞뒤로 지나는 가운데 돋은 줄 + 짧은 챙(앞만 조금 길게) + 이마 전등
  const hatC = (x, y, z) => grime(x, y, z, pick(x, y, z, HAT, shade(HAT, .93), shade(HAT, 1.07), .14, .06), 0x7a6a3a, .06);
  ell(s, 12, 10, 8.5, 7.0, 7.6, 7.6, hatC, (x, y) => y >= 10);
  for (let x = 4; x <= 20; x++) for (const z of [8, 9]) { let top = -1; for (let y = 25; y >= 10; y--) if (s.get(x, y, z) >= 0) { top = y; break; } if (top > 10) s.set(x, top + 1, z, shade(HAT, 1.1)); }   // 가운데 돋은 줄
  for (let x = 3; x <= 21; x++) for (let z = -1; z <= 18; z++) {                                            // 챙: 돔 둘레 한 칸, 앞은 세 칸
    if (s.get(x, 10, z) >= 0) { s.set(x, 10, z, shade(HAT, .86)); continue; }
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => s.get(x + a, 10, z + b) >= 0 && s.get(x + a, 11, z + b) >= 0);
    if (near || (x >= 18 && x <= 21 && z >= 3 && z <= 14)) s.set(x, 10, z, x >= 20 ? shade(HAT, .78) : shade(HAT, .86));
  }
  for (let x = 18; x <= 21; x++) for (let z = 3; z <= 14; z++) if (s.get(x, 9, z) < 0) s.set(x, 9, z, 0x3a3020);   // 챙 밑 그늘
  s.fill(18, 12, 7, 19, 15, 10, 0x4a4a4e); s.fill(20, 12, 7, 20, 15, 10, 0x3a3a3e); s.fill(20, 13, 8, 20, 14, 9, 0xfffcec); s.set(21, 13, 8, 0xfffff4); s.set(21, 14, 9, 0xfffff4); s.fill(19, 16, 8, 19, 16, 9, 0x3a3a3e);   // 전등
  // 몸통 (큰 체형 + 배): 흰 속셔츠 + 열린 형광 주황 조끼(반사띠) + 공구 허리띠
  const T = { ...TOR_B, belly: [0, 9, 7], chestY: [7, 9] }; const tg = torsoGrid(T, 5, 20, 7); const t = tg.s;   // 둥글게 튀어나온 배불뚝이
  const VT = tone(VEST, .26, .14);
  torsoShape(t, T, (rg, x, y, z) => {
    if (rg === 'belt') return z >= 10 && z <= 11 && x >= 10 ? STUD : tone(0x4a3020)(x, y, z);
    if (y >= 10 && x >= 9 && z >= 8 && z <= 13 && rg !== 'belly') return skinT(skin)(x, y, z);                 // 러닝셔츠 목둘레 (맨살)
    if (rg === 'belly' || ((rg === 'chest' || x >= 11) && z >= 7 && z <= 14)) return grime(x, y, z, tone(UNDER, .2, .1)(x, y, z), 0x8a7050, .1, 9);
    if (y === 4 || y === 5 || (rg !== 'trap' && (z === 5 || z === 16) && x >= 9 && y >= 4) || (rg === 'trap' && (z === 5 || z === 16))) return (y === 4 || rg === 'trap' || z === 5 || z === 16) ? REF : shade(0xd8c040, .9);
    return VT(x, y, z);
  });
  for (let y = 2; y <= 3; y++) for (const z of [4, 17]) t.set(12, y + 4, z, shade(VEST, .8));                // 가슴 주머니 + 펜
  t.set(12, 8, 4, 0x2a2a6a); t.set(12, 9, 4, 0x2a2a6a); t.set(12, 8, 17, 0xb83020);
  for (const z of [1, 20]) { rbox(t, 4, -2, z - 1, 9, 2, z + 1, tone(0x6a4a2a), 1); t.set(9, 1, z, STUD_D); }   // 공구 주머니
  line(t, 13, 0, 3, 13, -3, 3, 0x6a4a2a); t.fill(12, -4, 2, 14, -3, 4, 0x5a5e62);                          // 망치
  line(t, 12, 0, 18, 12, -3, 18, STEEL); t.fill(12, -4, 17, 12, -4, 19, STEEL);                             // 렌치
  // 팔: 털 난 맨팔 + 거대한 노란 작업 장갑
  const AP = { ...ARM_B, wIn: 0, foIn: 1 };
  const mkArm = front => {
    const a = armShape(AP, (rg, x, y, z) => {
      if (rg === 'fist' || rg === 'wrist') return rg === 'wrist' && y === 7 ? shade(GLV, .7) : pick(x, y, z, GLV, shade(GLV, .85), shade(GLV, 1.12), .26, .14);
      return hash3(x * 3, y, z) < .12 && y <= 12 ? 0x7a4a34 : skinT(skin)(x, y, z);
    }, front);
    for (let z = 1; z <= 10; z++) for (let y = 1; y <= 4; y++) if ((z + y) % 4 === 0) mul(a.s, 11, y, z, .8);
    return a;
  };
  const armF = mkArm(true), armB = mkArm(false);
  const PT = tone(PANT, .3, .16);
  const leg = legShape({ ...LEG_B, cuff: 2 }, (rg, x, y, z) => rg === 'pant' ? grime(x, y, z, PT(x, y, z), 0x5a4a34, .1) : rg === 'cuff' ? shade(PANT, .8) : rg === 'sole' ? 0x241e1a : tone(0x4a3220)(x, y, z));
  bootDeco(leg, LEG_B, { lace: 0x9a8a60, collar: 0x3a2618, toe: (x, y, z) => pick(x, y, z, 0x8a7a3a, 0x6a5a2a, 0x9a8a4a) });
  for (const z of [0, 10]) pocket(leg, z, 3, 8, 12, 17, PANT);
  return assemble(r, { ...BIG, head: hd, torso: tg, armF, armB, leg, legO: [6.5, 5.5] });
}

// =====================================================================================
// 10) 사이보그 폭주왕 쇠톱 (보스, 큰 체형) — 높은 붉은 부채 모히칸 + 반쪽 금속 얼굴(붉은 눈) + 가시 조끼 + 기계 팔
// =====================================================================================
function cyborg(r) {
  const skin = SK.tan, LEA = 0x1e1c1c, LT = tone(LEA, .3, .14, .8, 1.4), MET = 0x8a9096, MT = (x, y, z) => grime(x, y, z, pick(x, y, z, MET, shade(MET, .8), shade(MET, 1.18), .26, .14), RUST, .1, 11);
  const hd = headGrid(); const s = hd.s;
  faceBase(s, { skin, mouth: 'snarl', brow: 0x140c08, thickBrow: true, stub: 0x6a4a34, cranium: 3.2, jaw: true, earring: STUD, skipEye: 4, scalp: (x, y, z) => shade(SK.tan, .88) });
  // 왼쪽(z-) 얼굴 절반: 금속판 + 리벳 + 붉게 빛나는 의안
  for (let x = 6; x <= 19; x++) for (let y = 0; y <= 13; y++) for (let z = 1; z <= 8; z++) if (s.get(x, y, z) >= 0 && (s.get(x + 1, y, z) < 0 || s.get(x, y, z - 1) < 0 || s.get(x, y + 1, z) < 0 || x === 17)) {
    if (x === 17 && y <= 3 && z >= 5) { if (y === 2) s.set(x, y, z, z % 2 ? 0xb8bcc0 : 0x5a5e62); continue; }   // 금속 이빨
    s.set(x, y, z, (z === 8 || y === 7) ? shade(MET, .7) : MT(x, y, z));
  }
  for (const [x, y, z] of [[17, 9, 3], [17, 1, 3], [15, 11, 2], [10, 9, 1], [17, 9, 7]]) s.set(x, y, z, STUD);
  s.fill(17, 4, 4, 17, 5, 6, 0x3a0a0a); s.fill(18, 4, 4, 18, 5, 6, 0xff4a1a); s.set(18, 5, 5, 0xffe0c0); s.set(19, 4, 5, 0xff8a50); s.set(19, 5, 5, 0xffc8a0);   // 포인트 색: 빛나는 의안 (가운데 흰빛)
  // 모히칸: 부채처럼 펼쳐진 아주 높은 붉은 가시 (보스 실루엣의 핵심)
  mohawk(s, { n: 6, thin: .8, x0: 6, x1: 14, base: 11, spread: .45, mid: .5, len: t => 8 + Math.sin(t * Math.PI) * 4, c: desat(0xa02a1e, .42), cd: desat(0x7a1a10, .38), cl: desat(0xb84030, .42) });   // 머리 하나 높이, 좁게 (피와 겹치지 않게 채도 낮춤)
  // 몸통: 가시 박힌 검은 가죽 조끼(앞이 열려 복근이 보임) + 해골 장식 + 가슴 체인
  const tg = torsoGrid(TOR_B); const t = tg.s;
  torsoShape(t, TOR_B, (rg, x, y, z) => {
    if (rg === 'belt') return z >= 9 && z <= 12 && x >= 10 ? 0xc8c0a8 : tone(0x1a1616)(x, y, z);
    if ((rg === 'chest' || x >= 11) && z >= 8 && z <= 13) return (y >= 2 && y <= 7 && (y % 2 === 0 || z === 10 || z === 11)) ? shade(skin, .86) : skinT(skin)(x, y, z);   // 복근
    return LT(x, y, z);
  });
  stamp(t, ['.###.', '#.#.#', '#####', '.#.#.'], 12, 8, 3, 'x', 0xd8d0c0);                                // 해골 무늬
  t.set(12, 1, 10, 0x101010); t.set(12, 1, 11, 0x101010);
  for (let i = 0; i <= 10; i++) t.set(13, 10 - Math.round(Math.sin(i / 10 * Math.PI) * 4), 6 + i, i % 2 ? STEEL_L : STEEL);   // 가슴 체인
  for (let z = 0; z <= 21; z += 3) spike(t, 6, 14, z, [0, 1, 0], 4, STEEL_L);                                // 어깨·옷깃 가시
  for (const z of [1, 20]) for (let x = 2; x <= 10; x += 3) spike(t, x, 13, z, [0, 0, z < 9 ? -1 : 1], 3, STEEL_L);
  for (let y = 3; y <= 9; y += 3) for (const z of [7, 14]) stud(t, 13, y, z);
  // 기계 팔(앞): 금속 마디 + 피스톤 + 붉은 호스 + 전기톱 끼우는 손목
  const MA = { ...ARM_B, foIn: 1 };
  const mech = armShape(MA, (rg, x, y, z) => {
    if (y === 10 || y === 7 || y === 14) return shade(MET, .55);                                            // 관절 틈
    if (rg === 'fist') return pick(x, y, z, 0x5a5e62, 0x4a4e52, 0x6a6e72);
    return MT(x, y, z);
  }, true);
  { const sb = mech.s; for (let y = 2; y <= 16; y++) { sb.set(12, y, 3, y % 3 ? 0xb8bcc0 : 0x6a6e72); }      // 피스톤
    for (let i = 0; i < 10; i++) sb.set(Math.round(12 + Math.sin(i / 9 * Math.PI) * 1.5), 15 - i, 9 + (i > 4 ? 1 : 0), i % 2 ? 0xa02018 : 0x7a1810);   // 호스
    for (const [x, y] of [[2, 17], [8, 17], [2, 12], [8, 12], [4, 5], [8, 5]]) stud(sb, x, y, 12);
    for (let x = 2; x <= 10; x += 2) sb.set(x, 9, 12, 0xc8302a); }
  const armB = armShape(ARM_B, (rg, x, y, z) => rg === 'wrist' ? 0x1e1a1a : rg === 'fist' && y >= 2 ? tone(0x1e1a1a)(x, y, z) : skinT(skin)(x, y, z), false);
  stamp(armB.s, ['.####.', '#.##.#', '######', '.#..#.', '..##..'], 3, 18, 0, 'z', 0x2a2226);
  for (let x = 1; x <= 10; x += 3) spike(armB.s, x, 6, -1, [0, 0, -1], 2, STEEL_L);
  const PANT = 0x242224, PT = tone(PANT, .3, .16, .8, 1.35);
  const leg = legShape({ ...LEG_B, cuff: 0 }, (rg, x, y, z) => rg === 'pant' ? ((y === 13 || y === 17) ? 0x3a2a1e : PT(x, y, z)) : rg === 'sole' ? 0x1a1818 : MT(x, y, z));
  for (const y of [13, 17]) for (let z = 0; z < 11; z += 10) recolor(leg, 6, y, z, STUD);
  bootDeco(leg, LEG_B, { collar: 0x3a3e42, buckle: 0x2a2a2e });
  rip(leg, 11, 11, 12, 3, 6, skin);
  return assemble(r, { ...BIG, head: hd, torso: tg, armF: mech, armB, leg, legO: [6.5, 5.5], opts: { brawl: { arm: .15, hand: .75, leg: .24, grip: -.75 } } });   // 전기톱은 허리 높이에서 앞으로 (바닥에 묻히지 않게)
}

// =====================================================================================
// 로봇 '볼트' — 네모난 머리(빛나는 바이저 눈) + 안테나 + 판금 이음선·볼트·녹
// =====================================================================================
function robot(r, k) {
  const C = {
    bot:  { body: 0xb4b0aa, acc: desat(0xa82a22, .2), joint: 0x4a4a4c, visor: 0x50f4ff, big: false },
    tank: { body: 0x4c5670, acc: desat(0xc8a020, .22), joint: 0x2e3238, visor: 0x7cff4a, big: true },
    atk:  { body: 0xc8c4bc, acc: desat(0xb02a22, .2), joint: 0x3e3e42, visor: 0xff5a28, big: false },
  }[k];
  const BT = (x, y, z) => grime(x, y, z, pick(x, y, z, C.body, shade(C.body, .88), shade(C.body, 1.08), .22, .1), hash3(x, z, y) < .5 ? RUST : RUST_D, .07, 21);
  const AT = (x, y, z) => grime(x, y, z, pick(x, y, z, C.acc, shade(C.acc, .86), shade(C.acc, 1.1), .2, .1), RUST, .06, 23);
  const JT = tone(C.joint, .2, .1);
  const hazard = (a, b) => ((a + b) >> 1) % 2 ? C.acc : 0x2a2a2c;
  // 볼트는 보통 체형보다 작게 (키 약 0.75배) — 게임 배율은 config 그대로
  // 머리: 각진 상자 + 이마 이음선 (포인트 색 = 빛나는 바이저 눈) + 빛나는 두 눈 + 입 그릴 + 귀 원판 + 안테나
  const hd = headGrid(); const s = hd.s;
  const hz0 = k === 'tank' ? 4 : 3, hz1 = k === 'tank' ? 13 : 14, hy1 = k === 'tank' ? 9 : 10;
  rbox(s, 7, 1, hz0, 17, hy1, hz1, BT, 1);
  rbox(s, 9, 0, hz0 + 2, 15, 0, hz1 - 2, JT, 0);                                                         // 목
  for (let z = hz0; z <= hz1; z++) recolor(s, 17, hy1 - 2, z, shade(C.body, .72));
  for (let x = 7; x <= 17; x++) { recolor(s, x, hy1 - 2, hz0, shade(C.body, .72)); recolor(s, x, hy1 - 2, hz1, shade(C.body, .72)); }
  const ey = k === 'tank' ? 4 : 5;
  for (const z0 of [k === 'tank' ? 5 : 4, k === 'tank' ? 10 : 11]) { s.fill(18, ey, z0, 18, ey + 1, z0 + 2, C.visor); s.set(18, ey + 1, z0 + 1, 0xffffff); s.set(18, ey, z0 + 1, shade(C.visor, 1.25)); s.fill(19, ey, z0 + 1, 19, ey + 1, z0 + 1, shade(C.visor, 1.15)); s.fill(17, ey - 1, z0 - 1, 17, ey + 2, z0 + 3, 0x141416); }
  for (let z = 6; z <= 11; z++) { s.set(18, 2, z, z % 2 ? 0x2a2a2c : 0xc89a2a); s.set(18, 3, z, 0x2a2a2c); }   // 입 그릴(노란 불빛)
  for (const z of [hz0 - 1, hz1 + 1]) { rbox(s, 10, 4, z, 14, 8, z, (x, y) => (x === 12 && y === 6) ? C.acc : JT(x, y, z), 1); }
  s.fill(9, hy1 + 1, hz1 - 1, 10, hy1 + 2, hz1, JT(0, 0, 0)); s.fill(9, hy1 + 3, hz1 - 1, 9, hy1 + 5, hz1 - 1, 0x6a6a6e);
  s.fill(9, hy1 + 6, hz1 - 1, 9, hy1 + 6, hz1 - 1, k === 'tank' ? 0xf0a020 : 0xff3020);
  for (const [x, y, z] of [[17, hy1, hz0], [17, hy1, hz1], [17, 1, hz0], [17, 1, hz1]]) s.set(x, y, z, STUD_D);
  if (k === 'atk') for (let x = 8; x <= 16; x++) s.set(x, hy1 + 1, 8 + (x % 2), C.acc);                     // 공격형: 머리 위 붉은 볏
  // 몸통
  const T = C.big ? { X: 12, TH: 9, D: 20, inset: y => y <= 1 ? 3 : y <= 3 ? 1 : 0, chestY: [4, 7] } : { X: 9, TH: 8, D: 16, inset: y => y <= 1 ? 3 : y <= 2 ? 1 : 0, chestY: [4, 6] };
  const tg = torsoGrid(T); const t = tg.s, X = T.X, D = T.D, TH = T.TH;
  torsoShape(t, T, (rg, x, y, z) => {
    if (rg === 'belt') return y === 0 ? JT(x, y, z) : (x >= X - 1 && Math.abs(z - D / 2 + .5) < 2 ? 0xc89a2a : JT(x, y, z));
    if (k === 'tank' && (rg === 'chest' || x === X - 1) && y >= 4 && y <= 7 && z >= 4 && z <= D - 5) return hazard(y, z);
    if (k !== 'tank' && (rg === 'chest' || x >= X - 1) && ((z >= D / 2 - 1 && z <= D / 2) || (y >= TH - 2 && z >= 5 && z <= D - 6))) return AT(x, y, z);   // 가슴의 붉은 T자
    if (y === 3 && rg !== 'trap') return shade(C.body, .7);
    return BT(x, y, z);
  });
  for (const z of [3, D - 4]) for (const y of [4, TH - 1]) t.set(X, y, z, STUD_D);
  for (let y = 4; y <= 6; y++) for (let z = 3; z <= 5; z++) t.set(-1, y, z + (y % 2), 0xf0a020);           // 등 표시등
  rbox(t, -3, 2, 4, -1, TH - 1, D - 5, BT, 1);                                                             // 등 배터리
  for (let y = 3; y <= TH - 2; y += 2) for (let z = 5; z <= D - 6; z++) t.set(-4, y, z, shade(C.body, .7));
  // 어깨 덩어리 (팔 어깨 부분 = 각진 장갑판)
  const AP = C.big ? { W: 12, D: 11, AH: 14, f1: 5, w1: 6, fo1: 8, b1: 10, foIn: 0, wIn: 2 } : { W: 8, D: 8, AH: 12, f1: 3, w1: 4, fo1: 6, b1: 8, foIn: 0, wIn: 2, padX: 2, padZ: 4, padY: k === 'atk' ? 7 : 0 };
  const mkArm = front => {
    const a = armShape(AP, (rg, x, y, z) => {
      if (rg === 'fist') return y === AP.f1 ? shade(C.body, .8) : BT(x, y, z);
      if (rg === 'wrist' || y === AP.fo1 + 1 || y === AP.w1 + 1) return shade(C.joint, .8);
      if (rg === 'fore') return k === 'tank' ? (z === 0 || z === AP.D - 1 ? hazard(x, y) : BT(x, y, z)) : AT(x, y, z);
      if (rg === 'sh') return k === 'tank' ? (y >= AP.AH - 3 && (z === 0 || z === AP.D - 1 || x === AP.W - 1) ? hazard(x + z, y) : BT(x, y, z)) : AT(x, y, z);
      return BT(x, y, z);
    }, front);
    const sb = a.s, W = AP.W, Dd = AP.D;
    // 각진 어깨 장갑: 둥근 어깨 위에 상자 덮개
    rbox(sb, 0, AP.AH - 4, -1, W - 1, AP.AH - 1, Dd, (x, y, z) => k === 'tank' && y >= AP.AH - 3 && (z === -1 || z === Dd || x === W) ? hazard(x + z, y) : k === 'tank' ? BT(x, y, z) : AT(x, y, z), 1);
    for (const [x, z] of [[1, -1], [W - 2, -1], [1, Dd], [W - 2, Dd]]) sb.set(x, AP.AH - 2, z, STUD_D);
    for (let z = 1; z < Dd - 1; z += 2) for (let y = 1; y < AP.f1; y++) mul(sb, W - 1, y, z, .7);        // 손가락 마디
    if (k === 'atk') {                                                                                      // 팔뚝 강철 칼날: 바깥쪽에서 주먹 밑으로 길게 뻗어 윤곽을 깸
      const oz = front ? Dd : -1, dz = front ? 1 : -1;
      for (let y = -7; y <= AP.fo1 + 2; y++) {
        const w = y < -3 ? Math.max(1, y + 8) : y > AP.fo1 ? AP.fo1 + 3 - y : 4;                           // 아래 끝은 뾰족, 위는 팔꿈치에서 줄어듦
        const out = y < 0 ? Math.round(-y / 4) : 0;                                                          // 아래로 갈수록 바깥으로 벌어짐
        for (let i = 0; i < w; i++) { const x = 6 - i; for (let j = 0; j < 2; j++) sb.set(x, y, oz + dz * (j + out), i === 0 ? 0xe8ecf0 : i === 1 ? 0xc4c8cc : y >= 1 && i === w - 1 ? shade(C.acc, .85) : pick(x, y, j, 0x9aa0a6, 0x8a9096, 0xaab0b6)); }
      }
      for (let y = 1; y <= 3; y++) for (let x = 2; x <= 5; x++) sb.set(x, y, oz, shade(C.joint, 1.2));        // 칼날 받침
    }
    return a;
  };
  const armF = mkArm(true), armB = mkArm(false);
  const LP = C.big ? { Wx: 15, D: 11, LH: 13, boot1: 4, toe: 14, px0: 1, px1: 11, sole: 1 } : { Wx: 12, D: 8, LH: 12, boot1: 3, toe: 11, px0: 1, px1: 8 };
  const KN = C.big ? 7 : 7;   // 무릎 줄
  const leg = legShape(LP, (rg, x, y, z) => {
    if (rg === 'sole') return 0x2a2a2c;
    if (rg === 'boot') return k === 'tank' ? BT(x, y, z) : AT(x, y, z);
    if (y === KN || y === KN + 1) return JT(x, y, z);
    if (x >= LP.px1 - 1 && y >= KN - 1 && y <= KN + 2) return k === 'tank' ? hazard(y, z) : AT(x, y, z);             // 무릎 보호대
    return BT(x, y, z);
  });
  for (let z = 1; z < LP.D - 1; z += 2) recolor(leg, 0, 0, z, 0x1a1a1a);
  const half = C.big ? { LU: 6, LL: 7 } : { LU: 5, LL: 7 };
  return assemble(r, {
    THn: TH, AU: C.big ? 6 : 5, AL: C.big ? 8 : 7, ...half,
    shZ: C.big ? 12.5 : 9.5, hipZ: C.big ? .24 : .18, shUp: 2, head: hd, torso: tg, armF, armB, leg, legO: C.big ? [6.5, 5.5] : [5, 4],
  });
}

export const CHAR_BUILDERS = {
  grunt, charger, thrower, shielder, biker, ninja, bomber, brute, boss, cyborg,
  bot: r => robot(r, 'bot'), bot_tank: r => robot(r, 'tank'), bot_atk: r => robot(r, 'atk'),
};
