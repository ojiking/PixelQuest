// WebGL2 렌더러: 정점색 메시 + 인스턴스 큐브(파편/그림자)
// 고품질 파이프라인 (config.js RENDER):
//   1) 한 프레임의 그리기 명령을 모아 두었다가(begin … end)
//   2) 해 방향에서 그림자 맵을 그리고 (실시간 그림자)
//   3) 원래 해상도(×기기 픽셀 비율)·다중 표본(MSAA)으로 장면을 그린 뒤
//   4) 후처리: 윤곽선(깊이 경계) · 빛 번짐(불·동전·눈빛) · 색 보정 · 가장자리 어둡게
import { FACES } from './voxel.js';
import { RENDER } from './config.js';

// 휴대폰·태블릿: 그림자 맵·해상도를 조금 낮춘 설정 사용
const IS_MOBILE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const SH_K = IS_MOBILE ? 1 : 2;   // 그림자 가장자리 부드럽게 하는 표본 범위 (PC 5×5, 휴대폰 3×3)

const LIGHTING = `
uniform vec3 uLight;
uniform vec3 uFogColor;
uniform vec2 uFog;
uniform vec3 uCam;
uniform float uLightMode;              // 0 = 예전 조명, 1 = 새 조명
uniform vec3 uSky, uGround, uSun;      // 하늘·땅 환경광, 해
uniform vec4 uPL[8];                   // 불빛: xyz 위치, w 반경
uniform vec4 uPLC[8];                  // 불빛 색(세기 포함)
uniform int uPLN;
uniform float uRim;                    // 가장자리 빛 (캐릭터만)
uniform vec2 uHFog;                    // 바닥 먼지 안개: x 세기, y 높이(m)
uniform highp sampler2DShadow uShadowMap;
uniform mat4 uLVP;                     // 해 시점 투영 (그림자 맵)
uniform vec3 uShadow;                  // x = 켜짐, y = 그림자 진하기(0~1), z = 그림자 맵 한 칸 크기(uv)
// 해 그림자: 표면을 법선 방향으로 살짝 띄운 지점을 그림자 맵과 비교 (여러 칸 평균 → 부드러운 가장자리)
float sunShadow(vec3 world, vec3 n) {
  if (uShadow.x < 0.5) return 1.0;
  vec4 p = uLVP * vec4(world + n * 0.03, 1.0);
  vec3 s = p.xyz / p.w * 0.5 + 0.5;
  if (s.x <= 0.0 || s.y <= 0.0 || s.x >= 1.0 || s.y >= 1.0 || s.z >= 1.0) return 1.0;
  float sum = 0.0;
  for (int i = -${SH_K}; i <= ${SH_K}; i++) for (int j = -${SH_K}; j <= ${SH_K}; j++)
    sum += texture(uShadowMap, vec3(s.xy + vec2(float(i), float(j)) * uShadow.z * ${(1.5 / SH_K).toFixed(2)}, s.z - 0.0006));
  float sh = sum / ${((2 * SH_K + 1) ** 2).toFixed(1)};
  vec2 e = min(s.xy, 1.0 - s.xy);                         // 맵 가장자리에서는 서서히 그림자 없음
  sh = mix(1.0, sh, clamp(min(e.x, e.y) * 20.0, 0.0, 1.0));
  return mix(1.0, sh, uShadow.y);
}
vec3 shade(vec3 col, vec3 n, vec3 world) {
  float d = max(dot(n, uLight), 0.0);
  if (uLightMode < 0.5) {
    float side = abs(n.z) > 0.5 ? 0.92 : 1.0;   // 면마다 밝기 차이 → 블록 느낌
    col *= (0.52 + 0.55 * d) * side;
  } else {
    float side = abs(n.z) > 0.5 ? 0.94 : 1.0;
    float sh = d > 0.0 ? sunShadow(world, n) : 1.0;
    vec3 lit = (mix(uGround, uSky, n.y * 0.5 + 0.5) + uSun * d * sh) * side;   // 하늘·땅 환경광 + 따뜻한 해(그림자)
    for (int i = 0; i < 8; i++) {                                          // 불빛
      if (i >= uPLN) break;
      vec3 lv = uPL[i].xyz - world;
      float dist = max(length(lv), 0.001);
      float a = clamp(1.0 - dist / uPL[i].w, 0.0, 1.0);
      lit += uPLC[i].rgb * a * a * (max(dot(n, lv / dist), 0.0) * 0.75 + 0.25);
    }
    col *= lit;
    if (uRim > 0.0) {                                                      // 윤곽 빛
      float r = 1.0 - max(dot(n, normalize(uCam - world)), 0.0);
      col += uRim * r * r * r * vec3(1.0, 0.94, 0.84);
    }
  }
  float dist = length(world - uCam);
  float f = clamp((dist - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  if (uHFog.x > 0.0) {   // 바닥에 깔린 먼지 안개: 낮을수록·멀수록 짙게
    float low = 1.0 - clamp(world.y / uHFog.y, 0.0, 1.0);
    f = max(f, uHFog.x * low * low * clamp((dist - 8.0) / 30.0, 0.0, 1.0));
  }
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
precision highp sampler3D;
in vec3 vColor; in vec3 vColor2; in float vStrip; in vec3 vNormal; in vec3 vWorld; in vec3 vLocal;
uniform vec4 uTint;
uniform sampler3D uStain;  // 배경에 칠해진 핏자국 (월드 좌표 3D 맵)
uniform vec3 uStainO, uStainS;
uniform float uStainOn;
uniform vec4 uSplat;   // x = 묻은 양(0~1), yzw = 무늬 시드
uniform float uTex;
uniform float uAlpha;
uniform vec3 uBlood;   // 피 강조 (config.js RENDER.blood × 바이옴 blood): x 밝기, y 그늘에서도 남기는 최소 밝기, z 젖은 윤기
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
  float bloodAmt = 0.0; vec3 bloodCol = vec3(0.0);   // 이 픽셀의 핏자국 (그늘에서도 묻히지 않게 나중에 다시 끌어올림)
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
  if (uStainOn > 0.5) {
    // 표면 바로 안쪽 지점의 핏자국 양을 읽어 칠함 (픽셀 단위로 또렷하게)
    vec3 sp = (vWorld - n * 0.03 - uStainO) * uStainS;
    if (all(greaterThanEqual(sp, vec3(0.0))) && all(lessThan(sp, vec3(1.0)))) {
      float v = texture(uStain, sp).r;
      if (v > 0.06) {
        float h = hash(floor((vWorld - n * 0.03) * 20.0));
        // 아트 기준 팔레트: 막 튄 피 #E0182C · 기본 #C8102E → 많이 묻을수록 마른 피 #7A0A14 쪽으로
        vec3 fresh = vec3(0.70 + 0.14 * h, 0.025, 0.06), dried = vec3(0.38, 0.02, 0.04);
        float h3 = hash(floor((vWorld - n * 0.03) * 7.0));   // 큰 얼룩 단위로 진하기가 달라 고인 피처럼
        vec3 blood = mix(fresh, dried, clamp(v * 0.9 - 0.15 + h3 * 0.3, 0.0, 0.85)) * uBlood.x;
        float a = min(0.97, 0.6 + v * 0.6);
        col = mix(col, blood, a);
        bloodAmt = a; bloodCol = blood;
      }
    }
  }
  if (uSplat.x > 0.0) {
    // 핏자국: 반 복셀 크기 칸마다 묻었는지 결정 → 양이 늘면 얼룩이 번지고, 줄면 듬성듬성 사라짐
    vec3 q = floor(vLocal * 22.2 + uSplat.yzw);
    float h = hash(q), h2 = hash(q + vec3(3.7, 1.3, 9.1));
    float big = hash(floor(vLocal * 7.4 + uSplat.zwy));   // 큰 덩어리 단위로 뭉치게
    if (h * 0.55 + big * 0.45 < uSplat.x) { vec3 b = vec3(0.62 + 0.25 * h2, 0.04, 0.08) * uBlood.x; col = mix(col, b, 0.92); bloodAmt = 0.92; bloodCol = b; }
  }
  vec3 lit = shade(col, n, vWorld);
  if (bloodAmt > 0.0) {
    // 어두운 바닥·그늘에서도 피가 가라앉지 않게 최소 밝기를 보장 + 위를 향한 면은 젖은 윤기 (안개는 그대로 적용)
    float fog = clamp((length(vWorld - uCam) - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
    vec3 floorB = mix(bloodCol * uBlood.y, uFogColor, fog);
    lit = mix(lit, max(lit, floorB), bloodAmt);
    float r = 1.0 - max(dot(n, normalize(uCam - vWorld)), 0.0);
    lit += bloodAmt * uBlood.z * max(n.y, 0.0) * (0.35 + 0.65 * r * r) * vec3(1.0, 0.3, 0.3);
  }
  col = lit;
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

// ---------------- 그림자 맵 (깊이만)
const SVS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uLVP, uModel;
void main() { gl_Position = uLVP * uModel * vec4(aPos, 1.0); }`;
const SIVS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=5) in vec4 aInst;
uniform mat4 uLVP;
void main() { gl_Position = uLVP * vec4(aInst.xyz + aPos * aInst.w, 1.0); }`;
const SFS = `#version 300 es
precision mediump float;
void main() {}`;

// ---------------- 후처리 (화면 전체 삼각형)
const PVS = `#version 300 es
out vec2 vUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
// 밝은 부분 추출 (불·동전·광폭 눈빛만 번지게: 아주 밝은 곳만)
const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uPx; uniform float uThr;
out vec4 o;
vec3 b(vec2 uv) { vec3 c = texture(uTex, uv).rgb; float m = max(c.r, max(c.g, c.b)); return c * smoothstep(uThr, uThr + 0.18, m); }
void main() { o = vec4((b(vUV + uPx * vec2(-1, -1)) + b(vUV + uPx * vec2(1, -1)) + b(vUV + uPx * vec2(-1, 1)) + b(vUV + uPx * vec2(1, 1))) * 0.25, 1.0); }`;
const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uDir;
out vec4 o;
void main() {
  vec3 c = texture(uTex, vUV).rgb * 0.227;
  c += (texture(uTex, vUV + uDir * 1.385).rgb + texture(uTex, vUV - uDir * 1.385).rgb) * 0.316;
  c += (texture(uTex, vUV + uDir * 3.231).rgb + texture(uTex, vUV - uDir * 3.231).rgb) * 0.070;
  o = vec4(c, 1.0);
}`;
const COMP_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene, uBloom, uDepth;
uniform vec2 uPx;          // 화면 한 픽셀(uv)
uniform vec2 uNF;          // 카메라 near·far
uniform vec4 uOutline;     // x 세기, y 두께(px), z 상대 깊이 차, w 사라지는 거리(m)
uniform vec4 uGrade;       // x 대비, y 채도, z 비네트, w 빛 번짐 세기
uniform vec3 uLift;        // 그늘 색 (아주 살짝 따뜻하게)
uniform float uOn;
out vec4 o;
float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNF.x * uNF.y / (uNF.y + uNF.x - z * (uNF.y - uNF.x)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture(uScene, vUV).rgb;
  if (uOn > 0.5) {
    // 윤곽선: 이웃 픽셀이 훨씬 가까우면(물체 경계 바깥쪽) 어둡게 → 실루엣이 또렷하게
    float d0 = lin(texture(uDepth, vUV).r), edge = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 off = (i == 0 ? vec2(1, 0) : i == 1 ? vec2(-1, 0) : i == 2 ? vec2(0, 1) : vec2(0, -1)) * uPx * uOutline.y;
      float dn = lin(texture(uDepth, vUV + off).r);
      float gap = d0 - dn;
      if (gap > max(0.25, d0 * uOutline.z)) edge = max(edge, clamp(1.0 - dn / uOutline.w, 0.0, 1.0));
    }
    c *= 1.0 - uOutline.x * edge;
    c += texture(uBloom, vUV).rgb * uGrade.w;
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(vec3(l), c, uGrade.y);                                    // 채도
    c = (c - 0.5) * uGrade.x + 0.5;                                   // 대비
    c += uLift * (1.0 - smoothstep(0.0, 0.45, l));                    // 그늘을 살짝 따뜻하게
    vec2 q = vUV - 0.5;
    c *= 1.0 - uGrade.z * pow(clamp(length(q * vec2(1.0, 0.8)) * 1.35, 0.0, 1.0), 2.4);   // 비네트
    c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;                       // 띠 무늬 방지
  }
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
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
const NO_TINT = new Float32Array([0, 0, 0, 0]);
const NO_SPLAT = new Float32Array([0, 0, 0, 0]);

// 4×4 행렬 (열 우선)
function mul(o, a, b) {
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
    o[i * 4 + j] = s;
  }
  return o;
}
function lookAt(o, e, c, up) {
  let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  o.set([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
  return o;
}
function ortho(o, l, r, b, t, n, f) {
  o.fill(0);
  o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n);
  o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1;
  return o;
}

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) throw new Error('이 브라우저는 WebGL2를 지원하지 않습니다.');
    this.gl = gl;
    this.canvas = canvas;
    this.cfg = { ...RENDER, ...(IS_MOBILE ? RENDER.mobile : {}) };
    this.mesh = link(gl, VS, FS);
    this.inst = link(gl, IVS, IFS);
    this.smesh = link(gl, SVS, SFS);
    this.sinst = link(gl, SIVS, SFS);
    this.pBright = link(gl, PVS, BRIGHT_FS);
    this.pBlur = link(gl, PVS, BLUR_FS);
    this.pComp = link(gl, PVS, COMP_FS);
    this.emptyVao = gl.createVertexArray();
    this.lightMode = 1;    // 1 = 새 조명(환경광·불빛·윤곽 빛·그림자), 0 = 예전 조명
    this.hq ??= 1;          // 1 = 고품질 파이프라인(그림자·후처리), 0 = 끔 (무기방 비교용)
    this.rim = 0;          // 다음에 그리는 메시의 윤곽 빛 세기 (캐릭터를 그릴 때만 켬)
    this.plBuf = new Float32Array(32); this.plcBuf = new Float32Array(32);
    this.pixelScale = 1;   // 기본값 (config.js CAMERA.pixelScale로 덮어씀)
    this.instCap = 20000;
    this.cmds = []; this.arena = new Float32Array(1 << 16); this.arenaN = 0; this.recording = false;
    this.lvp = new Float32Array(16); this.lview = new Float32Array(16); this.lproj = new Float32Array(16);
    this.samples = Math.min(this.cfg.msaa | 0, gl.getParameter(gl.MAX_SAMPLES) | 0);
    // 그래픽카드 없이 CPU로 그리는 환경(소프트웨어 렌더러)은 고품질이 너무 느림 → 가벼운 설정으로
    // (자동 테스트 환경 포함. 스크린샷 확인용으로는 window.__forceHQ = true 로 강제)
    let gpu = '';
    try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch {}
    this.software = /swiftshader|llvmpipe|software|basic render/i.test(gpu) && !(typeof window !== 'undefined' && window.__forceHQ);
    if (this.software) this.hq = 0;
    this._buildCube();
    this._initShadow();
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

  // ---------------------------------------------------------------- 그림자 맵·화면 버퍼
  _initShadow() {
    const gl = this.gl, S = this.cfg.shadowSize;
    const t = this.shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, S, S);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.shadowFB = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, t, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    this.shadowOK = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // 그림자 맵은 텍스처 2번 칸에 계속 묶어 둠
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, t); gl.activeTexture(gl.TEXTURE0);
    for (const pr of [this.mesh, this.inst]) { gl.useProgram(pr.p); gl.uniform1i(pr.u.uShadowMap, 2); }
  }

  _tex(w, h, ifmt, fmt, type, filter) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  _fb(color, depth) {
    const gl = this.gl, fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    if (color) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
    if (depth) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
    return fb;
  }
  _freeTargets() {
    const gl = this.gl, T = this.tg;
    if (!T) return;
    for (const t of [T.color, T.depth, T.b1, T.b2]) gl.deleteTexture(t);
    for (const f of [T.fb, T.fbB1, T.fbB2, T.msFB]) if (f) gl.deleteFramebuffer(f);
    for (const r of [T.msC, T.msD]) if (r) gl.deleteRenderbuffer(r);
    this.tg = null;
  }
  _targets(w, h) {
    if (this.tg && this.tg.w === w && this.tg.h === h) return this.tg;
    this._freeTargets();
    const gl = this.gl, T = { w, h };
    T.color = this._tex(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
    T.depth = this._tex(w, h, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.NEAREST);
    T.fb = this._fb(T.color, T.depth);
    T.ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (this.samples > 1) {   // 다중 표본(계단 현상 제거) → 끝나면 위 텍스처로 풀어 옮김
      T.msFB = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.msFB);
      T.msC = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, T.msC);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, gl.RGBA8, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, T.msC);
      T.msD = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, T.msD);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, this.samples, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, T.msD);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { gl.deleteFramebuffer(T.msFB); T.msFB = null; }
    }
    const bw = Math.max(1, w >> 2), bh = Math.max(1, h >> 2);   // 빛 번짐은 1/4 해상도
    T.bw = bw; T.bh = bh;
    T.b1 = this._tex(bw, bh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR); T.fbB1 = this._fb(T.b1, null);
    T.b2 = this._tex(bw, bh, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR); T.fbB2 = this._fb(T.b2, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return (this.tg = T);
  }

  resize() {
    // 캔버스는 CSS로 16:9 고정된 #stage를 채움. 기기 픽셀 비율만큼 선명하게 (상한 RENDER.dprMax)
    const dpr = Math.min(window.devicePixelRatio || 1, this.cfg.dprMax);
    const w = Math.max(1, Math.floor((this.canvas.clientWidth || window.innerWidth) * dpr / this.pixelScale));
    const h = Math.max(1, Math.floor((this.canvas.clientHeight || window.innerHeight) * dpr / this.pixelScale));
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
    m.dead = true;
  }

  // ---------------------------------------------------------------- 프레임 시작: 명령 기록 시작
  // env: sky, fog, fogNear, fogFar, hfog, light, lights, near/far(카메라), focus(그림자 중심)
  begin(vp, cam, env) {
    if (this.recording) this.end();
    this.vp = vp; this.cam = cam; this.env = env;
    this.cmds.length = 0; this.arenaN = 0; this.recording = true;
  }

  drawMesh(mesh, model = IDENTITY, tint = NO_TINT, tex = 0, alpha = 1, splat = NO_SPLAT, stained = false) {
    if (!this.recording) return;
    this.cmds.push({ k: 0, mesh, model: Float32Array.from(model), tint: tint ? Float32Array.from(tint) : NO_TINT, tex, alpha, splat: splat ? Float32Array.from(splat) : NO_SPLAT, stained, rim: this.rim });
  }

  // data: [x,y,z,size,r,g,b] * count
  drawInstances(data, count, alpha = 1, flat = false) {
    if (!this.recording || count <= 0) return;
    count = Math.min(count, this.instCap);
    const n = count * 7;
    if (this.arenaN + n > this.arena.length) {
      const a = new Float32Array(Math.max(this.arena.length * 2, this.arenaN + n));
      a.set(this.arena.subarray(0, this.arenaN)); this.arena = a;   // 명령은 위치(off)만 기억하므로 그대로 유효
    }
    this.arena.set(data.subarray ? data.subarray(0, n) : data.slice(0, n), this.arenaN);
    this.cmds.push({ k: 1, off: this.arenaN, count, alpha, flat });
    this.arenaN += n;
  }

  // 해 시점 투영: 그림자 중심(focus) 주변 상자, 그림자 맵 한 칸 단위로 맞춰 떨림 방지
  _lightMatrix(focus) {
    const L = this.sunDir, R = this.cfg.shadowRange, D = 90;
    lookAt(this.lview, [focus[0] + L[0] * D, focus[1] + L[1] * D, focus[2] + L[2] * D], focus, [0, 1, 0]);
    ortho(this.lproj, -R, R, -R, R, 1, D * 2);
    mul(this.lvp, this.lproj, this.lview);
    const S = this.cfg.shadowSize, m = this.lvp;
    const ox = m[12] * S / 2, oy = m[13] * S / 2;
    m[12] += (Math.round(ox) - ox) * 2 / S; m[13] += (Math.round(oy) - oy) * 2 / S;
  }

  _frameUniforms(prog, shadowOn) {
    const gl = this.gl, env = this.env, u = prog.u;
    gl.useProgram(prog.p);
    gl.uniformMatrix4fv(u.uVP, false, this.vp);
    gl.uniform3fv(u.uLight, this.sunDir);
    gl.uniform3fv(u.uFogColor, env.fog);
    gl.uniform2f(u.uFog, env.fogNear, env.fogFar);
    gl.uniform3fv(u.uCam, this.cam);
    gl.uniform1f(u.uLightMode, this.lightMode);
    if (env.light) { gl.uniform3fv(u.uSky, env.light.sky); gl.uniform3fv(u.uGround, env.light.ground); gl.uniform3fv(u.uSun, env.light.sun); }
    const ls = this.lightMode ? (env.lights || []) : [], n = Math.min(8, ls.length);
    for (let i = 0; i < n; i++) { const l = ls[i]; this.plBuf.set([l.x, l.y, l.z, l.r], i * 4); this.plcBuf.set([l.c[0] * l.k, l.c[1] * l.k, l.c[2] * l.k, 0], i * 4); }
    gl.uniform1i(u.uPLN, n);
    if (n) { gl.uniform4fv(u['uPL[0]'], this.plBuf); gl.uniform4fv(u['uPLC[0]'], this.plcBuf); }
    gl.uniform1f(u.uRim, 0);
    gl.uniform2fv(u.uHFog, this.lightMode && env.hfog ? env.hfog : [0, 1]);
    gl.uniformMatrix4fv(u.uLVP, false, this.lvp);
    gl.uniform3f(u.uShadow, shadowOn ? 1 : 0, env.shadowK ?? this.cfg.shadowStrength, 1 / this.cfg.shadowSize);
    if (u.uBlood) { const B = this.cfg.blood, b = env.blood || {}; gl.uniform3f(u.uBlood, B.k * (b.k ?? 1), B.floor * (b.floor ?? 1), this.lightMode ? B.wet * (b.wet ?? 1) : 0); }
  }

  // ---------------------------------------------------------------- 프레임 끝: 그림자 → 장면 → 후처리
  end() {
    if (!this.recording) return;
    this.recording = false;
    const gl = this.gl, env = this.env, cfg = this.cfg, W = this.canvas.width, H = this.canvas.height;
    const L = [-0.42, 0.85, 0.55], ll = Math.hypot(...L);
    this.sunDir = [L[0] / ll, L[1] / ll, L[2] / ll];
    const hq = this.hq && this.lightMode;
    const T = hq ? this._targets(W, H) : null;
    const post = hq && T.ok;
    const shadowOn = hq && this.shadowOK && cfg.shadowSize > 0;

    // 1) 그림자 맵: 불투명한 메시·입체 파편만 (반투명 안개막·평면 표시는 제외)
    if (shadowOn) {
      const focus = env.focus ?? [this.cam[0], 0, -2];
      this._lightMatrix(focus);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
      gl.viewport(0, 0, cfg.shadowSize, cfg.shadowSize);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3);
      const sm = this.smesh, si = this.sinst;
      gl.useProgram(sm.p); gl.uniformMatrix4fv(sm.u.uLVP, false, this.lvp);
      for (const c of this.cmds) {
        if (c.k !== 0 || c.alpha < 1 || c.mesh.dead || c.mesh.noShadow) continue;
        gl.uniformMatrix4fv(sm.u.uModel, false, c.model);
        gl.bindVertexArray(c.mesh.vao);
        gl.drawElements(gl.TRIANGLES, c.mesh.count, gl.UNSIGNED_INT, 0);
      }
      gl.useProgram(si.p); gl.uniformMatrix4fv(si.u.uLVP, false, this.lvp);
      gl.bindVertexArray(this.cubeVao);
      for (const c of this.cmds) {
        if (c.k !== 1 || c.flat || c.alpha < 1) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.arena, c.off, c.count * 7);
        gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, c.count);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    // 2) 장면
    gl.bindFramebuffer(gl.FRAMEBUFFER, post ? (T.msFB || T.fb) : null);
    gl.viewport(0, 0, W, H);
    gl.clearColor(env.sky[0], env.sky[1], env.sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this._frameUniforms(this.mesh, shadowOn);
    this._frameUniforms(this.inst, shadowOn);
    this.current = null;
    for (const c of this.cmds) {
      if (c.k === 0) this._drawMesh(c); else this._drawInst(c);
    }

    // 3) 후처리
    if (post) {
      if (T.msFB) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.msFB);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.fb);
        gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
      }
      gl.disable(gl.DEPTH_TEST);
      gl.bindVertexArray(this.emptyVao);
      const full = (prog, fb, w, h) => { gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, w, h); gl.useProgram(prog.p); return prog.u; };
      // 빛 번짐: 밝은 곳 추출(1/4) → 가로·세로 흐리기 2번
      let u = full(this.pBright, T.fbB1, T.bw, T.bh);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.color);
      gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uPx, 1 / W, 1 / H); gl.uniform1f(u.uThr, cfg.bloomThreshold);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      for (let i = 0; i < 2; i++) {
        u = full(this.pBlur, T.fbB2, T.bw, T.bh); gl.bindTexture(gl.TEXTURE_2D, T.b1); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, (1 + i) / T.bw, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
        u = full(this.pBlur, T.fbB1, T.bw, T.bh); gl.bindTexture(gl.TEXTURE_2D, T.b2); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, 0, (1 + i) / T.bh); gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      // 합성: 윤곽선 + 빛 번짐 + 색 보정 + 비네트
      u = full(this.pComp, null, W, H);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.color); gl.uniform1i(u.uScene, 0);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, T.b1); gl.uniform1i(u.uBloom, 3);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, T.depth); gl.uniform1i(u.uDepth, 4);
      gl.activeTexture(gl.TEXTURE0);
      const dpr = W / Math.max(1, this.canvas.clientWidth || W);
      gl.uniform2f(u.uPx, 1 / W, 1 / H);
      gl.uniform2f(u.uNF, env.near ?? 0.3, env.far ?? 140);
      const o = cfg.outline, g = cfg.grade;
      gl.uniform4f(u.uOutline, o.k, Math.max(1, o.px * dpr), o.rel, o.fade);
      gl.uniform4f(u.uGrade, g.contrast, g.saturation, g.vignette, cfg.bloom);
      gl.uniform3fv(u.uLift, g.lift);
      gl.uniform1f(u.uOn, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.enable(gl.DEPTH_TEST);
    }
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  _drawMesh(c) {
    const gl = this.gl, pr = this.mesh;
    if (c.mesh.dead) return;
    if (this.current !== pr) { gl.useProgram(pr.p); this.current = pr; }
    gl.uniformMatrix4fv(pr.u.uModel, false, c.model);
    gl.uniform4fv(pr.u.uTint, c.tint);
    if (pr.u.uRim) gl.uniform1f(pr.u.uRim, this.lightMode ? c.rim : 0);
    gl.uniform1f(pr.u.uTex, c.tex);
    gl.uniform1f(pr.u.uAlpha, c.alpha);
    gl.uniform4fv(pr.u.uSplat, c.splat);
    gl.uniform1f(pr.u.uStainOn, c.stained && this.stainTex ? 1 : 0);
    gl.bindVertexArray(c.mesh.vao);
    if (c.alpha < 1) { gl.enable(gl.BLEND); gl.depthMask(false); }   // 반투명(알파 포그 등): 뒤가 비치게, 깊이는 안 씀
    gl.drawElements(gl.TRIANGLES, c.mesh.count, gl.UNSIGNED_INT, 0);
    if (c.alpha < 1) { gl.disable(gl.BLEND); gl.depthMask(true); }
  }

  _drawInst(c) {
    const gl = this.gl, pr = this.inst;
    if (this.current !== pr) { gl.useProgram(pr.p); this.current = pr; }
    gl.uniform1f(pr.u.uAlpha, c.alpha);
    gl.uniform1f(pr.u.uFlat, c.flat ? 1 : 0);
    gl.bindVertexArray(this.cubeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.arena, c.off, c.count * 7);
    if (c.alpha < 1) { gl.enable(gl.BLEND); gl.depthMask(false); }
    gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, c.count);
    if (c.alpha < 1) { gl.disable(gl.BLEND); gl.depthMask(true); }
  }

  // 배경 핏자국 3D 맵 (R8, 한 칸 = 1/res m). origin/size는 월드 좌표
  setStainVolume(data, W, H, D, origin, res) {
    const gl = this.gl;
    if (this.stainTex) gl.deleteTexture(this.stainTex);
    const t = this.stainTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, t);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, W, H, D, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    gl.activeTexture(gl.TEXTURE0);
    this.stainDims = [W, H, D];
    gl.useProgram(this.mesh.p); this.current = this.mesh;
    gl.uniform1i(this.mesh.u.uStain, 1);
    gl.uniform3f(this.mesh.u.uStainO, origin[0], origin[1], origin[2]);
    gl.uniform3f(this.mesh.u.uStainS, res / W, res / H, res / D);
  }
  // 바뀐 상자 영역만 올림 (x0..x1, y0..y1, z0..z1 칸, 끝 포함)
  updateStainVolume(data, b) {
    const gl = this.gl, [W, H] = this.stainDims;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.stainTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, W);
    gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, H);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, b[0]);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, b[2]);
    gl.pixelStorei(gl.UNPACK_SKIP_IMAGES, b[4]);
    gl.texSubImage3D(gl.TEXTURE_3D, 0, b[0], b[2], b[4], b[1] - b[0] + 1, b[3] - b[2] + 1, b[5] - b[4] + 1, gl.RED, gl.UNSIGNED_BYTE, data);
    for (const p of [gl.UNPACK_ROW_LENGTH, gl.UNPACK_IMAGE_HEIGHT, gl.UNPACK_SKIP_PIXELS, gl.UNPACK_SKIP_ROWS, gl.UNPACK_SKIP_IMAGES]) gl.pixelStorei(p, 0);
    gl.activeTexture(gl.TEXTURE0);
  }
}
