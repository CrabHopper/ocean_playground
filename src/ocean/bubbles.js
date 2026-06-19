import * as THREE from "three";
import { SEA_FLOOR } from "./constants";
import { uTime } from "./uniforms";
import { terrainH, waveSurfaceY } from "./helpers";

// 泡まわり一式：GPUポイントの小泡(bub)、ポスト処理で屈折する大泡(bigBub)、
// 海底の湧出孔(seeps)。sound は弾ける音などに使う。
export function buildBubbles(scene, sound) {
  /* ---------- 泡 (GPUポイント+CPUシミュ) ---------- */
  const BUB_N = 1200;
  const bub = (() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(BUB_N * 3), size = new Float32Array(BUB_N), alpha = new Float32Array(BUB_N);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uTime },
      vertexShader: `
        attribute float aSize; attribute float aAlpha; varying float vA; varying float vS;
        void main(){
          vec4 mv = modelViewMatrix*vec4(position,1.0);
          gl_PointSize = aSize * 340.0 / max(-mv.z, 0.4);
          vA = aAlpha * smoothstep(70.0, 26.0, -mv.z);
          vS = aSize;
          gl_Position = projectionMatrix*mv;
        }`,
      fragmentShader: `
        uniform float uTime; varying float vA; varying float vS;
        void main(){
          vec2 q = gl_PointCoord-0.5;
          q.y *= 0.86;
          float d = length(q);
          float th = mix(0.06, 0.11, clamp(vS*6.0,0.0,1.0));
          float ring = smoothstep(0.5,0.5-th,d)*smoothstep(0.5-th*2.6,0.5-th,d);
          float lower = smoothstep(0.0,0.42,-q.y+0.18);
          ring *= (0.55 + 0.75*lower);
          float spec = smoothstep(0.15,0.0,length(q-vec2(-0.12,0.17)));
          float spec2= smoothstep(0.09,0.0,length(q-vec2(0.13,-0.11)))*0.5;
          float core = smoothstep(0.16,0.0,length(q-vec2(0.0,-0.07)))*0.22;
          float fill = smoothstep(0.5,0.05,d)*0.05;
          float a = (ring*0.85 + spec*1.0 + spec2 + core + fill) * vA;
          vec3 col = mix(vec3(0.70,0.92,1.0), vec3(0.95,1.0,1.0), spec+spec2);
          gl_FragColor = vec4(col, a);
        }`,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false; pts.renderOrder = 8;
    scene.add(pts);
    const P = []; for (let i = 0; i < BUB_N; i++) P.push({ alive: false, x: 0, y: 0, z: 0, vy: 0, s: 0, seed: Math.random() * 9, a: 0 });
    let head = 0;
    function spawn(x, y, z, sz) {
      const b = P[head]; head = (head + 1) % BUB_N;
      b.alive = true; b.x = x; b.y = y; b.z = z;
      b.vy = 0.35 + Math.random() * 0.5; b.s = sz * (0.6 + Math.random() * 0.9); b.a = 0; b.seed = Math.random() * 9;
    }
    function update(dt, t) {
      const pp = g.attributes.position, ss = g.attributes.aSize, aa = g.attributes.aAlpha;
      for (let i = 0; i < BUB_N; i++) {
        const b = P[i];
        if (!b.alive) { aa.setX(i, 0); continue; }
        b.vy += dt * (0.4 + b.s * 4.5);
        b.vy = Math.min(b.vy, 1.5 + b.s * 6.0);
        b.y += b.vy * dt;
        const wob = 0.16 + b.s * 4.2;
        b.x += Math.sin(t * (2.2 + b.seed * 0.8) + b.seed * 7.0) * dt * wob;
        b.z += Math.cos(t * (1.9 + b.seed * 0.6) + b.seed * 5.0) * dt * wob;
        b.s += dt * 0.004;
        b.a = Math.min(1, b.a + dt * 4.0);
        let al = b.a;
        const surf = waveSurfaceY(b.x, b.z, t);
        if (b.y > surf - 0.25) { al *= Math.max(0, (surf - b.y) / 0.25); if (b.y > surf) { b.alive = false; al = 0; } }
        pp.setXYZ(i, b.x, b.y, b.z); ss.setX(i, b.s); aa.setX(i, al);
      }
      pp.needsUpdate = ss.needsUpdate = aa.needsUpdate = true;
    }
    return { spawn, update };
  })();

  /* 海底の湧出孔(泡カラム ×9) */
  const seeps = [[12, 9], [-20, -14], [3, -30], [18, -6], [-8, 22], [-30, 4], [26, 18], [0, -12], [-14, -28]]
    .map(([x, z]) => ({
      x, z, y: SEA_FLOOR + terrainH(x, z) + 0.15, t: Math.random(),
      rate: 0.20 + Math.random() * 0.35, size: 0.025 + Math.random() * 0.05, burst: 8 + Math.floor(Math.random() * 8),
    }));

  function updateSeeps(dt, t, camera) {
    seeps.forEach((s) => {
      s.t -= dt;
      if (s.t < 0) {
        s.t = s.rate * (0.5 + Math.random());
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++)
          bub.spawn(s.x + (Math.random() - 0.5) * 0.45, s.y + Math.random() * 0.3,
            s.z + (Math.random() - 0.5) * 0.45, s.size * (0.5 + Math.random() * 1.8));
        if (Math.random() < 0.05) {
          for (let i = 0; i < s.burst; i++)
            bub.spawn(s.x + (Math.random() - 0.5) * 0.8, s.y + Math.random() * 0.7,
              s.z + (Math.random() - 0.5) * 0.8, 0.03 + Math.random() * 0.12);
          const dc = camera.position.distanceTo(new THREE.Vector3(s.x, s.y, s.z));
          if (dc < 18) sound.popBubbles(3);
        }
      }
    });
  }

  /* ---------- 大泡(ポスト処理で本物の屈折を行うシミュレーション) ---------- */
  const bigBub = (() => {
    const list = [];
    for (let i = 0; i < 26; i++)
      list.push({
        s: 0, x: 0, y: 0, z: 0, vy: 0, seed: Math.random() * 9, alive: false,
        delay: Math.random() * 5, push: new THREE.Vector3(),
      });
    function respawn(b) {
      const v = seeps[Math.floor(Math.random() * seeps.length)];
      b.x = v.x + (Math.random() - 0.5) * 0.6;
      b.z = v.z + (Math.random() - 0.5) * 0.6;
      b.y = v.y;
      b.s = 0.035 + Math.random() * 0.17; b.vy = 0.3; b.alive = true;
      b.push.set(0, 0, 0);
    }
    function spawnAt(x, y, z, s) {
      let best = null;
      for (const b of list) { if (!b.alive) { best = b; break; } if (!best || b.y > best.y) best = b; }
      best.x = x; best.y = y; best.z = z; best.s = s; best.vy = 0.25; best.alive = true;
      best.seed = Math.random() * 9; best.push.set(0, 0, 0);
    }
    function update(dt, t) {
      list.forEach((b) => {
        if (!b.alive) { b.delay -= dt; if (b.delay < 0) respawn(b); return; }
        b.vy = Math.min(b.vy + dt * (0.5 + b.s * 5.0), 1.3 + b.s * 5.0);
        b.y += b.vy * dt;
        b.x += Math.sin(t * 2.4 + b.seed * 5.0) * dt * (0.14 + b.s * 2.6) + b.push.x * dt;
        b.z += Math.cos(t * 2.0 + b.seed * 3.0) * dt * (0.14 + b.s * 2.6) + b.push.z * dt;
        b.y += b.push.y * dt;
        b.push.multiplyScalar(Math.pow(0.2, dt));
        b.s += dt * 0.006;
        const surf = waveSurfaceY(b.x, b.z, t);
        if (b.y > surf - 0.12) {
          b.alive = false; b.delay = 0.4 + Math.random() * 3.0;
          for (let i = 0; i < 3; i++) bub.spawn(b.x, (surf - 0.2), b.z, 0.02 + Math.random() * 0.03);
          if (Math.random() < 0.5) sound.popBubbles(1);
        }
      });
    }
    return { update, spawnAt, list };
  })();

  return { bub, bigBub, seeps, updateSeeps };
}
