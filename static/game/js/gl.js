// 아주 작은 WebGL2 렌더러: 정점색 메시 + 인스턴스 큐브(파편/그림자)
import { FACES } from './voxel.js';

const LIGHTING = `
uniform vec3 uLight;
uniform vec3 uFogColor;
uniform vec2 uFog;
uniform vec3 uCam;
vec3 shade(vec3 col, vec3 n, vec3 world) {
  float d = max(dot(n, uLight), 0.0);
  float side = abs(n.z) > 0.5 ? 0.92 : 1.0;   // 면마다 밝기 차이 → 블록 느낌
  col *= (0.52 + 0.55 * d) * side;
  float dist = length(world - uCam);
  float f = clamp((dist - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  // 낭떠러지: 아래로 내려갈수록 칠흑같이 어두워짐
  float deep = clamp((world.y + 5.5) / 5.0, 0.0, 1.0);
  col *= mix(0.04, 1.0, deep);
  f *= deep;
  return mix(col, uFogColor, f);
}`;

const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in vec3 aColor2;
layout(location=4) in float aStrip;
uniform mat4 uVP;
uniform mat4 uModel;
out vec3 vColor; out vec3 vColor2; out float vStrip; out vec3 vNormal; out vec3 vWorld; out vec3 vLocal;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vLocal = aPos;
  vWorld = w.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
  vColor = aColor; vColor2 = aColor2; vStrip = aStrip;
  gl_Position = uVP * w;
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vColor; in vec3 vColor2; in float vStrip; in vec3 vNormal; in vec3 vWorld; in vec3 vLocal;
uniform vec4 uTint;
uniform vec4 uSplat;   // x = 묻은 양(0~1), yzw = 무늬 시드
uniform float uTex;
uniform float uAlpha;
out vec4 outColor;
${LIGHTING}
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
void main() {
  vec3 n = normalize(vNormal);
  vec3 col = vColor;
  if (uTex > 0.0) {
    // 블록 표면에 픽셀 텍스처 느낌의 노이즈
    vec3 q = floor((vWorld - n * 0.01) * uTex);
    if (vStrip > 0.5 && abs(n.y) < 0.5) {
      float fy = fract(vWorld.y - 0.0001);
      float edge = 0.76 - floor(hash(vec3(q.x, 7.0, q.z)) * 3.0) / uTex;
      if (fy > edge) col = vColor2;
    }
    col *= 0.88 + 0.22 * hash(q);
  }
  if (uSplat.x > 0.0) {
    // 핏자국: 반 복셀 크기 칸마다 묻었는지 결정 → 양이 늘면 얼룩이 번지고, 줄면 듬성듬성 사라짐
    vec3 q = floor(vLocal * 22.2 + uSplat.yzw);
    float h = hash(q), h2 = hash(q + vec3(3.7, 1.3, 9.1));
    float big = hash(floor(vLocal * 7.4 + uSplat.zwy));   // 큰 덩어리 단위로 뭉치게
    if (h * 0.55 + big * 0.45 < uSplat.x) col = mix(col, vec3(0.36 + 0.3 * h2, 0.015, 0.025), 0.92);
  }
  col = shade(col, n, vWorld);
  col = mix(col, uTint.rgb, uTint.a);
  outColor = vec4(col, uAlpha);
}`;

const IVS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=5) in vec4 aInst;
layout(location=6) in vec3 aIColor;
uniform mat4 uVP;
out vec3 vColor; out vec3 vNormal; out vec3 vWorld;
void main() {
  vec3 w = aInst.xyz + aPos * aInst.w;
  vWorld = w; vNormal = aNormal; vColor = aIColor;
  gl_Position = uVP * vec4(w, 1.0);
}`;

const IFS = `#version 300 es
precision highp float;
in vec3 vColor; in vec3 vNormal; in vec3 vWorld;
uniform float uAlpha;
uniform float uFlat;
out vec4 outColor;
${LIGHTING}
void main() {
  vec3 col = uFlat > 0.5 ? vColor : shade(vColor, normalize(vNormal), vWorld);
  outColor = vec4(col, uAlpha);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function link(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const NO_TINT = [0, 0, 0, 0];
const NO_SPLAT = new Float32Array([0, 0, 0, 0]);

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) throw new Error('이 브라우저는 WebGL2를 지원하지 않습니다.');
    this.gl = gl;
    this.canvas = canvas;
    this.mesh = link(gl, VS, FS);
    this.inst = link(gl, IVS, IFS);
    this.pixelScale = 3;
    this.instCap = 20000;
    this._buildCube();
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  _buildCube() {
    const gl = this.gl;
    const pos = [], nrm = [], idx = [];
    let n = 0;
    for (const f of FACES) {
      for (const c of f.c) { pos.push(c[0] - .5, c[1] - .5, c[2] - .5); nrm.push(...f.n); }
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3); n += 4;
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    this._attr(0, new Float32Array(pos), 3);
    this._attr(1, new Float32Array(nrm), 3);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    this.instBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.instCap * 7 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 28, 0);
    gl.vertexAttribDivisor(5, 1);
    gl.enableVertexAttribArray(6);
    gl.vertexAttribPointer(6, 3, gl.FLOAT, false, 28, 16);
    gl.vertexAttribDivisor(6, 1);
    gl.bindVertexArray(null);
    this.cubeVao = vao;
  }

  _attr(loc, data, size) {
    const gl = this.gl;
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return b;
  }

  resize() {
    // 캔버스는 CSS로 16:9 고정된 #stage를 채움
    const w = Math.max(1, Math.floor((this.canvas.clientWidth || window.innerWidth) / this.pixelScale));
    const h = Math.max(1, Math.floor((this.canvas.clientHeight || window.innerHeight) / this.pixelScale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
    return w / h;
  }

  createMesh(d) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const bufs = [
      this._attr(0, d.positions, 3),
      this._attr(1, d.normals, 3),
      this._attr(2, d.colors, 3),
      this._attr(3, d.colors2, 3),
      this._attr(4, d.strip, 1),
    ];
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, d.indices, gl.STATIC_DRAW);
    bufs.push(ib);
    gl.bindVertexArray(null);
    return { vao, count: d.indices.length, bufs };
  }

  deleteMesh(m) {
    if (!m) return;
    const gl = this.gl;
    m.bufs.forEach(b => gl.deleteBuffer(b));
    gl.deleteVertexArray(m.vao);
  }

  begin(vp, cam, env) {
    const gl = this.gl;
    this.vp = vp;
    gl.clearColor(env.sky[0], env.sky[1], env.sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const L = [-0.42, 0.85, 0.55];
    const ll = Math.hypot(...L);
    for (const prog of [this.mesh, this.inst]) {
      gl.useProgram(prog.p);
      gl.uniformMatrix4fv(prog.u.uVP, false, vp);
      gl.uniform3f(prog.u.uLight, L[0] / ll, L[1] / ll, L[2] / ll);
      gl.uniform3fv(prog.u.uFogColor, env.fog);
      gl.uniform2f(prog.u.uFog, env.fogNear, env.fogFar);
      gl.uniform3fv(prog.u.uCam, cam);
    }
    this.current = null;
  }

  drawMesh(mesh, model = IDENTITY, tint = NO_TINT, tex = 0, alpha = 1, splat = NO_SPLAT) {
    const gl = this.gl;
    const pr = this.mesh;
    if (this.current !== pr) { gl.useProgram(pr.p); this.current = pr; }
    gl.uniformMatrix4fv(pr.u.uModel, false, model);
    gl.uniform4fv(pr.u.uTint, tint || NO_TINT);
    gl.uniform1f(pr.u.uTex, tex);
    gl.uniform1f(pr.u.uAlpha, alpha);
    gl.uniform4fv(pr.u.uSplat, splat || NO_SPLAT);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
  }

  // data: [x,y,z,size,r,g,b] * count
  drawInstances(data, count, alpha = 1, flat = false) {
    if (count <= 0) return;
    const gl = this.gl;
    const pr = this.inst;
    count = Math.min(count, this.instCap);
    gl.useProgram(pr.p); this.current = pr;
    gl.uniform1f(pr.u.uAlpha, alpha);
    gl.uniform1f(pr.u.uFlat, flat ? 1 : 0);
    gl.bindVertexArray(this.cubeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * 7);
    if (alpha < 1) { gl.enable(gl.BLEND); gl.depthMask(false); }
    gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, count);
    if (alpha < 1) { gl.disable(gl.BLEND); gl.depthMask(true); }
  }
}
