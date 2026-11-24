// 도시 스테이지: 도로 표시, 상가 건물, 한국식 간판, 전봇대·전선, 주차된 차, 뒷골목 쓰레기통
import { VoxGrid, meshGrid, MeshBuilder, FACES, hexToRgb } from './voxel.js';
import { rand, randi, pick, shuffle } from './math.js';

// 실제 상호가 아닌 일반 업종 이름만 사용
const SHOP_NAMES = ['치킨', '노래방', 'PC방', '편의점', '약국', '호프', '분식', '부동산', '24시 국밥', '당구장', '고기집', '세탁소',
  '철물점', '포차', '전당포', '오락실', '중국집', '미용실', '안경', '떡볶이', '사우나', '만화방', '횟집', '정육점', '꽃집', '수선'];
const SIGN_COLORS = [[0xc0392b, 0xffffff], [0x1f5aa8, 0xffffff], [0xf2c20f, 0x222222], [0x1e8a4a, 0xffffff], [0xf4f4f4, 0xc0392b],
  [0x222222, 0xffd23a], [0x7a2bb0, 0xffffff], [0xff7a1a, 0xffffff], [0xe8336b, 0xffffff], [0x0f6b6b, 0xfff3a0]];
const SV = 0.06; // 간판 복셀 크기 (글자가 보이도록 작게)

// 캔버스에 글자를 그린 뒤 픽셀을 복셀로 옮겨 간판 메시를 만듦
export function makeSign(r, text, w, h, bg, fg, vertical) {
  const W = Math.max(6, Math.round(w / SV)), H = Math.max(6, Math.round(h / SV));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const face = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", "Noto Sans CJK KR", sans-serif';
  if (!vertical) {
    let fs = H - 3;
    ctx.font = `bold ${fs}px ${face}`;
    const tw = ctx.measureText(text).width;
    if (tw > W - 4) { fs = Math.max(6, Math.floor(fs * (W - 4) / tw)); ctx.font = `bold ${fs}px ${face}`; }
    ctx.fillText(text, W / 2, H / 2 + 1);
  } else {
    const chars = [...text.replace(/\s/g, '')];
    const fs = Math.max(6, Math.min(W - 2, Math.floor((H - 2) / chars.length)));
    ctx.font = `bold ${fs}px ${face}`;
    chars.forEach((c, i) => ctx.fillText(c, W / 2, 1 + fs * (i + 0.5) + 1));
  }
  const img = ctx.getImageData(0, 0, W, H).data;
  const border = [bg].map(c => (((c >> 16) & 255) * .6) << 16 | (((c >> 8) & 255) * .6) << 8 | ((c & 255) * .6))[0];
  const g = new VoxGrid(W, H, 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
    g.set(x, H - 1 - y, 0, edge ? border : bg);
    if (!edge && img[(y * W + x) * 4] > 110) g.set(x, H - 1 - y, 1, fg);
  }
  return meshGrid(r, g, SV, [0, 0, 0]).mesh;
}

// 상가 건물 줄: 1층 유리 상점, 위층 창문, 간판 위치 기록. ids: 블록 id 모음
export function buildCityBlocks(w, L, ids, rng) {
  const signs = [];
  let bx = -12;
  while (bx < L + 14) {
    const bw = randi(4, 8), bd = randi(5, 8), bh = randi(5, 14);
    const zf = -6;
    const col = ids.build[randi(0, ids.build.length - 1)];
    for (let x = bx; x < bx + bw; x++) {
      for (let z = zf - bd + 1; z <= zf; z++) {
        for (let y = 0; y < bh; y++) {
          let b = col;
          const front = z === zf;
          if (front && y < 2 && x > bx && x < bx + bw - 1) b = ids.glass;                 // 1층 상점 유리
          else if (front && y === 2) b = ids.trim;                                        // 간판 받침 띠
          else if (front && y > 2 && y % 2 === 0 && (x - bx) % 2 === 1 && y < bh - 1) b = ids.glass; // 창문
          w.set(x, y, z, b);
        }
      }
      if (Math.random() < 0.35) w.set(x, bh, zf - bd + 1, ids.trim); // 옥상 난간
    }
    // 가로 간판 (1층 위)
    if (Math.random() < 0.9 && bw >= 4) {
      const sw = Math.min(bw - 0.6, rand(2.6, 4.2));
      signs.push({ x: bx + (bw - sw) / 2, y: 2.12, z: zf + 1.02, w: sw, h: 0.8, vertical: false });
    }
    // 세로 간판 (건물 모서리)
    if (Math.random() < 0.45 && bh >= 6) {
      signs.push({ x: bx + 0.15, y: 3.2, z: zf + 1.02, w: 0.62, h: rand(2.2, 3.2), vertical: true });
    }
    // 위층 간판 (2층 이상 상가)
    if (Math.random() < 0.35 && bh >= 8) {
      const sw = Math.min(bw - 1, rand(2, 3.2));
      signs.push({ x: bx + (bw - sw) / 2, y: 5.1, z: zf + 1.02, w: sw, h: 0.7, vertical: false });
    }
    bx += bw + (Math.random() < 0.18 ? 2 : 0); // 가끔 건물 사이 좁은 틈(골목 입구)
  }
  // 먼 뒤쪽의 고층 스카이라인
  for (let x = -14; x < L + 16; x += randi(3, 6)) {
    const hgt = randi(10, 26), z0 = randi(-28, -18), ww = randi(3, 6);
    for (let xx = x; xx < x + ww; xx++) for (let zz = z0; zz < z0 + 3; zz++) for (let y = 0; y < hgt; y++) {
      w.set(xx, y, zz, (y % 3 === 1 && (xx + zz) % 2 === 0) ? ids.glass : ids.far);
    }
  }
  return signs;
}

// 간판 메시들 (글자는 겹치지 않게 섞어서 배정)
export function makeSigns(r, specs) {
  const names = shuffle([...SHOP_NAMES]);
  return specs.map((s, i) => {
    const [bg, fg] = pick(SIGN_COLORS);
    const text = names[i % names.length];
    return { ...s, mesh: makeSign(r, text, s.w, s.h, bg, fg, s.vertical) };
  });
}

// 도로 표시: 노란 중앙선, 흰 가장자리 선, 횡단보도
export function buildRoadMarks(r, L, isPit) {
  const mb = new MeshBuilder();
  const top = FACES[2];
  const Y = [1, .82, .1], WH = [.95, .95, .92];
  const y = 0.012;
  const strip = (x0, x1, z0, z1, c) => {
    for (let x = x0; x < x1; x += 1) {
      const xe = Math.min(x1, x + 1);
      if (isPit(x + 0.5, (z0 + z1) / 2)) continue;
      mb.quad(top, x, y - 1, z0, xe - x, 1, z1 - z0, c);
    }
  };
  strip(-12, L + 14, 1.38, 1.5, Y);   // 중앙선 (2줄)
  strip(-12, L + 14, 1.6, 1.72, Y);
  strip(-12, L + 14, -1.85, -1.75, WH); // 가장자리 선
  strip(-12, L + 14, 4.75, 4.85, WH);
  for (let x = -12; x < L + 14; x += 4) strip(x, x + 2, -0.3, -0.2, WH); // 차선 점선
  // 횡단보도 2곳
  for (const cx of [randi(10, L * 0.45), randi(L * 0.55, L - 12)]) {
    for (let k = 0; k < 7; k++) {
      const x = cx + k * 0.9;
      if (isPit(x + .2, 1.5)) continue;
      mb.quad(top, x, y - 1, -1.6, 0.45, 1, 6.2, WH);
    }
  }
  return mb.build(r);
}

// 전봇대 위치와 그 사이에 늘어진 전선(인스턴스 큐브)
export function buildPoles(L) {
  const poles = [];
  for (let x = 4 + rand(0, 4); x < L + 8; x += rand(11, 14)) poles.push({ x, z: -5.1 });
  const inst = [];
  const C = hexToRgb(0x1a1a1c);
  for (let i = 0; i + 1 < poles.length; i++) {
    const a = poles[i], b = poles[i + 1];
    for (const dz of [-0.6, -0.2, 0.25, 0.65]) {
      const y0 = 6.0 + (dz > 0 ? -0.15 : 0), sag = rand(0.45, 0.8);
      const n = Math.ceil((b.x - a.x) / 0.14);
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        inst.push(a.x + (b.x - a.x) * t, y0 - sag * Math.sin(Math.PI * t), a.z + dz, 0.045, C[0], C[1], C[2]);
      }
    }
  }
  return { poles, wires: new Float32Array(inst), wireCount: inst.length / 7 };
}

const CAR_COLORS = [0xf2f2f2, 0x1c1c1e, 0xb8bcc2, 0xc0392b, 0x1f5aa8, 0x2e6b3a, 0xd8c8a0];
export const carColorCount = CAR_COLORS.length;
export function carColor(i) { return CAR_COLORS[i % CAR_COLORS.length]; }
