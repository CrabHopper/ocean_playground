import * as THREE from "three";
import { SEA_FLOOR } from "./constants";
import { uTime } from "./uniforms";
import { terrainH, getSandBump, addCaustics, mergeGeos, tg } from "./helpers";

// 海をにぎやかにする追加要素：海草の群生 / ウニ / ヒトデ / シャコ貝 /
// 沈んだ鳥居 / 沈船 / 錨 / 群れ(ベイトボール) / ゆったり泳ぐ大型魚。
export function buildExtras(scene, { reefAnchors }) {
  const sandBump = getSandBump();
  const floorY = (x, z) => SEA_FLOOR + terrainH(x, z);
  const updaters = [];

  /* ---------- 海草の群生(揺れる) ---------- */
  {
    const mat = new THREE.MeshPhongMaterial({ color: 0x2e6b3a, shininess: 18, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = ("uniform float uTime;\n" + sh.vertexShader).replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         float wY = clamp(position.y/1.6, 0.0, 1.0);
         float ph = modelMatrix[3].x*1.7 + modelMatrix[3].z*1.1;
         transformed.x += sin(uTime*1.5+ph)*pow(wY,1.6)*0.30;
         transformed.z += cos(uTime*1.2+ph*1.4)*pow(wY,1.6)*0.22;`);
    };
    const blade = new THREE.PlaneGeometry(0.12, 1.6, 1, 5);
    blade.translate(0, 0.8, 0);
    for (let c = 0; c < 26; c++) {
      const cx = (Math.random() - 0.5) * 150, cz = (Math.random() - 0.5) * 150;
      const n = 12 + Math.floor(Math.random() * 16);
      for (let i = 0; i < n; i++) {
        const x = cx + (Math.random() - 0.5) * 4, z = cz + (Math.random() - 0.5) * 4;
        const m = new THREE.Mesh(blade, mat);
        m.position.set(x, floorY(x, z), z);
        m.rotation.y = Math.random() * Math.PI;
        m.scale.setScalar(0.7 + Math.random() * 1.1);
        scene.add(m);
      }
    }
  }

  /* ---------- ウニ ---------- */
  {
    const body = new THREE.SphereGeometry(0.22, 10, 8);
    const parts = [body];
    for (let i = 0; i < 40; i++) {
      const v = new THREE.Vector3().randomDirection();
      const spike = new THREE.ConeGeometry(0.02, 0.28, 4);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      spike.applyMatrix4(new THREE.Matrix4().compose(v.clone().multiplyScalar(0.28), q, new THREE.Vector3(1, 1, 1)));
      parts.push(spike);
    }
    const geo = mergeGeos(parts);
    const mat = new THREE.MeshPhongMaterial({ color: 0x2a2030, shininess: 30 });
    addCaustics(mat, 0.15);
    for (let i = 0; i < 24; i++) {
      const a = reefAnchors[i % reefAnchors.length];
      const x = a.x + (Math.random() - 0.5) * 8, z = a.z + (Math.random() - 0.5) * 8;
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, floorY(x, z) + 0.1, z);
      m.scale.setScalar(0.6 + Math.random() * 0.8);
      scene.add(m);
    }
  }

  /* ---------- ヒトデ ---------- */
  {
    const starColors = [0xe76f51, 0x9b5de5, 0xf4a261, 0xef476f];
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: starColors[i % starColors.length], roughness: 0.85 });
      addCaustics(mat, 0.18);
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), mat));
      for (let a = 0; a < 5; a++) {
        const arm = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat);
        arm.scale.set(1, 0.35, 3.4);
        const ang = (a / 5) * Math.PI * 2;
        arm.position.set(Math.cos(ang) * 0.18, 0, Math.sin(ang) * 0.18);
        arm.rotation.y = -ang + Math.PI / 2;
        g.add(arm);
      }
      const x = (Math.random() - 0.5) * 150, z = (Math.random() - 0.5) * 150;
      g.position.set(x, floorY(x, z) + 0.05, z);
      g.scale.setScalar(0.7 + Math.random() * 0.8);
      g.rotation.y = Math.random() * 6;
      scene.add(g);
    }
  }

  /* ---------- シャコ貝 ---------- */
  {
    const shellMat = new THREE.MeshPhongMaterial({ color: 0xd8d0c0, shininess: 30, side: THREE.DoubleSide });
    const lipMat = new THREE.MeshStandardMaterial({ color: 0x2bb6c4, emissive: 0x0a3a44, emissiveIntensity: 0.3, roughness: 0.5 });
    for (let i = 0; i < 8; i++) {
      const a = reefAnchors[(i * 2) % reefAnchors.length];
      const x = a.x + (Math.random() - 0.5) * 7, z = a.z + (Math.random() - 0.5) * 7;
      const g = new THREE.Group();
      for (const s of [-1, 1]) {
        const half = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI), shellMat);
        half.scale.set(1, 0.55, 1);
        half.rotation.z = s * 0.5; half.rotation.x = -Math.PI / 2;
        half.position.y = 0.2; g.add(half);
      }
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.07, 6, 16), lipMat);
      lip.rotation.x = Math.PI / 2; lip.position.y = 0.28; g.add(lip);
      g.position.set(x, floorY(x, z), z);
      g.scale.setScalar(0.8 + Math.random() * 0.9);
      g.rotation.y = Math.random() * 6;
      scene.add(g);
    }
  }

  /* ---------- 沈んだ鳥居 ---------- */
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0xb13a2e, roughness: 0.8 });
    addCaustics(mat, 0.2);
    const g = new THREE.Group();
    const pillarH = 6;
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, pillarH, 10), mat);
      p.position.set(s * 2.4, pillarH / 2, 0); g.add(p);
    }
    const kasagi = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.5, 0.7), mat);
    kasagi.position.y = pillarH + 0.1; kasagi.rotation.z = 0.02; g.add(kasagi);
    const shimaki = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.35, 0.55), mat);
    shimaki.position.y = pillarH - 0.5; g.add(shimaki);
    const nuki = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.35, 0.4), mat);
    nuki.position.y = pillarH - 1.7; g.add(nuki);
    const tx = -34, tz = 30;
    g.position.set(tx, floorY(tx, tz), tz);
    g.rotation.set(0.08, 0.6, 0.05);
    scene.add(g);
  }

  /* ---------- 沈船 ---------- */
  {
    const hullMat = new THREE.MeshPhongMaterial({ color: 0x4a3d2e, shininess: 8, bumpMap: sandBump, bumpScale: 0.05 });
    addCaustics(hullMat, 0.22);
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 1.6, 16, 12, 1, false, 0, Math.PI), hullMat);
    hull.rotation.z = Math.PI / 2; hull.rotation.x = Math.PI; g.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(16, 0.3, 4.6), hullMat); deck.position.y = 0; g.add(deck);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(4, 2.2, 3), hullMat); cabin.position.set(-2, 1.2, 0); g.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 9, 8), hullMat);
    mast.position.set(3, 3, 0); mast.rotation.z = 0.5; g.add(mast);
    const wx = 40, wz = 44;
    g.position.set(wx, floorY(wx, wz) + 1.4, wz);
    g.rotation.set(0.12, -0.7, 0.18);
    g.scale.setScalar(1.2);
    scene.add(g);

    /* 錨 */
    const aMat = new THREE.MeshStandardMaterial({ color: 0x40454c, roughness: 0.7, metalness: 0.4 });
    addCaustics(aMat, 0.15);
    const an = new THREE.Group();
    const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 8), aMat); an.add(shank);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.1, 8, 16), aMat); ring.position.y = 1.6; an.add(ring);
    const stock = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2, 8), aMat); stock.rotation.z = Math.PI / 2; stock.position.y = 1.1; an.add(stock);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.05, 1.4, 6), aMat);
      arm.position.set(s * 0.6, -1.3, 0); arm.rotation.z = s * 1.0; an.add(arm);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 4), aMat);
      fl.position.set(s * 1.1, -1.7, 0); fl.rotation.z = s * 1.0; an.add(fl);
    }
    const ax = wx + 7, az = wz + 5;
    an.position.set(ax, floorY(ax, az) + 0.3, az);
    an.rotation.set(1.3, 0.5, 0.2);
    scene.add(an);
  }

  /* ---------- ベイトボール(小魚の群れ) ---------- */
  {
    const N = 160;
    const geo = new THREE.SphereGeometry(0.12, 6, 5); geo.scale(0.5, 0.7, 1.6);
    const mat = new THREE.MeshStandardMaterial({ color: 0xb9c6cf, metalness: 0.5, roughness: 0.4 });
    addCaustics(mat, 0.2);
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    const fishD = [];
    for (let i = 0; i < N; i++) {
      fishD.push({ r: 2 + Math.random() * 4, a: Math.random() * 6.28, b: Math.random() * 6.28, sp: 0.6 + Math.random() * 0.8, yo: (Math.random() - 0.5) * 5 });
    }
    const center = new THREE.Vector3();
    const dummy = new THREE.Object3D();
    const tmp = new THREE.Vector3();
    updaters.push((dt, t) => {
      center.set(Math.sin(t * 0.08) * 30, -8 + Math.sin(t * 0.05) * 4, -20 + Math.cos(t * 0.07) * 28);
      for (let i = 0; i < N; i++) {
        const f = fishD[i];
        f.a += f.sp * dt; f.b += f.sp * 0.7 * dt;
        const x = center.x + Math.cos(f.a) * f.r;
        const y = center.y + Math.sin(f.b) * 1.5 + f.yo;
        const z = center.z + Math.sin(f.a) * f.r * Math.cos(f.b);
        tmp.set(x, y, z);
        dummy.position.copy(tmp);
        dummy.lookAt(center.x + Math.cos(f.a + 0.1) * f.r, y, center.z + Math.sin(f.a + 0.1) * f.r);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  /* ---------- ゆったり泳ぐ大型魚(ハタ) ×3 ---------- */
  {
    const body = new THREE.SphereGeometry(0.9, 14, 10); tg(body, 0, 0, 0, 0, 0, 0, 0.55, 0.7, 1.5);
    const tail = new THREE.PlaneGeometry(0.1, 0.8); tail.rotateY(Math.PI / 2); tail.translate(0, 0, -1.5);
    const geo = mergeGeos([body, tail]);
    const groupers = [];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshPhongMaterial({ color: 0x6b5a48, shininess: 30, side: THREE.DoubleSide });
      addCaustics(mat, 0.2);
      const m = new THREE.Mesh(geo, mat);
      m.scale.setScalar(1 + Math.random());
      scene.add(m);
      groupers.push({ m, r: 18 + i * 10, a: Math.random() * 6.28, sp: 0.05 + Math.random() * 0.03, y: -12 - Math.random() * 5, seed: Math.random() * 9 });
    }
    updaters.push((dt, t) => {
      groupers.forEach((g) => {
        g.a += g.sp * dt * 6;
        const x = Math.cos(g.a) * g.r, z = Math.sin(g.a) * g.r;
        const y = g.y + Math.sin(t * 0.4 + g.seed) * 1.2;
        g.m.position.set(x, y, z);
        g.m.lookAt(Math.cos(g.a + 0.08) * g.r, y, Math.sin(g.a + 0.08) * g.r);
      });
    });
  }

  function update(dt, t) {
    for (const u of updaters) u(dt, t);
  }
  return { update };
}
