import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const WATER_Y = 18;

function floorHeight(x, z) {
  return (
    Math.sin(x * 0.15) * 0.6 +
    Math.cos(z * 0.12) * 0.5 +
    Math.sin((x + z) * 0.07) * 0.8
  );
}

const CAUSTIC_GLSL = `
float causticPattern(vec2 uv, float t) {
  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
`;
const FOG_GLSL = `
vec3 applyFog(vec3 col, float depth, vec3 fogColor, float density) {
  float f = 1.0 - exp(-density * density * depth * depth);
  return mix(col, fogColor, clamp(f, 0.0, 1.0));
}
`;
const NOISE_GLSL = `
float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x),
             mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return v;
}
`;

function mergeGeos(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((s, g) => s + g.attributes.position.array.length, 0);
  const pos = new Float32Array(total);
  const norm = new Float32Array(total);
  let off = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, off);
    norm.set(g.attributes.normal.array, off);
    off += g.attributes.position.array.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(norm, 3));
  return out;
}

// キャンバスで有機的なまだら模様テクスチャを生成
function makeMottleTexture(base = 215, spots = 420, dark = 26) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < spots; i++) {
    const r = 2 + Math.random() * 14;
    const v = base + (Math.random() - 0.5) * 2 * dark;
    ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, r, 0, 6.3);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function makeSoftSprite() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.4, "rgba(255,255,255,0.32)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function genDrops() {
  const arr = [];
  for (let i = 0; i < 28; i++) {
    arr.push({
      id: `${Date.now()}-${i}`,
      left: Math.random() * 100,
      top: Math.random() * 65,
      size: 5 + Math.random() * 22,
      dur: 2.5 + Math.random() * 5,
      delay: Math.random() * 0.7,
      slide: Math.random() > 0.35,
    });
  }
  return arr;
}

export default function UnderwaterCinematic() {
  const mountRef = useRef(null);
  const swimRef = useRef(false);
  const splashRef = useRef(null);
  const timerRef = useRef(null);
  const [hintVisible, setHintVisible] = useState(true);
  const [drops, setDrops] = useState([]);
  const [splashId, setSplashId] = useState(0);

  splashRef.current = () => {
    setDrops(genDrops());
    setSplashId((s) => s + 1);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDrops([]), 9000);
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const DEEP = new THREE.Color(0x0a3a52);
    const SKYFOG = new THREE.Color(0xcfe2ec);
    const fogColor = DEEP.clone();
    const fogDensity = { value: 0.011 };
    const underFactor = { value: 1 };
    const sharedTime = { value: 0 };
    const sunDir = { value: new THREE.Vector3(0.45, 0.55, -0.55).normalize() };

    const scene = new THREE.Scene();
    scene.background = DEEP.clone();
    scene.fog = new THREE.FogExp2(DEEP.getHex(), 0.011);

    const camera = new THREE.PerspectiveCamera(
      70, mount.clientWidth / mount.clientHeight, 0.1, 1500
    );
    camera.rotation.order = "YXZ";
    camera.position.set(0, 4.5, 14);
    camera.rotation.x = -0.08;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";

    scene.add(new THREE.HemisphereLight(0x9bd6ee, 0x05202c, 0.85));
    const sunLight = new THREE.DirectionalLight(0xeaf6ff, 1.5);
    sunLight.position.set(45, 55, -55);
    scene.add(sunLight);
    const camLight = new THREE.PointLight(0x6fd8e8, 0.35, 18);
    scene.add(camLight);

    const fogU = () => ({
      uFogColor: { value: fogColor },
      uFogDensity: fogDensity,
    });

    // ===== 標準マテリアルに「揺れる水中光」を注入 =====
    // 岩・カニ・魚・手…シーン内の全部の物体の表面でコースティクスが踊る
    const injectCaustics = (mat) => {
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = sharedTime;
        shader.uniforms.uUnder = underFactor;
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec3 vCausticWP;")
          .replace(
            "#include <project_vertex>",
            `#include <project_vertex>
             vec4 cwp = vec4( transformed, 1.0 );
             #ifdef USE_INSTANCING
               cwp = instanceMatrix * cwp;
             #endif
             vCausticWP = (modelMatrix * cwp).xyz;`
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
             uniform float uTime; uniform float uUnder;
             varying vec3 vCausticWP;
             ${CAUSTIC_GLSL}`
          )
          .replace(
            "#include <dithering_fragment>",
            `float cca = causticPattern(vCausticWP.xz * 0.085 + vCausticWP.y * 0.04, uTime * 0.55);
             float cdf = clamp(1.0 - vCausticWP.y / ${WATER_Y.toFixed(1)}, 0.0, 1.0);
             gl_FragColor.rgb += vec3(0.40, 0.72, 0.82) * cca * uUnder * (0.25 + 0.55 * cdf);
             #include <dithering_fragment>`
          );
      };
      return mat;
    };

    // ===== 空(雲の陰影つき) =====
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: sharedTime, uSunDir: sunDir, uUnder: underFactor,
        uFogColor: { value: fogColor },
      },
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 vDir;
        void main(){ vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: `
        uniform float uTime; uniform vec3 uSunDir; uniform float uUnder; uniform vec3 uFogColor;
        varying vec3 vDir;
        ${NOISE_GLSL}
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, 0.0, 1.0);
          vec3 sky = mix(vec3(0.84, 0.91, 0.95), vec3(0.24, 0.52, 0.84), pow(h, 0.5));
          float sd = max(dot(d, uSunDir), 0.0);
          sky += vec3(1.0, 0.97, 0.85) * (pow(sd, 1800.0) * 5.0 + pow(sd, 14.0) * 0.32 + pow(sd, 3.0) * 0.06);
          if (d.y > 0.015) {
            vec2 cuv = d.xz / (d.y + 0.10) * 0.7 + vec2(uTime * 0.006, 0.0);
            float n = fbm(cuv);
            float n2 = fbm(cuv * 2.4 + 7.0);
            float cl = smoothstep(0.50, 0.76, n) * smoothstep(0.0, 0.13, d.y);
            // 雲の底は影、太陽側は明るく
            vec3 cloudCol = mix(vec3(0.72, 0.76, 0.80), vec3(1.04, 1.02, 0.99), smoothstep(0.4, 0.9, n2) * (0.5 + sd * 0.6));
            sky = mix(sky, cloudCol, cl * 0.9);
          }
          sky = mix(vec3(0.58, 0.72, 0.79), sky, smoothstep(-0.04, 0.04, d.y));
          sky = mix(sky, uFogColor, uUnder);
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 16), skyMat);
    scene.add(skyDome);

    // ===== 水面(法線ディテール + 波頭の泡) =====
    const surfMat = new THREE.ShaderMaterial({
      uniforms: { uTime: sharedTime, uSunDir: sunDir, ...fogU() },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorldPos; varying vec3 vNormal; varying float vFogDepth; varying float vWaveH;
        float waveH(vec2 p, float t) {
          return sin(p.x * 0.25 + t * 1.2) * 0.30
               + sin(p.y * 0.20 + t * 0.9) * 0.26
               + sin((p.x + p.y) * 0.12 + t * 0.7) * 0.34
               + sin(p.x * 0.05 - t * 0.4) * 0.45
               + sin(p.y * 0.43 + t * 1.7) * 0.10;
        }
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float e = 0.6;
          float hC = waveH(wp.xz, uTime);
          float hX = waveH(wp.xz + vec2(e, 0.0), uTime);
          float hZ = waveH(wp.xz + vec2(0.0, e), uTime);
          vNormal = normalize(vec3(-(hX - hC) / e, 1.0, -(hZ - hC) / e));
          vWaveH = hC;
          wp.y += hC;
          vWorldPos = wp.xyz;
          vec4 mv = viewMatrix * wp;
          vFogDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uTime; uniform vec3 uSunDir; uniform vec3 uFogColor; uniform float uFogDensity;
        varying vec3 vWorldPos; varying vec3 vNormal; varying float vFogDepth; varying float vWaveH;
        ${CAUSTIC_GLSL}
        ${FOG_GLSL}
        ${NOISE_GLSL}
        void main() {
          vec3 N = normalize(vNormal);
          // 高周波の法線ディテール(さざ波)
          vec2 nuv = vWorldPos.xz * 0.9 + uTime * 0.18;
          N = normalize(N + vec3((vnoise(nuv) - 0.5) * 0.45, 0.0, (vnoise(nuv + 17.3) - 0.5) * 0.45));
          vec3 V = normalize(cameraPosition - vWorldPos);
          vec3 col; float alpha;
          if (gl_FrontFacing) {
            float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
            col = mix(vec3(0.02, 0.16, 0.25), vec3(0.56, 0.74, 0.87), fres * 0.92 + 0.06);
            float spec = pow(max(dot(reflect(-uSunDir, N), V), 0.0), 280.0);
            col += vec3(1.0, 0.96, 0.85) * spec * 4.0;
            col += vec3(0.5, 0.7, 0.8) * causticPattern(vWorldPos.xz * 0.05, uTime * 0.5) * 0.08;
            // 波頭の白い泡
            float foam = smoothstep(0.85, 1.25, vWaveH + (vnoise(vWorldPos.xz * 1.6 + uTime * 0.5) - 0.5) * 0.8);
            foam *= 0.55 + 0.45 * vnoise(vWorldPos.xz * 6.0 + uTime);
            col = mix(col, vec3(0.93, 0.97, 0.98), foam * 0.75);
            alpha = 0.97;
          } else {
            float ca = causticPattern(vWorldPos.xz * 0.06, uTime * 0.6);
            col = mix(vec3(0.03, 0.20, 0.30), vec3(0.6, 0.92, 1.0), ca);
            float sd = max(dot(normalize(vWorldPos - cameraPosition), uSunDir), 0.0);
            col += vec3(1.0) * pow(sd, 60.0) * 2.2 + vec3(0.6, 0.85, 0.95) * pow(sd, 6.0) * 0.25;
            alpha = 0.93;
          }
          col = applyFog(col, vFogDepth, uFogColor, uFogDensity);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(800, 800, 96, 96), surfMat);
    surface.geometry.rotateX(-Math.PI / 2);
    surface.position.y = WATER_Y;
    scene.add(surface);

    // ===== 島 =====
    const makeIsland = (x, z, s) => {
      const g = new THREE.Group();
      const rock = new THREE.Mesh(
        new THREE.ConeGeometry(40 * s, 24 * s, 7),
        new THREE.MeshStandardMaterial({ color: 0x6e6a58, roughness: 1 })
      );
      rock.position.y = WATER_Y + 6 * s;
      const green = new THREE.Mesh(
        new THREE.ConeGeometry(24 * s, 16 * s, 7),
        new THREE.MeshStandardMaterial({ color: 0x4f7a5e, roughness: 1 })
      );
      green.position.y = WATER_Y + 16 * s;
      g.add(rock, green);
      g.position.set(x, 0, z);
      scene.add(g);
    };
    makeIsland(-150, -210, 1);
    makeIsland(190, -140, 0.6);

    // ===== 海底 =====
    const floorGeo = new THREE.PlaneGeometry(170, 170, 110, 110);
    floorGeo.rotateX(-Math.PI / 2);
    {
      const pos = floorGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, floorHeight(pos.getX(i), pos.getZ(i)));
      floorGeo.computeVertexNormals();
    }
    const floorMat = new THREE.ShaderMaterial({
      uniforms: { uTime: sharedTime, ...fogU() },
      vertexShader: `
        varying vec3 vWorldPos; varying vec3 vNormal; varying float vFogDepth;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vNormal = normalize(mat3(modelMatrix) * normal);
          vec4 mv = viewMatrix * wp;
          vFogDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uTime; uniform vec3 uFogColor; uniform float uFogDensity;
        varying vec3 vWorldPos; varying vec3 vNormal; varying float vFogDepth;
        ${CAUSTIC_GLSL}
        ${FOG_GLSL}
        ${NOISE_GLSL}
        void main() {
          vec3 sand = mix(vec3(0.44, 0.39, 0.29), vec3(0.61, 0.54, 0.39), fbm(vWorldPos.xz * 0.6));
          sand *= 0.80 + 0.38 * vnoise(vWorldPos.xz * 8.0);
          float ripple = sin(vWorldPos.x * 2.2 + vnoise(vWorldPos.xz * 0.4) * 6.0) * 0.5 + 0.5;
          sand *= 0.91 + ripple * 0.13;
          vec3 N = normalize(vNormal);
          vec3 L = normalize(vec3(0.35, 1.0, 0.2));
          vec3 V = normalize(cameraPosition - vWorldPos);
          float diff = max(dot(N, L), 0.0) * 0.75 + 0.35;
          vec3 col = sand * diff * vec3(0.5, 0.72, 0.82);
          // 砂粒のキラッとした反射
          float sparkleMask = step(0.985, vnoise(vWorldPos.xz * 60.0));
          col += vec3(0.9) * pow(max(dot(reflect(-L, N), V), 0.0), 18.0) * sparkleMask * 0.6;
          // 二重スケールのコースティクスで網目を鋭く
          float c1 = causticPattern(vWorldPos.xz * 0.085, uTime * 0.55);
          float c2 = causticPattern(vWorldPos.xz * 0.17 + 31.0, uTime * 0.45);
          col += vec3(0.5, 0.85, 0.95) * (c1 * 0.65 + c1 * c2 * 1.5) * clamp(N.y, 0.0, 1.0);
          col = applyFog(col, vFogDepth, uFogColor, uFogDensity);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    scene.add(new THREE.Mesh(floorGeo, floorMat));

    // ===== 光の筋 =====
    const rays = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.ShaderMaterial({
        uniforms: { uTime: sharedTime, uSeed: { value: Math.random() }, uUnder: underFactor },
        transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `
          uniform float uTime; uniform float uSeed; uniform float uUnder;
          varying vec2 vUv;
          void main(){
            float edge = pow(max(1.0 - abs(vUv.x - 0.5) * 2.0, 0.0), 2.6);
            float vert = smoothstep(0.0, 0.12, vUv.y) * pow(vUv.y, 1.6);
            float flick = 0.55 + 0.45 * sin(uTime * 0.6 + uSeed * 13.0);
            gl_FragColor = vec4(vec3(0.62, 0.88, 1.0), edge * vert * flick * 0.11 * uUnder);
          }
        `,
      });
      const g = new THREE.Group();
      const w = 2.5 + Math.random() * 3;
      const p1 = new THREE.Mesh(new THREE.PlaneGeometry(w, 30), m);
      const p2 = new THREE.Mesh(new THREE.PlaneGeometry(w, 30), m);
      p2.rotation.y = Math.PI / 2;
      g.add(p1, p2);
      g.position.set((Math.random() - 0.5) * 60, 11, (Math.random() - 0.5) * 60);
      g.rotation.z = (Math.random() - 0.5) * 0.22;
      scene.add(g);
      rays.push(g);
    }

    // ===== 岩・海藻・サンゴ・ヒトデ・イソギンチャク =====
    const mottle = makeMottleTexture(220, 480, 30);
    const rockMat = injectCaustics(
      new THREE.MeshStandardMaterial({
        color: 0x565c56, roughness: 0.95, map: mottle, bumpMap: mottle, bumpScale: 0.06,
      })
    );
    for (let i = 0; i < 22; i++) {
      const r = 0.4 + Math.random() * 1.8;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), rockMat);
      const x = (Math.random() - 0.5) * 95;
      const z = (Math.random() - 0.5) * 95;
      rock.position.set(x, floorHeight(x, z) + r * 0.25, z);
      rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      rock.scale.y = 0.55 + Math.random() * 0.5;
      scene.add(rock);
    }
    const weeds = [];
    for (let c = 0; c < 8; c++) {
      const cx = (Math.random() - 0.5) * 60;
      const cz = (Math.random() - 0.5) * 60;
      for (let b = 0; b < 4; b++) {
        const h = 2 + Math.random() * 3;
        const geo = new THREE.PlaneGeometry(0.22, h, 1, 8);
        geo.translate(0, h / 2, 0);
        const base = geo.attributes.position.array.slice();
        const mesh = new THREE.Mesh(
          geo,
          injectCaustics(
            new THREE.MeshLambertMaterial({
              color: new THREE.Color().setHSL(0.38 + Math.random() * 0.08, 0.55, 0.24 + Math.random() * 0.1),
              side: THREE.DoubleSide,
            })
          )
        );
        const x = cx + (Math.random() - 0.5) * 2.4;
        const z = cz + (Math.random() - 0.5) * 2.4;
        mesh.position.set(x, floorHeight(x, z) - 0.1, z);
        mesh.rotation.y = Math.random() * Math.PI;
        scene.add(mesh);
        weeds.push({ mesh, base, h, phase: Math.random() * 10 });
      }
    }
    const coralColors = [0xff6f91, 0xff9770, 0xb56ad6, 0xffb04f];
    const makeCoral = (x, z, color) => {
      const mat = injectCaustics(new THREE.MeshStandardMaterial({ color, roughness: 0.8, map: mottle }));
      const root = new THREE.Group();
      const branch = (parent, len, rad, depth) => {
        const geo = new THREE.CylinderGeometry(rad * 0.6, rad, len, 6);
        geo.translate(0, len / 2, 0);
        const m = new THREE.Mesh(geo, mat);
        parent.add(m);
        if (depth > 0) {
          const n = 2 + Math.floor(Math.random() * 2);
          for (let k = 0; k < n; k++) {
            const g = new THREE.Group();
            g.position.y = len * (0.6 + Math.random() * 0.4);
            g.rotation.set((Math.random() - 0.5) * 1.3, Math.random() * 6.28, (Math.random() - 0.5) * 1.3);
            m.add(g);
            branch(g, len * 0.65, rad * 0.65, depth - 1);
          }
        }
      };
      branch(root, 0.9 + Math.random() * 0.5, 0.1, 2);
      root.position.set(x, floorHeight(x, z), z);
      scene.add(root);
    };
    for (let i = 0; i < 5; i++) {
      makeCoral((Math.random() - 0.5) * 40, -4 - Math.random() * 26, coralColors[i % coralColors.length]);
    }
    const starColors = [0xe76f51, 0x9b5de5, 0xf4a261];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      const mat = injectCaustics(
        new THREE.MeshStandardMaterial({ color: starColors[i % 3], roughness: 0.85, map: mottle })
      );
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat));
      for (let a = 0; a < 5; a++) {
        const arm = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat);
        arm.scale.set(1, 0.35, 3.4);
        const ang = (a / 5) * Math.PI * 2;
        arm.position.set(Math.cos(ang) * 0.16, 0, Math.sin(ang) * 0.16);
        arm.rotation.y = -ang + Math.PI / 2;
        g.add(arm);
      }
      const x = (Math.random() - 0.5) * 36;
      const z = -2 - Math.random() * 26;
      g.position.set(x, floorHeight(x, z) + 0.05, z);
      g.scale.setScalar(0.8 + Math.random() * 0.7);
      g.rotation.y = Math.random() * 6;
      scene.add(g);
    }
    const anemones = [];
    const makeAnemone = (x, z, color) => {
      const g = new THREE.Group();
      const base = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 10, 8),
        injectCaustics(new THREE.MeshStandardMaterial({ color: 0x7a5c4a, roughness: 0.9 }))
      );
      base.scale.set(1, 0.55, 1);
      g.add(base);
      const tMat = injectCaustics(
        new THREE.MeshStandardMaterial({
          color, roughness: 0.6, emissive: color, emissiveIntensity: 0.12,
        })
      );
      const tents = [];
      for (let i = 0; i < 14; i++) {
        const geo = new THREE.CylinderGeometry(0.012, 0.022, 0.5, 5);
        geo.translate(0, 0.25, 0);
        const tm = new THREE.Mesh(geo, tMat);
        const ang = (i / 14) * Math.PI * 2;
        tm.position.set(Math.cos(ang) * 0.1, 0.08, Math.sin(ang) * 0.1);
        g.add(tm);
        tents.push({ m: tm, ang, tilt: 0.35 + Math.random() * 0.3, ph: Math.random() * 10 });
      }
      g.position.set(x, floorHeight(x, z), z);
      scene.add(g);
      anemones.push({ tents });
    };
    makeAnemone(-6, -10, 0x7ae7c7);
    makeAnemone(9, -18, 0xffa6c9);

    // ===== 浮遊粒子(2層: 細かいチリ + 手前のボケた粒) =====
    const softTex = makeSoftSprite();
    const makeDust = (count, size, opacity, area) => {
      const geo = new THREE.BufferGeometry();
      const arr = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        arr[i * 3] = (Math.random() - 0.5) * area;
        arr[i * 3 + 1] = Math.random() * (WATER_Y - 0.5);
        arr[i * 3 + 2] = (Math.random() - 0.5) * area;
      }
      geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xd5ecf7, size, transparent: true, opacity,
        depthWrite: false, map: softTex, alphaTest: 0.01,
      });
      const pts = new THREE.Points(geo, mat);
      scene.add(pts);
      return { pts, mat, count };
    };
    const dustFine = makeDust(650, 0.06, 0.5, 90);
    const dustBokeh = makeDust(160, 0.5, 0.16, 60);

    // ===== 泡 =====
    const BUBBLES = 280;
    const vents = [];
    for (let i = 0; i < 6; i++) {
      const x = (Math.random() - 0.5) * 42;
      const z = -2 - Math.random() * 32;
      vents.push(new THREE.Vector3(x, floorHeight(x, z) + 0.1, z));
    }
    const bubbleMat = new THREE.ShaderMaterial({
      uniforms: { ...fogU() },
      transparent: true, depthWrite: false,
      vertexShader: `
        varying vec3 vN; varying vec3 vV; varying float vFogDepth;
        void main() {
          #ifdef USE_INSTANCING
            vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
            vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          #else
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vN = normalize(mat3(modelMatrix) * normal);
          #endif
          vV = normalize(cameraPosition - wp.xyz);
          vec4 mv = viewMatrix * wp;
          vFogDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uFogColor; uniform float uFogDensity;
        varying vec3 vN; varying vec3 vV; varying float vFogDepth;
        ${FOG_GLSL}
        void main() {
          vec3 N = normalize(vN); vec3 V = normalize(vV);
          float fres = pow(1.0 - max(dot(N, V), 0.0), 2.4);
          float spec = pow(max(dot(reflect(-normalize(vec3(0.45,0.55,-0.55)), N), V), 0.0), 90.0);
          vec3 col = mix(vec3(0.30, 0.55, 0.70), vec3(0.8, 0.97, 1.0), fres) + spec;
          float a = 0.07 + fres * 0.62 + spec * 0.6;
          col = applyFog(col, vFogDepth, uFogColor, uFogDensity);
          gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        }
      `,
    });
    const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 10), bubbleMat, BUBBLES);
    bubbles.renderOrder = 2;
    scene.add(bubbles);
    const bData = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < BUBBLES; i++) {
      const vent = vents[i % vents.length];
      bData.push({
        pos: new THREE.Vector3(
          vent.x + (Math.random() - 0.5) * 1.2,
          vent.y + Math.random() * (WATER_Y - vent.y - 1),
          vent.z + (Math.random() - 0.5) * 1.2
        ),
        vel: new THREE.Vector3(0, 0.4 + Math.random() * 0.8, 0),
        size: 0.04 + Math.random() * 0.13,
        phase: Math.random() * 10,
        vent,
      });
    }
    const resetBubble = (b) => {
      b.pos.set(b.vent.x + (Math.random() - 0.5), b.vent.y, b.vent.z + (Math.random() - 0.5));
      b.vel.set(0, 0.35 + Math.random() * 0.85, 0);
      b.size = 0.04 + Math.random() * 0.13;
    };

    // ===== クラゲ =====
    const jellies = [];
    const jellyColors = [0xff9ecf, 0x9fb6ff, 0x8ef0e0, 0xffc0ee, 0xb6a2ff, 0xff8fb0];
    const bellGeo = new THREE.SphereGeometry(0.7, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.58);
    for (let i = 0; i < 6; i++) {
      const color = new THREE.Color(jellyColors[i]);
      const phase = Math.random() * 10;
      const bellMat = new THREE.ShaderMaterial({
        uniforms: { uTime: sharedTime, uPhase: { value: phase }, uColor: { value: color }, ...fogU() },
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        vertexShader: `
          uniform float uTime; uniform float uPhase;
          varying vec3 vN; varying vec3 vV; varying vec3 vPos; varying float vFogDepth;
          void main() {
            vec3 p = position;
            float pulse = sin(uTime * 1.7 + uPhase);
            float rim = clamp(1.0 - p.y / 0.7, 0.0, 1.0);
            p.xz *= 1.0 + pulse * 0.10 + rim * 0.07 * pulse;
            p.y *= 1.0 - pulse * 0.14;
            p += normal * sin(uTime * 3.0 + uPhase + p.y * 5.0) * 0.03 * rim;
            vPos = position;
            vec4 wp = modelMatrix * vec4(p, 1.0);
            vN = normalize(mat3(modelMatrix) * normal);
            vV = normalize(cameraPosition - wp.xyz);
            vec4 mv = viewMatrix * wp;
            vFogDepth = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          uniform vec3 uColor; uniform vec3 uFogColor; uniform float uFogDensity;
          varying vec3 vN; varying vec3 vV; varying vec3 vPos; varying float vFogDepth;
          ${FOG_GLSL}
          void main() {
            float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
            float stripes = 0.85 + 0.15 * sin(atan(vPos.z, vPos.x) * 14.0);
            vec3 col = uColor * (0.30 + fres * 1.2) * stripes + uColor * 0.22;
            col = applyFog(col, vFogDepth, uFogColor, uFogDensity);
            gl_FragColor = vec4(col, 0.10 + fres * 0.58);
          }
        `,
      });
      const g = new THREE.Group();
      const bell = new THREE.Mesh(bellGeo, bellMat);
      bell.renderOrder = 2;
      g.add(bell);
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 12, 10),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.4,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      core.position.y = 0.18;
      g.add(core);
      const tentacles = [];
      const tentMat = new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending,
      });
      for (let t = 0; t < 9; t++) {
        const pts = [];
        for (let s = 0; s < 11; s++) pts.push(new THREE.Vector3(0, -s * 0.22, 0));
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), tentMat);
        const ang = (t / 9) * Math.PI * 2;
        line.position.set(Math.cos(ang) * 0.45, 0, Math.sin(ang) * 0.45);
        g.add(line);
        tentacles.push({ line, ang });
      }
      g.position.set((Math.random() - 0.5) * 38, 4 + Math.random() * 9, -4 - Math.random() * 32);
      g.scale.setScalar(0.7 + Math.random() * 0.9);
      scene.add(g);
      jellies.push({
        g, core, tentacles, phase,
        drift: new THREE.Vector3((Math.random() - 0.5) * 0.25, 0, (Math.random() - 0.5) * 0.25),
        push: new THREE.Vector3(),
      });
    }

    // ===== 魚 =====
    const FISH = 44;
    const fishBody = new THREE.SphereGeometry(0.16, 12, 9);
    fishBody.scale(0.34, 0.62, 1.7);
    const fishTail = new THREE.PlaneGeometry(0.05, 0.2);
    fishTail.rotateY(Math.PI / 2);
    fishTail.scale(1, 1, 3.2);
    fishTail.translate(0, 0, -0.33);
    const fishDorsal = new THREE.PlaneGeometry(0.04, 0.1);
    fishDorsal.rotateY(Math.PI / 2);
    fishDorsal.scale(1, 1, 3.0);
    fishDorsal.translate(0, 0.11, 0.02);
    const fishGeo = mergeGeos([fishBody, fishTail, fishDorsal]);
    const fishMat = injectCaustics(
      new THREE.MeshStandardMaterial({
        color: 0xffffff, metalness: 0.35, roughness: 0.45, side: THREE.DoubleSide,
      })
    );
    const fishMesh = new THREE.InstancedMesh(fishGeo, fishMat, FISH);
    const fishPalette = [0xc9d8e2, 0xf2c14e, 0x6fa8dc, 0xe98973, 0x9fd8c5];
    for (let i = 0; i < FISH; i++) {
      fishMesh.setColorAt(i, new THREE.Color(fishPalette[i % fishPalette.length]));
    }
    if (fishMesh.instanceColor) fishMesh.instanceColor.needsUpdate = true;
    scene.add(fishMesh);
    const schools = [
      new THREE.Vector3(-12, 9, -14),
      new THREE.Vector3(14, 11, -22),
      new THREE.Vector3(0, 6.5, -34),
    ];
    const fishData = [];
    for (let i = 0; i < FISH; i++) {
      fishData.push({
        center: schools[i % schools.length],
        r: 2.5 + Math.random() * 3.5,
        speed: 0.5 + Math.random() * 0.5,
        a: Math.random() * Math.PI * 2,
        yAmp: 0.6 + Math.random() * 1.2,
        yPh: Math.random() * 10,
        rPh: Math.random() * 10,
      });
    }

    // ===== カニ =====
    const crabs = [];
    const crabShellMat = injectCaustics(
      new THREE.MeshStandardMaterial({ color: 0xc24a30, roughness: 0.5, map: mottle, bumpMap: mottle, bumpScale: 0.02 })
    );
    const crabDarkMat = injectCaustics(
      new THREE.MeshStandardMaterial({ color: 0x82301c, roughness: 0.6, map: mottle })
    );
    const crabEyeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.25 });
    const makeCrab = () => {
      const g = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), crabShellMat);
      shell.scale.set(1.35, 0.5, 1.0);
      shell.position.y = 0.36;
      g.add(shell);
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), crabDarkMat);
      belly.scale.set(1.25, 0.4, 0.9);
      belly.position.y = 0.28;
      g.add(belly);
      for (const side of [-1, 1]) {
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.13, 6), crabDarkMat);
        stalk.position.set(side * 0.13, 0.52, 0.30);
        stalk.rotation.x = -0.3;
        g.add(stalk);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), crabEyeMat);
        eye.position.set(side * 0.13, 0.59, 0.33);
        g.add(eye);
      }
      const pincers = [];
      for (const side of [-1, 1]) {
        const armG = new THREE.Group();
        armG.position.set(side * 0.5, 0.34, 0.32);
        armG.rotation.z = side * 1.0;
        armG.rotation.y = side * -0.35;
        const armGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.26, 6);
        armGeo.translate(0, -0.13, 0);
        armG.add(new THREE.Mesh(armGeo, crabDarkMat));
        const clawG = new THREE.Group();
        clawG.position.set(0, -0.26, 0);
        clawG.rotation.z = -side * 1.0;
        clawG.rotation.y = side * 0.3;
        const palmC = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), crabShellMat);
        palmC.scale.set(1.1, 0.8, 1.5);
        clawG.add(palmC);
        const lowGeo = new THREE.SphereGeometry(0.05, 8, 6);
        lowGeo.scale(0.7, 0.5, 2.2);
        lowGeo.translate(0, 0, 0.1);
        const lower = new THREE.Mesh(lowGeo, crabDarkMat);
        lower.position.set(0, -0.03, 0.08);
        clawG.add(lower);
        const upGeo = new THREE.SphereGeometry(0.05, 8, 6);
        upGeo.scale(0.7, 0.5, 2.2);
        upGeo.translate(0, 0, 0.1);
        const upper = new THREE.Mesh(upGeo, crabDarkMat);
        upper.position.set(0, 0.05, 0.06);
        clawG.add(upper);
        pincers.push(upper);
        armG.add(clawG);
        g.add(armG);
      }
      const legs = [];
      const zSlots = [-0.30, -0.10, 0.10, 0.30];
      for (const side of [-1, 1]) {
        zSlots.forEach((zp, zi) => {
          const hip = new THREE.Group();
          hip.position.set(side * 0.48, 0.32, zp);
          hip.rotation.z = side * 1.0;
          const upGeo2 = new THREE.CylinderGeometry(0.022, 0.034, 0.32, 6);
          upGeo2.translate(0, -0.16, 0);
          hip.add(new THREE.Mesh(upGeo2, crabDarkMat));
          const knee = new THREE.Group();
          knee.position.set(0, -0.32, 0);
          knee.rotation.z = -side * 1.25;
          const loGeo = new THREE.CylinderGeometry(0.012, 0.022, 0.36, 6);
          loGeo.translate(0, -0.18, 0);
          knee.add(new THREE.Mesh(loGeo, crabDarkMat));
          hip.add(knee);
          g.add(hip);
          legs.push({ hip, side, ph: zi * Math.PI * 0.5 + (side > 0 ? Math.PI : 0) });
        });
      }
      return { g, legs, pincers };
    };
    for (let i = 0; i < 3; i++) {
      const { g, legs, pincers } = makeCrab();
      const x = (Math.random() - 0.5) * 32;
      const z = -2 - Math.random() * 26;
      g.position.set(x, floorHeight(x, z), z);
      scene.add(g);
      crabs.push({
        g, legs, pincers,
        dir: Math.random() * Math.PI * 2,
        speed: 0.5, scare: 0,
        phase: Math.random() * 10,
        turnTimer: 2 + Math.random() * 3,
      });
    }

    // ===== 手(関節付き + コースティクスが肌に落ちる) =====
    const hand = new THREE.Group();
    const skin = injectCaustics(
      new THREE.MeshStandardMaterial({
        color: 0xe8bd9c, roughness: 0.5, transparent: true, opacity: 0.97,
        emissive: 0x3d1f12, emissiveIntensity: 0.12,
      })
    );
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), skin);
    palm.scale.set(0.85, 1.1, 0.34);
    hand.add(palm);
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.082, 0.2, 10), skin);
    wrist.position.y = -0.24;
    hand.add(wrist);
    const fingers = [];
    const makeFinger = (x, y, baseLen, rad, splay, segCount) => {
      const root = new THREE.Group();
      root.position.set(x, y, 0.01);
      root.rotation.z = splay;
      let parent = root;
      const segs = [];
      const ratios = segCount === 3 ? [0.45, 0.33, 0.26] : [0.55, 0.45];
      for (let s = 0; s < segCount; s++) {
        const seg = new THREE.Group();
        const l = baseLen * ratios[s];
        const r = rad * (1 - s * 0.16);
        const geo = new THREE.CylinderGeometry(r * 0.88, r, l, 8);
        geo.translate(0, l / 2, 0);
        seg.add(new THREE.Mesh(geo, skin));
        seg.add(new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), skin));
        if (s === segCount - 1) {
          const tip = new THREE.Mesh(new THREE.SphereGeometry(r * 0.9, 8, 8), skin);
          tip.position.y = l;
          seg.add(tip);
        }
        parent.add(seg);
        segs.push({ seg, l });
        const next = new THREE.Group();
        next.position.y = l;
        seg.add(next);
        parent = next;
      }
      hand.add(root);
      return { root, segs };
    };
    [
      [-0.105, 0.155, 0.30, 0.030, 0.10],
      [-0.035, 0.165, 0.34, 0.031, 0.03],
      [0.035, 0.165, 0.32, 0.030, -0.03],
      [0.105, 0.150, 0.25, 0.027, -0.10],
    ].forEach(([x, y, l, r, sp], i) => {
      fingers.push({ f: makeFinger(x, y, l, r, sp, 3), idx: i });
    });
    const thumb = makeFinger(-0.155, -0.02, 0.24, 0.036, 1.05, 2);
    thumb.root.rotation.x = -0.35;
    fingers.push({ f: thumb, idx: 4 });
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.36, 32),
      new THREE.MeshBasicMaterial({
        color: 0x9fe8ff, transparent: true, opacity: 0,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    hand.add(ring);
    hand.visible = false;
    scene.add(hand);

    // ===== ポストプロセス: 実写感の本体 =====
    // 波長別の色吸収 / 太陽光線 / 水中の屈折歪み / 色収差 / グレイン / ビネット
    const rtW = mount.clientWidth * renderer.getPixelRatio();
    const rtH = mount.clientHeight * renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(rtW, rtH);
    rt.texture.minFilter = THREE.LinearFilter;
    rt.texture.magFilter = THREE.LinearFilter;
    rt.depthTexture = new THREE.DepthTexture(rtW, rtH);
    const postUniforms = {
      tDiffuse: { value: rt.texture },
      tDepth: { value: rt.depthTexture },
      uTime: sharedTime,
      uUnder: underFactor,
      uSunScreen: { value: new THREE.Vector2(0.5, 0.8) },
      uShaft: { value: 0 },
      uNear: { value: 0.1 },
      uFar: { value: 1500 },
    };
    const postMat = new THREE.ShaderMaterial({
      uniforms: postUniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform float uTime;
        uniform float uUnder;
        uniform vec2 uSunScreen;
        uniform float uShaft;
        uniform float uNear;
        uniform float uFar;
        varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float linearizeDepth(float d){
          float z = d * 2.0 - 1.0;
          return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
        }
        void main(){
          // --- 水中の屈折ゆらぎ ---
          vec2 uv = vUv;
          uv += vec2(
            sin(vUv.y * 36.0 + uTime * 1.8) + sin(vUv.y * 13.0 - uTime * 1.1),
            cos(vUv.x * 31.0 + uTime * 1.5)
          ) * 0.0011 * uUnder;

          // --- 色収差(レンズの端で虹ずれ) ---
          vec2 ca = (uv - 0.5) * 0.0042;
          vec3 col;
          col.r = texture2D(tDiffuse, uv + ca).r;
          col.g = texture2D(tDiffuse, uv).g;
          col.b = texture2D(tDiffuse, uv - ca).b;

          // --- 距離による波長別の色吸収(赤から消えていく) ---
          float dist = min(linearizeDepth(texture2D(tDepth, uv).x), 300.0);
          vec3 absorb = vec3(0.052, 0.018, 0.010);
          col *= exp(-dist * absorb * uUnder);
          col += vec3(0.030, 0.155, 0.230) * (1.0 - exp(-dist * 0.014 * uUnder));

          // --- スクリーンスペース太陽光線(明るい水面から差し込む) ---
          if (uShaft > 0.001) {
            vec2 dir = uSunScreen - uv;
            float illum = 0.0;
            vec2 suv = uv;
            for (int i = 0; i < 14; i++) {
              suv += dir * 0.055;
              vec3 s = texture2D(tDiffuse, suv).rgb;
              float lum = dot(s, vec3(0.299, 0.587, 0.114));
              illum += smoothstep(0.55, 1.0, lum) * (1.0 - float(i) / 14.0);
            }
            float falloff = exp(-length(dir) * 1.6);
            col += vec3(0.55, 0.82, 0.92) * (illum / 14.0) * uShaft * falloff * 1.4;
          }

          // --- シャドウに青を残すカラーグレード ---
          float lum2 = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(col, col * vec3(0.92, 1.0, 1.06), uUnder * (1.0 - lum2) * 0.5);
          col = (col - 0.5) * 1.06 + 0.5; // ややコントラスト

          // --- ビネット + フィルムグレイン ---
          float vig = 1.0 - smoothstep(0.45, 0.95, length(vUv - 0.5)) * 0.42;
          col *= vig;
          col += (hash(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 7.0) - 0.5) * 0.045;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const postScene = new THREE.Scene();
    const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

    // ===== 入力 =====
    const handTarget = new THREE.Vector3();
    let handActive = 0;
    let pointerDown = false;
    let lastPX = 0, lastPY = 0;
    const pointerNDC = new THREE.Vector2(0, 0);
    let lastPointerTime = -10;
    const raycaster = new THREE.Raycaster();
    let clockTime = 0;
    let wasAbove = false;

    const dom = renderer.domElement;
    const setNDC = (e) => {
      const r = dom.getBoundingClientRect();
      pointerNDC.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1
      );
    };
    const onPointerDown = (e) => {
      pointerDown = true;
      lastPX = e.clientX; lastPY = e.clientY;
      setNDC(e);
      lastPointerTime = clockTime;
      setHintVisible(false);
    };
    const onPointerMove = (e) => {
      setNDC(e);
      lastPointerTime = clockTime;
      if (pointerDown) {
        camera.rotation.y -= (e.clientX - lastPX) * 0.0035;
        camera.rotation.x = THREE.MathUtils.clamp(
          camera.rotation.x - (e.clientY - lastPY) * 0.0035, -1.25, 1.25
        );
        lastPX = e.clientX; lastPY = e.clientY;
      }
    };
    const onPointerUp = () => (pointerDown = false);
    dom.addEventListener("pointerdown", onPointerDown);
    dom.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    const keys = {};
    const onKeyDown = (e) => (keys[e.key.toLowerCase()] = true);
    const onKeyUp = (e) => (keys[e.key.toLowerCase()] = false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      const pw = mount.clientWidth * renderer.getPixelRatio();
      const ph = mount.clientHeight * renderer.getPixelRatio();
      rt.setSize(pw, ph);
    };
    window.addEventListener("resize", onResize);

    // ===== メインループ =====
    const clock = new THREE.Clock();
    let raf = 0;
    const fwd = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const tmp2 = new THREE.Vector3();
    const sunProj = new THREE.Vector3();
    let curDensity = 0.011;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      clockTime += dt;
      const t = clockTime;
      sharedTime.value = t;

      if (swimRef.current || keys["w"] || keys["arrowup"]) {
        camera.getWorldDirection(fwd);
        camera.position.addScaledVector(fwd, dt * 5);
      }
      camera.position.y += Math.sin(t * 0.8) * 0.004;
      camera.rotation.z = Math.sin(t * 0.45) * 0.012;
      const fy = floorHeight(camera.position.x, camera.position.z);
      camera.position.y = THREE.MathUtils.clamp(camera.position.y, fy + 1.4, WATER_Y + 3.5);
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, -72, 72);
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, -72, 72);
      camLight.position.copy(camera.position);

      // 水上/水中の遷移
      const above = camera.position.y > WATER_Y + 0.15;
      if (above && !wasAbove && splashRef.current) splashRef.current();
      wasAbove = above;
      underFactor.value += ((above ? 0 : 1) - underFactor.value) * Math.min(dt * 4, 1);
      const u = underFactor.value;
      fogColor.copy(SKYFOG).lerp(DEEP, u);
      curDensity += ((above ? 0.0028 : 0.011) - curDensity) * Math.min(dt * 4, 1);
      fogDensity.value = curDensity;
      scene.fog.color.copy(fogColor);
      scene.fog.density = curDensity;
      scene.background.copy(fogColor);
      dustFine.mat.opacity = 0.5 * u;
      dustBokeh.mat.opacity = 0.16 * u;
      skyDome.position.copy(camera.position);

      // 太陽のスクリーン座標 → 光線の強さ
      sunProj.copy(sunDir.value).multiplyScalar(200).add(camera.position).project(camera);
      const sunInFront = sunProj.z < 1;
      postUniforms.uSunScreen.value.set(sunProj.x * 0.5 + 0.5, sunProj.y * 0.5 + 0.5);
      camera.getWorldDirection(fwd);
      const facing = Math.max(0, fwd.dot(sunDir.value));
      postUniforms.uShaft.value = sunInFront ? u * facing * facing * 0.95 : 0;

      // 手
      raycaster.setFromCamera(pointerNDC, camera);
      handTarget.copy(raycaster.ray.direction).multiplyScalar(3.2).add(camera.position);
      const recent = t - lastPointerTime < 2.5;
      handActive += ((recent ? 1 : 0) - handActive) * dt * 5;
      hand.visible = handActive > 0.02;
      if (hand.visible) {
        hand.position.lerp(handTarget, 0.25);
        hand.quaternion.copy(camera.quaternion);
        hand.rotateX(-0.35);
        skin.opacity = 0.97 * handActive;
        ring.material.opacity = pointerDown ? 0.5 * handActive : 0;
        ring.scale.setScalar(pointerDown ? 1 + Math.sin(t * 6) * 0.15 : 1);
        fingers.forEach(({ f, idx }) => {
          const curl = 0.16 + Math.sin(t * 1.2 + idx * 0.9) * 0.07 + (pointerDown ? 0.18 : 0);
          f.segs.forEach(({ seg }, s) => {
            seg.rotation.x = -(curl * (0.7 + s * 0.5));
          });
        });
      }
      const handPos = hand.position;
      const handOn = hand.visible;

      // 泡
      for (let i = 0; i < BUBBLES; i++) {
        const b = bData[i];
        b.vel.y = Math.min(b.vel.y + dt * 0.25, 1.7);
        b.pos.x += Math.sin(t * 2 + b.phase) * dt * 0.25;
        b.pos.z += Math.cos(t * 1.6 + b.phase) * dt * 0.2;
        if (handOn) {
          tmp.subVectors(b.pos, handPos);
          const d = tmp.length();
          if (d < 1.5 && d > 0.0001) {
            tmp.normalize();
            b.vel.addScaledVector(tmp, ((1.5 - d) / 1.5) * 6 * handActive * dt * 8);
          }
        }
        b.vel.x *= 1 - dt * 1.2;
        b.vel.z *= 1 - dt * 1.2;
        b.pos.addScaledVector(b.vel, dt);
        if (b.pos.y > WATER_Y - 0.25) resetBubble(b);
        const wob = 1 + Math.sin(t * 5 + b.phase) * 0.13;
        dummy.position.copy(b.pos);
        dummy.scale.set(b.size * wob, b.size * (2 - wob), b.size * wob);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        bubbles.setMatrixAt(i, dummy.matrix);
      }
      bubbles.instanceMatrix.needsUpdate = true;

      // クラゲ
      for (const j of jellies) {
        const pulse = Math.sin(t * 1.7 + j.phase);
        j.g.position.y += (0.16 + Math.max(pulse, 0) * 0.3) * dt;
        j.g.position.addScaledVector(j.drift, dt);
        j.g.position.addScaledVector(j.push, dt);
        j.push.multiplyScalar(1 - dt * 1.5);
        j.core.material.opacity = 0.3 + Math.max(pulse, 0) * 0.25;
        if (handOn) {
          tmp.subVectors(j.g.position, handPos);
          const d = tmp.length();
          if (d < 2.4 && d > 0.001) {
            tmp.normalize();
            j.push.addScaledVector(tmp, (2.4 - d) * 1.2);
          }
        }
        if (j.g.position.y > WATER_Y - 3) j.g.position.y = 3;
        if (j.g.position.y < 2.5) j.g.position.y = 2.5;
        for (const tc of j.tentacles) {
          const posAttr = tc.line.geometry.attributes.position;
          for (let s = 0; s < posAttr.count; s++) {
            posAttr.setXYZ(
              s,
              Math.sin(t * 2.2 + j.phase + s * 0.55 + tc.ang) * 0.06 * s,
              -s * 0.22 - pulse * 0.02 * s,
              Math.cos(t * 1.9 + j.phase + s * 0.5 + tc.ang) * 0.05 * s
            );
          }
          posAttr.needsUpdate = true;
        }
      }

      // 魚
      for (let i = 0; i < FISH; i++) {
        const f = fishData[i];
        f.a += f.speed * dt;
        const rr = f.r + Math.sin(t * 0.3 + f.rPh) * 1.1;
        const px = f.center.x + Math.cos(f.a) * rr;
        const py = f.center.y + Math.sin(f.a * 0.7 + f.yPh) * f.yAmp;
        const pz = f.center.z + Math.sin(f.a) * rr;
        tmp.set(px, py, pz);
        tmp2.set(
          f.center.x + Math.cos(f.a + 0.06) * rr,
          f.center.y + Math.sin((f.a + 0.06) * 0.7 + f.yPh) * f.yAmp,
          f.center.z + Math.sin(f.a + 0.06) * rr
        );
        dummy.position.copy(tmp);
        dummy.lookAt(tmp2);
        dummy.rotateY(Math.sin(t * 9 + i * 1.3) * 0.18);
        dummy.scale.setScalar(0.8 + (i % 5) * 0.12);
        dummy.updateMatrix();
        fishMesh.setMatrixAt(i, dummy.matrix);
      }
      fishMesh.instanceMatrix.needsUpdate = true;

      // カニ
      for (const c of crabs) {
        c.turnTimer -= dt;
        if (c.turnTimer < 0) {
          c.dir += (Math.random() - 0.5) * 1.6;
          c.turnTimer = 2 + Math.random() * 3;
        }
        if (handOn) {
          tmp.subVectors(c.g.position, handPos);
          if (tmp.length() < 3.5) {
            c.dir = Math.atan2(tmp.x, tmp.z);
            c.scare = 1.2;
          }
        }
        c.scare = Math.max(0, c.scare - dt);
        const sp = c.speed * (1 + c.scare * 3.5);
        c.g.position.x = THREE.MathUtils.clamp(c.g.position.x + Math.sin(c.dir) * sp * dt, -45, 45);
        c.g.position.z = THREE.MathUtils.clamp(c.g.position.z + Math.cos(c.dir) * sp * dt, -45, 45);
        c.g.position.y = floorHeight(c.g.position.x, c.g.position.z) + Math.sin(t * 6 + c.phase) * 0.015;
        c.g.rotation.y = c.dir + Math.PI / 2;
        const walk = t * (7 + c.scare * 15) + c.phase;
        for (const leg of c.legs) {
          leg.hip.rotation.x = Math.sin(walk + leg.ph) * 0.32;
          leg.hip.rotation.z = leg.side * 1.0 + Math.sin(walk + leg.ph) * 0.10;
        }
        const open = (Math.sin(t * 0.9 + c.phase * 3) * 0.5 + 0.5) * 0.3 + c.scare * 0.5;
        for (const p of c.pincers) p.rotation.x = -open;
      }

      // 海藻・イソギンチャク
      for (const w of weeds) {
        const posAttr = w.mesh.geometry.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
          const k = w.base[i * 3 + 1] / w.h;
          posAttr.setX(
            i,
            w.base[i * 3] + Math.sin(t * 1.4 + w.phase + w.base[i * 3 + 1] * 0.8) * 0.38 * k * k
          );
        }
        posAttr.needsUpdate = true;
      }
      for (const a of anemones) {
        for (const tn of a.tents) {
          tn.m.rotation.x = Math.cos(tn.ang) * (tn.tilt + Math.sin(t * 1.6 + tn.ph) * 0.12);
          tn.m.rotation.z = -Math.sin(tn.ang) * (tn.tilt + Math.cos(t * 1.4 + tn.ph) * 0.12);
        }
      }

      // 光・チリ
      for (const r of rays) r.rotation.y += dt * 0.03;
      for (const dust of [dustFine, dustBokeh]) {
        const sp2 = dust.pts.geometry.attributes.position;
        for (let i = 0; i < dust.count; i++) {
          let y = sp2.getY(i) - dt * 0.10;
          if (y < 0) y = WATER_Y - 0.5;
          sp2.setY(i, y);
          sp2.setX(i, sp2.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.05);
        }
        sp2.needsUpdate = true;
      }

      // 2パス描画: シーン → ポストプロセス
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCam);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointermove", onPointerMove);
      mount.removeChild(renderer.domElement);
      rt.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        background: "#0a3a52",
        fontFamily: "'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif",
      }}
    >
      <style>{`
        @keyframes dropSlide {
          0% { transform: translateY(0) scaleY(1); opacity: 1; }
          70% { opacity: 0.9; }
          100% { transform: translateY(48vh) scaleY(1.6); opacity: 0; }
        }
        @keyframes dropStick {
          0% { opacity: 1; }
          70% { opacity: 0.8; }
          100% { opacity: 0; }
        }
        @keyframes sheetDown {
          0% { transform: translateY(-15%); opacity: 0.95; }
          100% { transform: translateY(115%); opacity: 0; }
        }
      `}</style>

      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />

      {/* ゴーグルフレーム(ポスト側にビネットがあるので軽めに) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          borderRadius: "14% / 18%",
          boxShadow: "inset 0 0 70px 20px rgba(2,12,20,0.7)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "linear-gradient(115deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 22%)",
        }}
      />

      {splashId > 0 && (
        <div
          key={`sheet-${splashId}`}
          style={{
            position: "absolute",
            inset: "0 0 auto 0",
            height: "70%",
            pointerEvents: "none",
            background:
              "linear-gradient(to bottom, rgba(190,228,248,0.55), rgba(190,228,248,0.18) 55%, transparent)",
            animation: "sheetDown 0.85s ease-out forwards",
          }}
        />
      )}

      {drops.map((d) => (
        <div
          key={d.id}
          style={{
            position: "absolute",
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size * 1.15,
            borderRadius: "55% 55% 60% 60%",
            pointerEvents: "none",
            background:
              "radial-gradient(circle at 35% 28%, rgba(255,255,255,0.95), rgba(255,255,255,0.25) 38%, rgba(190,225,250,0.18) 62%, rgba(150,200,235,0.05) 100%)",
            boxShadow: "inset 0 -2px 4px rgba(255,255,255,0.25), 0 1px 3px rgba(20,50,80,0.25)",
            backdropFilter: "blur(3px)",
            WebkitBackdropFilter: "blur(3px)",
            animation: `${d.slide ? "dropSlide" : "dropStick"} ${d.dur}s ease-in ${d.delay}s forwards`,
          }}
        />
      ))}

      <div
        style={{
          position: "absolute",
          top: 18,
          left: 22,
          color: "rgba(220, 245, 255, 0.9)",
          letterSpacing: "0.35em",
          fontSize: 13,
          textShadow: "0 0 12px rgba(80,200,255,0.6)",
          pointerEvents: "none",
        }}
      >
        深 海 散 歩
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 96,
          left: "50%",
          transform: "translateX(-50%)",
          color: "rgba(200, 235, 255, 0.85)",
          fontSize: 12,
          lineHeight: 1.9,
          textAlign: "center",
          textShadow: "0 1px 8px rgba(0,20,40,0.8)",
          pointerEvents: "none",
          opacity: hintVisible ? 1 : 0,
          transition: "opacity 1.2s ease",
          whiteSpace: "nowrap",
        }}
      >
        太陽の方を見上げると光が差し込みます ☀️
        <br />
        上を向いて泳ぐと水面へ／手で生き物に触れてみて
      </div>

      <button
        onPointerDown={(e) => {
          e.preventDefault();
          swimRef.current = true;
        }}
        onPointerUp={() => (swimRef.current = false)}
        onPointerLeave={() => (swimRef.current = false)}
        style={{
          position: "absolute",
          bottom: 28,
          left: "50%",
          transform: "translateX(-50%)",
          padding: "12px 34px",
          borderRadius: 999,
          border: "1px solid rgba(140, 220, 255, 0.5)",
          background: "rgba(10, 60, 90, 0.45)",
          color: "rgba(220, 245, 255, 0.95)",
          fontSize: 14,
          letterSpacing: "0.2em",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          cursor: "pointer",
        }}
      >
        長押しで泳ぐ（W キーも可）
      </button>
    </div>
  );
}