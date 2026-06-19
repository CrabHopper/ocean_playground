import * as THREE from "three";
import { uTime, uFogColor, uFogDensity } from "./uniforms";

// クラゲ — 旧 ocean.jsx の美しいシェーダ製を採用。
// 拍動するベル / 加算発光のコア / 揺れるライン触手。
// 新シーンの座標系（水面=0, 海底=-22）に合わせ、水中を漂わせる。
const FOG_GLSL = `
vec3 applyFog(vec3 col, float depth, vec3 fogColor, float density){
  float f = 1.0 - exp(-depth * density * 1.35);
  return mix(col, fogColor, clamp(f, 0.0, 1.0));
}`;

const TOP_Y = -3.5;   // 漂う上限
const BOT_Y = -16;    // 漂う下限

export function buildJellyfish(scene) {
  const jellies = [];
  const jellyColors = [0xff9ecf, 0x9fb6ff, 0x8ef0e0, 0xffc0ee, 0xb6a2ff, 0xff8fb0];
  const bellGeo = new THREE.SphereGeometry(0.7, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.58);

  for (let i = 0; i < 6; i++) {
    const color = new THREE.Color(jellyColors[i]);
    const phase = Math.random() * 10;
    const bellMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime, uPhase: { value: phase }, uColor: { value: color },
        uFogColor, uFogDensity,
      },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
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
        color, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      })
    );
    core.position.y = 0.18;
    g.add(core);
    const tentacles = [];
    const tentMat = new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, fog: false,
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
    const r = 12 + Math.random() * 60;
    const a = Math.random() * Math.PI * 2;
    g.position.set(Math.cos(a) * r, BOT_Y + Math.random() * (TOP_Y - BOT_Y), Math.sin(a) * r);
    g.scale.setScalar(0.7 + Math.random() * 0.9);
    scene.add(g);
    jellies.push({
      g, core, tentacles, phase,
      drift: new THREE.Vector3((Math.random() - 0.5) * 0.25, 0, (Math.random() - 0.5) * 0.25),
      push: new THREE.Vector3(),
    });
  }

  const tmp = new THREE.Vector3();
  function update(dt, t, state) {
    const { handPos, reachT } = state;
    const handOn = reachT > 0.5;
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
      if (j.g.position.y > TOP_Y) j.g.position.y = BOT_Y;
      if (j.g.position.y < BOT_Y) j.g.position.y = BOT_Y;
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
  }

  return { update };
}
