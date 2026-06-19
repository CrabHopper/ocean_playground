import * as THREE from "three";
import { CITY_DIR } from "./constants";
import { uTime } from "./uniforms";
import { GLSL_CAUSTIC } from "./glsl";

// ---------- 地形・水面の高さ（JS側。シェーダのwaveHと一致させる） ----------
export function valueNoise2(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const h = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return h(xi, zi) * (1 - u) * (1 - v) + h(xi + 1, zi) * u * (1 - v)
       + h(xi, zi + 1) * (1 - u) * v + h(xi + 1, zi + 1) * u * v;
}

export function terrainH(x, z) {
  let h = valueNoise2(x * 0.02, z * 0.02) * 2.6 + valueNoise2(x * 0.07 + 9, z * 0.07) * 0.7
        + Math.sin(x * 0.55 + valueNoise2(x * 0.1, z * 0.1) * 4) * 0.06   /* 砂紋 */
        + valueNoise2(x * 0.25, z * 0.25 + 5) * 0.18;
  /* 岸壁へ向かって緩やかに浅くなる港湾の斜面 */
  const s = x * CITY_DIR.x + z * CITY_DIR.z;
  h += THREE.MathUtils.smoothstep(s, 105, 212) * 15.0;
  return h;
}

// JS側の水面高さ（シェーダの GLSL_WAVE と一致）
export function waveSurfaceY(x, z, t) {
  return Math.sin(0.16 * x + 0.12 * z + t * 0.90) * 0.34 + Math.sin(-0.23 * x + 0.18 * z + t * 1.25) * 0.19
       + Math.sin(0.31 * x - 0.27 * z + t * 1.60) * 0.12 + Math.sin(-0.11 * x - 0.35 * z + t * 1.05) * 0.10
       + Math.sin(0.62 * x + 0.51 * z + t * 2.30) * 0.045 + Math.sin(-0.55 * x + 0.76 * z + t * 2.80) * 0.03;
}

// ---------- 砂テクスチャ（微細ノイズbump） ----------
function noiseCanvas(sz, lo, hi) {
  const cv = document.createElement("canvas"); cv.width = cv.height = sz;
  const cx = cv.getContext("2d"); const im = cx.createImageData(sz, sz);
  for (let i = 0; i < sz * sz; i++) {
    const v = lo + Math.random() * (hi - lo);
    im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255;
  }
  cx.putImageData(im, 0, 0); return cv;
}

let _sandBump = null;
export function getSandBump() {
  if (!_sandBump) {
    _sandBump = new THREE.CanvasTexture(noiseCanvas(256, 90, 200));
    _sandBump.wrapS = _sandBump.wrapT = THREE.RepeatWrapping;
    _sandBump.repeat.set(60, 60);
  }
  return _sandBump;
}

// ---------- ジオメトリ結合 / 変換ヘルパ ----------
export function mergeGeos(list) {
  const pos = [], nor = [], uv = [];
  list.forEach((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    pos.push(...ng.attributes.position.array);
    nor.push(...ng.attributes.normal.array);
    const n = ng.attributes.position.count;
    if (ng.attributes.uv) uv.push(...ng.attributes.uv.array);
    else for (let i = 0; i < n; i++) uv.push(0, 0);
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

const M4 = new THREE.Matrix4(), Q4 = new THREE.Quaternion(), V3 = new THREE.Vector3();
export function tg(geo, px, py, pz, rx, ry, rz, sx, sy, sz) {
  M4.compose(V3.set(px, py, pz), Q4.setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  geo.applyMatrix4(M4); return geo;
}

// ---------- 標準マテリアルへ「揺れる水中光（コースティクス）」を注入 ----------
export function addCaustics(mat, strength) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uCau = { value: strength };
    sh.vertexShader = "varying vec3 vWp;\n" + sh.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n vWp = (modelMatrix * vec4(transformed,1.0)).xyz;");
    sh.fragmentShader = ("varying vec3 vWp; uniform float uTime; uniform float uCau;\n"
      + GLSL_CAUSTIC + "\n" + sh.fragmentShader).replace(
      "#include <fog_fragment>",
      `float ca = caustic(vWp.xz*0.16 + vec2(uTime*0.015, -uTime*0.01), uTime*0.55);
       gl_FragColor.rgb += ca * vec3(0.50,0.80,0.88) * uCau;
       #include <fog_fragment>`);
  };
  return mat;
}
