// 복셀 그리드와 메시 생성기
export const FACES = [
  { n: [1, 0, 0],  c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0],  c: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1],  c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

export function hash3(x, y, z) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export const hexToRgb = c => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

export class VoxGrid {
  constructor(w, h, d) {
    this.w = w; this.h = h; this.d = d;
    this.data = new Int32Array(w * h * d).fill(-1);
  }
  inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.h && z < this.d; }
  get(x, y, z) { return this.inside(x, y, z) ? this.data[x + this.w * (y + this.h * z)] : -1; }
  set(x, y, z, c) { if (this.inside(x, y, z)) this.data[x + this.w * (y + this.h * z)] = c; }
  fill(x0, y0, z0, x1, y1, z1, c) {
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, z, c);
  }
}

export class MeshBuilder {
  constructor() {
    this.pos = []; this.nrm = []; this.col = []; this.col2 = []; this.strip = []; this.idx = []; this.n = 0;
  }
  quad(face, x, y, z, sx, sy, sz, rgb, rgb2 = rgb, strip = 0) {
    for (const c of face.c) {
      this.pos.push(x + c[0] * sx, y + c[1] * sy, z + c[2] * sz);
      this.nrm.push(face.n[0], face.n[1], face.n[2]);
      this.col.push(rgb[0], rgb[1], rgb[2]);
      this.col2.push(rgb2[0], rgb2[1], rgb2[2]);
      this.strip.push(strip);
    }
    const n = this.n;
    this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    this.n += 4;
  }
  build(renderer) {
    return renderer.createMesh({
      positions: new Float32Array(this.pos),
      normals: new Float32Array(this.nrm),
      colors: new Float32Array(this.col),
      colors2: new Float32Array(this.col2),
      strip: new Float32Array(this.strip),
      indices: new Uint32Array(this.idx),
    });
  }
}

// grid → 메시 + 파편용 복셀 목록 [x,y,z,r,g,b]
// origin: 복셀 좌표 기준 로컬 원점
export function meshGrid(renderer, grid, size, origin = [0, 0, 0]) {
  const mb = new MeshBuilder();
  const voxels = [];
  for (let z = 0; z < grid.d; z++) {
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const c = grid.get(x, y, z);
        if (c < 0) continue;
        const v = 0.93 + hash3(x, y, z) * 0.12;
        const rgb = hexToRgb(c).map(k => Math.min(1, k * v));
        const px = (x - origin[0]) * size, py = (y - origin[1]) * size, pz = (z - origin[2]) * size;
        let exposed = false;
        for (const f of FACES) {
          if (grid.get(x + f.n[0], y + f.n[1], z + f.n[2]) >= 0) continue;
          mb.quad(f, px, py, pz, size, size, size, rgb);
          exposed = true;
        }
        if (exposed) voxels.push(px + size / 2, py + size / 2, pz + size / 2, rgb[0], rgb[1], rgb[2]);
      }
    }
  }
  return { mesh: mb.build(renderer), voxels: new Float32Array(voxels) };
}
