// 뱀돌이 v2 고밀도 복셀 모델 — 기준: docs/art/hero_turnaround.webp
// 기존 인간형과 같은 부위 구조(머리·몸통·위팔/아래팔·허벅지/정강이)라 모든 모션이 그대로 동작한다.
// 복셀 1칸 = 기존(V)의 절반. 짜리몽땅한 보통 체형: 큰 머리, 넓은 어깨, 굵은 팔에 큰 주먹, 짧고 굵은 다리.
import { V } from './config.js';
import { VoxGrid, meshGrid, hash3 } from './voxel.js';

const H = V / 2;                       // 4.5cm
const WOUND = [0xc81e24, 0x9e1219, 0xe0382c, 0xb3161d];
const C = {
  skin: 0xe2a271, skinD: 0xc4875a, skinL: 0xf0b98a, stub: 0xbf8a63,
  hair: 0x4a2c18, hairD: 0x2e1a0e, hairL: 0x5e3a20,
  band: 0xc8262e, bandD: 0x941820,
  brow: 0x24140a, eyeW: 0xf2eee4, pupil: 0x16100c, mouth: 0x4a1a14, teeth: 0xf0ece0,
  denim: 0x4a6b9e, denimD: 0x3a5684, denimL: 0x6486ba, fray: 0xd9d2c2,
  tee: 0xe6e0d2, teeD: 0xc9c2b2,
  belt: 0x5a3a22, buckle: 0xb9b2a2,
  jean: 0x4f72aa, jeanD: 0x3e5d90, jeanL: 0x86a3cc, thread: 0xe2ddd0,
  wrap: 0xb8222a, wrapD: 0x8e1820,
  tattoo: 0x2a2a36, scar: 0xd99a78, patch: 0x9a978e,
  shoe: 0xc0282e, shoeD: 0x961e24, white: 0xeeeae2, sole: 0xd2cbbd,
};
// 데님·머리카락 등 재질에 얼룩(색 세 단계) — 위치 해시로 고정
const pick = (x, y, z, a, b, c, pb = .22, pc = .14) => { const h = hash3(x * 3 + 11, y * 5 + 7, z * 7 + 3); return h < pc ? c : h < pc + pb ? b : a; };

// ---------------------------------------------------------------- 머리 (w18 × h16 × d14)
function head() {
  const g = new VoxGrid(18, 16, 14);
  // 두개골·얼굴 블록 x6..16, y0..10, z1..12 (턱은 좁게)
  for (let y = 0; y <= 10; y++) {
    const z0 = y === 0 ? 3 : y === 1 ? 2 : 1, z1 = y === 0 ? 10 : y === 1 ? 11 : 12, x0 = y === 0 ? 8 : 6;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= 16; x++) g.set(x, y, z, C.skin);
  }
  // 수염 자국(턱·뺨 아래)과 뺨 그늘
  for (let y = 0; y <= 2; y++) for (let z = 1; z <= 12; z++) for (let x = 8; x <= 16; x++) if (g.get(x, y, z) >= 0 && (x === 16 || z <= 2 || z >= 11)) g.set(x, y, z, C.stub);
  // 입: 악문 이 (위아래 어두운 테두리)
  for (let z = 4; z <= 9; z++) { g.set(16, 2, z, C.mouth); g.set(16, 3, z, C.teeth); g.set(16, 4, z, z === 4 || z === 9 ? C.mouth : C.skinD); }
  g.set(16, 3, 4, C.mouth); g.set(16, 3, 9, C.mouth); g.set(16, 3, 6, 0xd8d2c4); g.set(16, 3, 7, 0xd8d2c4);
  // 코 (한 칸 튀어나옴)
  g.fill(17, 4, 6, 17, 5, 7, C.skin); g.set(17, 4, 6, C.skinD); g.set(17, 4, 7, C.skinD);
  // 눈: 흰자 3칸 + 안쪽 눈동자
  for (const [z0, pz] of [[2, 4], [9, 9]]) { g.fill(16, 6, z0, 16, 7, z0 + 2, C.eyeW); g.fill(16, 6, pz, 16, 7, pz, C.pupil); }
  // 굵은 눈썹: 바깥쪽이 높고 안쪽이 내려온 화난 눈썹
  for (let z = 1; z <= 5; z++) g.set(16, 8, z, C.brow);
  for (let z = 8; z <= 12; z++) g.set(16, 8, z, C.brow);
  g.set(16, 7, 5, C.brow); g.set(16, 7, 8, C.brow); g.set(17, 8, 4, C.brow); g.set(17, 8, 9, C.brow);
  // 귀
  g.fill(10, 4, 0, 11, 6, 0, C.skin); g.fill(10, 4, 13, 11, 6, 13, C.skin); g.set(10, 5, 0, C.skinD); g.set(10, 5, 13, C.skinD);
  // 구레나룻·뒷머리
  for (const z of [1, 12]) g.fill(11, 5, z, 13, 8, z, C.hair);
  for (let y = 3; y <= 8; y++) for (let z = 1; z <= 12; z++) for (let x = 6; x <= 8; x++) if (x === 6 || z === 1 || z === 12) g.set(x, y, z, pick(x, y, z, C.hair, C.hairD, C.hairL));
  // 머리띠 (한 칸 도드라지게 둘러감) y9..10
  for (let y = 9; y <= 10; y++) {
    for (let z = 1; z <= 12; z++) { g.set(17, y, z, y === 9 ? C.bandD : C.band); g.set(5, y, z, C.band); }
    for (let x = 5; x <= 17; x++) { g.set(x, y, 0, y === 9 ? C.bandD : C.band); g.set(x, y, 13, y === 9 ? C.bandD : C.band); }
    for (let z = 1; z <= 12; z++) for (let x = 6; x <= 16; x++) g.set(x, y, z, C.skin);   // 속은 피부(안 보임)
  }
  // 뒤통수 매듭 + 바람에 날리는 꼬리 두 가닥
  g.fill(4, 9, 6, 4, 10, 8, C.bandD);
  const tail = (zs, ys, drop) => { for (let i = 0; i <= 4; i++) { const x = 3 - i + 1, y = ys - Math.floor(i * drop), z = zs + (i % 2 ? 1 : 0); g.set(x, y, z, C.band); g.set(x, y - 1, z, i % 2 ? C.bandD : C.band); } };
  tail(5, 10, .5); tail(8, 9, .9);
  // 곱슬 머리: 위로 4층, 위로 갈수록 듬성듬성 (2~3톤)
  for (let y = 11; y <= 15; y++) {
    const keep = y <= 12 ? 1 : y === 13 ? .8 : y === 14 ? .5 : .18;
    for (let z = 1; z <= 12; z++) for (let x = 5; x <= 17; x++) {
      const edge = x === 5 || x === 17 || z === 1 || z === 12;
      if (y === 11 && !edge && (x < 6 || x > 16)) continue;
      if ((x === 5 || x === 17) && y > 12) continue;
      if (hash3(x + 31, y * 3, z + 17) > keep) continue;
      g.set(x, y, z, pick(x, y, z, C.hair, C.hairD, C.hairL, .3, .2));
    }
  }
  // 앞머리가 머리띠 위로 살짝 삐침
  for (let z = 2; z <= 11; z += 3) g.set(17, 11, z, C.hairD);
  return { g, origin: [11.5, 0, 7], eyes: [[(17.6 - 11.5) * H, 7 * H, (3.5 - 7) * H], [(17.6 - 11.5) * H, 7 * H, (10.5 - 7) * H]] };
}

// ---------------------------------------------------------------- 몸통 (x9 × y12 × z16): 찢은 청조끼 + 흰 티 + 벨트
function torso() {
  const g = new VoxGrid(9, 12, 16);
  for (let y = 0; y < 12; y++) {
    const z0 = y <= 1 ? 2 : y <= 5 ? 1 : 0, z1 = 15 - z0;
    for (let z = z0; z <= z1; z++) for (let x = 0; x <= 8; x++) {
      let c = pick(x, y, z, C.denim, C.denimD, C.denimL);
      if (x === 8 && z >= 5 && z <= 10) c = y === 7 ? C.teeD : C.tee;      // 열린 앞섶 사이의 흰 티 (가슴 아래 그늘)
      if (y <= 1) c = C.belt;
      g.set(x, y, z, c);
    }
  }
  g.fill(8, 0, 7, 8, 1, 8, C.buckle);                                       // 버클
  for (const z of [2, 3, 12, 13]) { g.set(8, 8, z, C.denimD); g.set(8, 9, z, C.denimD); }   // 가슴 주머니
  g.set(8, 9, 2, C.buckle); g.set(8, 9, 13, C.buckle);
  for (const z of [4, 11]) g.fill(7, 11, z, 8, 11, z, C.denimD);             // 옷깃
  // 소매를 찢어낸 진동 둘레: 흰 실밥이 너덜너덜
  for (const z of [0, 15]) for (let y = 7; y <= 11; y++) for (let x = 1; x <= 7; x++) if (hash3(x, y, z) < .55 && (y === 7 || x === 1 || x === 7 || y === 11)) g.set(x, y, z, C.fray);
  for (const z of [0, 15]) for (let x = 2; x <= 6; x += 2) if (hash3(x, 9, z + 5) < .7) g.set(x, 6, z, C.fray);
  g.fill(0, 5, 5, 0, 9, 10, C.patch);                                       // 등의 바랜 패치
  for (let z = 5; z <= 10; z++) if (z % 2) { g.set(0, 5, z, 0x86837a); g.set(0, 9, z, 0x86837a); }
  for (let y = 3; y <= 10; y++) g.set(0, y, 8, C.denimD);                   // 등 솔기
  return { g, origin: [4.5, 0, 8] };
}

// ---------------------------------------------------------------- 팔 (x8 × y13 × z8): 아래 7칸 = 주먹+붕대, 위 6칸 = 팔꿈치·이두·어깨
function arm(front) {
  const g = new VoxGrid(8, 13, 8);
  const round = (x, z, w0, w1) => !((x === w0 || x === w1) && (z === w0 || z === w1));
  // 주먹 y0..3: 8×8, 모서리 깎음, 손가락 홈
  for (let y = 0; y <= 3; y++) for (let z = 0; z <= 7; z++) for (let x = 0; x <= 7; x++) {
    if (!round(x, z, 0, 7)) continue;
    if (y === 0 && (x === 0 || x === 7 || z === 0 || z === 7)) continue;
    g.set(x, y, z, C.skin);
  }
  for (const z of [2, 4, 6]) for (let y = 1; y <= 2; y++) g.set(7, y, z, C.skinD);   // 손가락 사이
  g.fill(7, 3, 1, 7, 3, 6, C.skinL);                                                  // 주먹 마디
  // 손목 붕대 y4..5 (팔뚝보다 한 칸 굵게)
  for (let y = 4; y <= 5; y++) for (let z = 1; z <= 6; z++) for (let x = 1; x <= 6; x++) g.set(x, y, z, (y + x + z) % 3 ? C.wrap : C.wrapD);
  // 팔뚝 y6..7 (6×6)
  for (let y = 6; y <= 7; y++) for (let z = 1; z <= 6; z++) for (let x = 1; x <= 6; x++) g.set(x, y, z, C.skin);
  // 이두 y8..9 (6×6 + 앞으로 볼록)
  for (let y = 8; y <= 9; y++) { for (let z = 1; z <= 6; z++) for (let x = 1; x <= 6; x++) g.set(x, y, z, C.skin); g.fill(7, y, 2, 7, y, 5, C.skin); }
  // 어깨 근육 y10..12 (8×8 둥글게)
  for (let y = 10; y <= 12; y++) for (let z = 0; z <= 7; z++) for (let x = 0; x <= 7; x++) {
    if (!round(x, z, 0, 7)) continue;
    if (y === 12 && (x === 0 || x === 7 || z === 0 || z === 7)) continue;
    g.set(x, y, z, y === 12 ? C.skinL : C.skin);
  }
  // 근육 경계 그늘
  for (let z = 1; z <= 6; z++) g.set(1, 9, z, C.skinD);
  if (front) {
    // 오른쪽 위팔 바깥면(z=7): 똬리 튼 뱀 문신
    const S = [[2, 10], [3, 10], [4, 10], [5, 11], [4, 11], [2, 11], [1, 10], [2, 9], [3, 9], [4, 9], [5, 9], [5, 8], [4, 8], [5, 10]];
    for (const [x, y] of S) g.set(x + 1, y, 7, C.tattoo);
    g.set(7, 11, 7, C.tattoo);
    for (const [x, y] of [[2, 8], [3, 8], [4, 8]]) g.set(x, y, 7, C.skin);
    g.fill(1, 8, 7, 6, 9, 7, C.skin); g.set(2, 9, 7, C.tattoo); g.set(3, 8, 7, C.tattoo); g.set(4, 9, 7, C.tattoo); g.set(5, 8, 7, C.tattoo);
  } else {
    // 왼팔 팔뚝 흉터 (바깥면 z=0)
    g.set(2, 7, 0, C.scar); g.set(3, 6, 0, C.scar); g.set(4, 7, 0, C.scar);
    g.fill(1, 6, 0, 6, 7, 0, -1); g.fill(1, 6, 1, 6, 7, 1, C.skin); g.set(2, 7, 1, C.scar); g.set(4, 6, 1, C.scar);
  }
  return g;
}

// ---------------------------------------------------------------- 다리 (x12 × y14 × z8): 아래 7칸 = 큰 운동화+롤업, 위 7칸 = 찢어진 청바지
function leg() {
  const g = new VoxGrid(12, 14, 8);
  for (let y = 4; y <= 13; y++) for (let z = 0; z <= 7; z++) for (let x = 1; x <= 8; x++) g.set(x, y, z, pick(x, y, z, C.jean, C.jeanD, C.jeanL, .25, .12));
  for (let y = 4; y <= 5; y++) for (let z = 0; z <= 7; z++) for (let x = 0; x <= 9; x++) g.set(x, y, z, y === 5 ? C.jeanL : 0x9ab2d4);   // 걷어 올린 밑단
  // 무릎 찢어짐 (앞면, 허벅지·정강이 경계 걸침): 맨살 + 흰 실
  g.fill(8, 6, 2, 8, 8, 5, C.skin); g.set(8, 9, 3, C.thread); g.set(8, 5, 2, C.thread); g.set(8, 7, 6, C.thread); g.set(8, 6, 1, C.thread); g.set(8, 9, 5, C.thread);
  g.fill(1, 10, 0, 4, 10, 0, C.jeanL); g.fill(2, 11, 7, 5, 11, 7, C.jeanL);   // 허벅지 옆 닳은 자국
  g.fill(1, 11, 2, 1, 13, 5, C.jeanD);                                         // 뒷주머니
  // 큰 운동화: 밑창 y0 (크림), 갑피 y1..3 (빨강), 앞코 흰색, 옆 흰 띠, 끈
  for (let z = 0; z <= 7; z++) for (let x = 0; x <= 11; x++) g.set(x, 0, z, (x + z) % 4 ? C.sole : C.white);
  for (let y = 1; y <= 3; y++) for (let z = 0; z <= 7; z++) for (let x = 0; x <= 10; x++) g.set(x, y, z, C.shoe);
  g.fill(10, 1, 0, 11, 2, 7, C.white); g.fill(11, 2, 1, 11, 2, 6, -1); g.fill(10, 3, 0, 10, 3, 7, -1); g.fill(9, 3, 1, 9, 3, 6, C.shoe);   // 앞코
  for (const z of [0, 7]) { g.fill(4, 1, z, 7, 2, z, C.white); g.set(5, 3, z, C.white); }   // 옆 흰 띠
  for (let x = 5; x <= 8; x++) for (let z = 2; z <= 5; z++) if ((x + z) % 2) g.set(x, 3, z, C.white);   // 끈
  g.fill(0, 1, 0, 0, 3, 7, C.shoeD); g.fill(0, 3, 2, 0, 3, 5, C.white);        // 뒤꿈치
  return g;
}

// ---------------------------------------------------------------- 조립
export function buildHeroV2(r) {
  const opt = { ao: true };
  const mk = (grid, origin, joint, far = null) => {
    const paint = (g, y) => { for (let z = 0; z < grid.d; z++) for (let x = 0; x < grid.w; x++) if (grid.get(x, y, z) >= 0) g.set(x, y, z, WOUND[(x * 7 + z * 3 + y) % WOUND.length]); };
    const copy = () => { const g = new VoxGrid(grid.w, grid.h, grid.d); g.data.set(grid.data); return g; };
    const cut = copy(); paint(cut, joint);
    const stump = new VoxGrid(grid.w, grid.h, grid.d); paint(stump, joint);
    const out = { ...meshGrid(r, grid, H, origin, opt), cut: meshGrid(r, cut, H, origin, opt), stump: meshGrid(r, stump, H, origin).mesh };
    if (far != null) {
      const tb = copy(); paint(tb, joint); paint(tb, far);
      const b = copy(); paint(b, far);
      out.cutTB = meshGrid(r, tb, H, origin, opt);
      out.cutB = meshGrid(r, b, H, origin, opt);
    }
    return out;
  };
  const slice = (g, y0, y1) => {
    const o = new VoxGrid(g.w, y1 - y0 + 1, g.d);
    for (let z = 0; z < g.d; z++) for (let y = y0; y <= y1; y++) for (let x = 0; x < g.w; x++) o.set(x, y - y0, z, g.get(x, y, z));
    return o;
  };
  const hd = head(), to = torso(), armF = arm(true), armB = arm(false), lg = leg();
  const AH = 13, AU = 6, AL = 7;          // 팔: 위 6칸, 아래 7칸
  const LHn = 14, LU = 7, LL = 7;         // 다리: 위 7칸, 아래 7칸
  const THn = 12;
  const LH = LHn * H, TH = THn * H;
  const headM = mk(hd.g, hd.origin, 0);
  const torsoM = mk(to.g, to.origin, THn - 1, 0);
  const armUF = mk(slice(armF, AL, AH - 1), [4, AU, 4], AU - 1, 0), armLF = mk(slice(armF, 0, AL - 1), [4, AL, 4], AL - 1);
  const armUB = mk(slice(armB, AL, AH - 1), [4, AU, 4], AU - 1, 0), armLB = mk(slice(armB, 0, AL - 1), [4, AL, 4], AL - 1);
  const legUM = mk(slice(lg, LL, LHn - 1), [5, LU, 4], LU - 1, 0), legLM = mk(slice(lg, 0, LL - 1), [5, LL, 4], LL - 1);
  const hipZ = 0.22, shZ = 11 * H, shY = LH + TH - 1.5 * H;
  return {
    height: (LHn + THn + 15) * H,
    armLen: AH * H, armULen: AU * H, handLen: AL * H,
    legLen: LH, legULen: LU * H,
    eyes: hd.eyes,                        // 광폭화 눈빛 위치 (머리 부위 로컬, 미터)
    lowGuard: true,                       // 맨손 대기 자세를 낮게 (큰 주먹이 얼굴을 가리지 않게)
    parts: {
      legB:  { ...legUM, pivot: [0, LH, -hipZ] },
      shinB: { ...legLM, pivot: [0, -LU * H, 0], parent: 'legB' },
      armB:  { ...armUB, pivot: [0, shY, -shZ] },
      handB: { ...armLB, pivot: [0, -AU * H, 0], parent: 'armB' },
      torso: { ...torsoM, pivot: [0, LH, 0] },
      head:  { ...headM, pivot: [0, LH + TH, 0] },
      legF:  { ...legUM, pivot: [0, LH, hipZ] },
      shinF: { ...legLM, pivot: [0, -LU * H, 0], parent: 'legF' },
      armF:  { ...armUF, pivot: [0, shY, shZ] },
      handF: { ...armLF, pivot: [0, -AU * H, 0], parent: 'armF' },
    },
  };
}
