import * as THREE from "three";
import { SEA_FLOOR } from "./constants";
import { uTime } from "./uniforms";
import { mergeGeos, tg } from "./helpers";

const dummy = new THREE.Object3D();

/* ---------- 魚ジオメトリ(前方+Z) ---------- */
function makeFishGeo() {
  const body = new THREE.SphereGeometry(0.5, 12, 9);
  tg(body, 0, 0, 0, 0, 0, 0, 0.16, 0.44, 1.0);
  const tri = (a, b, c) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...b], 3));
    g.computeVertexNormals(); return g;
  };
  const tail = tri([0, 0, -0.42], [0, 0.26, -0.86], [0, -0.26, -0.86]);
  const dorsal = tri([0, 0.16, 0.12], [0, 0.36, -0.18], [0, 0.15, -0.28]);
  return mergeGeos([body, tail, dorsal]);
}

function wiggleMaterial(opts) {
  const m = new THREE.MeshPhongMaterial(Object.assign({ specular: 0x99bbcc, shininess: 70 }, opts));
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = ("uniform float uTime;\nattribute float aPhase;\n" + sh.vertexShader).replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       float wg = sin(uTime*7.0 + aPhase + position.z*4.5);
       transformed.x += wg * 0.14 * smoothstep(0.25, -0.75, position.z);`);
  };
  return m;
}

/* 魚の実写風テクスチャ(背=濃/腹=淡のカウンターシェーディング) */
function fishTex(opts) {
  const cv = document.createElement("canvas"); cv.width = 128; cv.height = 64;
  const cx = cv.getContext("2d");
  const gr = cx.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, opts.back);
  gr.addColorStop(0.55, opts.body);
  gr.addColorStop(1, opts.belly);
  cx.fillStyle = gr; cx.fillRect(0, 0, 128, 64);
  if (opts.stripes) {
    cx.fillStyle = opts.stripes;
    cx.globalAlpha = 0.85;
    [22, 52, 82].forEach((x) => {
      cx.beginPath();
      cx.moveTo(x, 2); cx.lineTo(x + 9, 2); cx.lineTo(x + 4, 60); cx.lineTo(x - 5, 60);
      cx.closePath(); cx.fill();
    });
    cx.globalAlpha = 1;
  }
  if (opts.lateral) {
    cx.strokeStyle = opts.lateral; cx.lineWidth = 1.6; cx.globalAlpha = 0.6;
    cx.beginPath(); cx.moveTo(0, 30); cx.quadraticCurveTo(64, 26, 128, 30); cx.stroke();
    cx.globalAlpha = 1;
  }
  if (opts.tail) {
    cx.fillStyle = opts.tail; cx.globalAlpha = 0.9;
    cx.fillRect(0, 0, 12, 64); cx.fillRect(116, 0, 12, 64);
    cx.globalAlpha = 1;
  }
  for (let i = 0; i < 700; i++) {
    cx.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,30,0.05)";
    cx.fillRect(Math.random() * 128, Math.random() * 64, 1.6, 1.2);
  }
  return new THREE.CanvasTexture(cv);
}

/* ---------- 群れ (Boids) ---------- */
class School {
  constructor(scene, geo, count, opts) {
    this.n = count; this.o = opts;
    this.pos = []; this.vel = []; this.scale = [];
    const c = opts.center;
    for (let i = 0; i < count; i++) {
      this.pos.push(new THREE.Vector3(
        c.x + (Math.random() - 0.5) * 8, c.y + (Math.random() - 0.5) * 4, c.z + (Math.random() - 0.5) * 8));
      this.vel.push(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5) * 0.3, (Math.random() - 0.5)).normalize().multiplyScalar(opts.speed));
      this.scale.push(opts.size * (0.8 + Math.random() * 0.4));
    }
    const g = geo.clone();
    const ph = new Float32Array(count);
    for (let i = 0; i < count; i++) ph[i] = Math.random() * Math.PI * 2;
    g.setAttribute("aPhase", new THREE.InstancedBufferAttribute(ph, 1));
    this.mesh = new THREE.InstancedMesh(g, opts.mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      col.setHex(opts.color).offsetHSL((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.10);
      this.mesh.setColorAt(i, col);
    }
    scene.add(this.mesh);
    this.target = new THREE.Vector3();
    this.seed = Math.random() * 100;
  }
  update(dt, t, cam, hand, reach) {
    const o = this.o, n = this.n;
    this.target.set(
      o.center.x + Math.sin(t * 0.07 + this.seed) * o.roam,
      THREE.MathUtils.clamp(o.center.y + Math.sin(t * 0.05 + this.seed * 2) * 4, SEA_FLOOR + 3.5, -2.0),
      o.center.z + Math.cos(t * 0.055 + this.seed) * o.roam);
    const avgV = new THREE.Vector3(), ctr = new THREE.Vector3();
    for (let i = 0; i < n; i++) { avgV.add(this.vel[i]); ctr.add(this.pos[i]); }
    avgV.divideScalar(n); ctr.divideScalar(n);
    const f = new THREE.Vector3(), tmp = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const p = this.pos[i], v = this.vel[i];
      f.set(0, 0, 0);
      f.addScaledVector(tmp.copy(ctr).sub(p), 0.18);                 /* 結束 */
      f.addScaledVector(tmp.copy(avgV).sub(v), 0.55);                /* 整列 */
      f.addScaledVector(tmp.copy(this.target).sub(p), 0.10);         /* 回遊 */
      for (let k = 0; k < 5; k++) {
        const j = (i * 7 + k * 13) % n; if (j === i) continue;
        tmp.copy(p).sub(this.pos[j]);
        const d = tmp.length();
        if (d < 1.1 && d > 1e-4) f.addScaledVector(tmp.normalize(), (1.1 - d) * 2.4);
      }
      tmp.copy(p).sub(cam);
      const dc = tmp.length();
      if (dc < 3.4) f.addScaledVector(tmp.normalize(), (3.4 - dc) * 2.2);
      if (hand && reach > 0.5) {
        tmp.copy(p).sub(hand);
        const dh = tmp.length();
        if (o.curious && dh < 13 && dh > 0.8)
          f.addScaledVector(tmp.normalize(), -(13 - dh) * 0.45);   /* 寄ってくる */
        if (o.skittish && dh < 8)
          f.addScaledVector(tmp.normalize(), (8 - dh) * 3.2);      /* 一斉に逃げる */
      }
      const floorY = SEA_FLOOR + 2.2;
      if (p.y < floorY) f.y += (floorY - p.y) * 2.0;
      if (p.y > -1.4) f.y -= (p.y + 1.4) * 2.5;
      v.addScaledVector(f, dt);
      const sp = v.length(), mx = o.speed * 1.55, mn = o.speed * 0.6;
      if (sp > mx) v.multiplyScalar(mx / sp); else if (sp < mn) v.multiplyScalar(mn / Math.max(sp, 1e-4));
      p.addScaledVector(v, dt);
      dummy.position.copy(p);
      tmp.copy(p).add(v);
      dummy.lookAt(tmp);
      dummy.scale.setScalar(this.scale[i]);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export function buildFish(scene, anemonePos) {
  const fishGeo = makeFishGeo();
  const schools = [
    /* チョウチョウウオ(黄・黒縞) */
    new School(scene, fishGeo, 55, {
      center: new THREE.Vector3(14, -9, -8), roam: 26, speed: 2.6, size: 0.52, color: 0xffffff,
      mat: wiggleMaterial({
        color: 0xffffff, specular: 0xcfe6ee, shininess: 90,
        map: fishTex({ back: "#9a6d10", body: "#f0c23a", belly: "#fbf0c4", stripes: "#1c1812" }),
      }),
    }),
    /* ナンヨウハギ(ドリー・好奇心旺盛) */
    new School(scene, fishGeo, 45, {
      center: new THREE.Vector3(-18, -12, 10), roam: 30, speed: 2.2, size: 0.62, color: 0xffffff, curious: true,
      mat: wiggleMaterial({
        color: 0xffffff, specular: 0xaad4ff, shininess: 80,
        map: fishTex({ back: "#0a1a86", body: "#1742d8", belly: "#3a6ce8", stripes: "#0a0c18", tail: "#f5d428" }),
      }),
    }),
    /* タカサゴ(銀・臆病) */
    new School(scene, fishGeo, 50, {
      center: new THREE.Vector3(0, -6, -24), roam: 34, speed: 3.2, size: 0.46, color: 0xffffff, skittish: true,
      mat: wiggleMaterial({
        color: 0xffffff, specular: 0xffffff, shininess: 160,
        map: fishTex({ back: "#46606e", body: "#9cb2bd", belly: "#e8f0f2", lateral: "#2a3a44" }),
      }),
    }),
  ];

  /* クマノミ ×3 (イソギンチャク周辺) */
  const clownTex = (() => {
    const cv = document.createElement("canvas"); cv.width = 128; cv.height = 64;
    const cx = cv.getContext("2d"); cx.fillStyle = "#e8651a"; cx.fillRect(0, 0, 128, 64);
    cx.fillStyle = "#f8f4ec";
    [18, 58, 98].forEach((x) => { cx.fillRect(x, 0, 12, 64); });
    cx.fillStyle = "#2a1a10"; [16, 30, 56, 70, 96, 110].forEach((x) => cx.fillRect(x, 0, 2, 64));
    return new THREE.CanvasTexture(cv);
  })();
  const clowns = [];
  {
    const mat = wiggleMaterial({ map: clownTex, color: 0xffffff, specular: 0x886644, shininess: 60 });
    for (let i = 0; i < 3; i++) {
      const g = fishGeo.clone();
      g.setAttribute("aPhase", new THREE.InstancedBufferAttribute(new Float32Array([Math.random() * 6]), 1));
      const m = new THREE.InstancedMesh(g, mat, 1);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
      clowns.push({ mesh: m, seed: Math.random() * 10, p: new THREE.Vector3(), att: 0 });
    }
  }

  function update(dt, t, state) {
    const { camera, handPos, reachT } = state;
    schools.forEach((s) => s.update(dt, t, camera.position, handPos, reachT));
    const a = anemonePos;
    clowns.forEach((c) => {
      const wantAtt = (reachT > 0.5 && handPos.distanceTo(a) < 8) ? 0.85 : 0;
      c.att += (wantAtt - c.att) * Math.min(1, dt * 1.5);
      const cx2 = THREE.MathUtils.lerp(a.x, handPos.x, c.att);
      const cy2 = THREE.MathUtils.lerp(a.y + 0.4, handPos.y, c.att);
      const cz2 = THREE.MathUtils.lerp(a.z, handPos.z, c.att);
      c.p.set(cx2 + Math.sin(t * 0.8 + c.seed) * 0.9 + Math.sin(t * 2.2 + c.seed * 3) * 0.18,
        cy2 + Math.sin(t * 1.1 + c.seed * 2) * 0.35,
        cz2 + Math.cos(t * 0.7 + c.seed) * 0.9);
      dummy.position.copy(c.p);
      dummy.lookAt(a.x + Math.sin(t * 0.8 + c.seed + 0.4) * 0.9, c.p.y, a.z + Math.cos(t * 0.7 + c.seed + 0.4) * 0.9);
      dummy.scale.setScalar(0.3);
      dummy.updateMatrix();
      c.mesh.setMatrixAt(0, dummy.matrix);
      c.mesh.instanceMatrix.needsUpdate = true;
    });
  }

  return { update };
}
