import * as THREE from "three";
import { SEA_FLOOR } from "./constants";
import { uTime } from "./uniforms";
import { valueNoise2, terrainH, getSandBump, addCaustics, mergeGeos, tg } from "./helpers";

// サンゴ礁 / 岩 / 海藻 / イソギンチャクを構築。
// reefAnchors（サンゴの位置）と anemonePos（クマノミの家）を返す。
export function buildReef(scene) {
  const sandBump = getSandBump();
  const reefAnchors = [];
  const anemonePos = new THREE.Vector3();
  const rng = (a, b) => a + Math.random() * (b - a);

  /* 枝サンゴ */
  function branchCoral() {
    const parts = [];
    function grow(p, dir, len, r, depth) {
      const end = p.clone().add(dir.clone().multiplyScalar(len));
      const c = new THREE.CylinderGeometry(r * 0.7, r, len, 5);
      const mid = p.clone().lerp(end, 0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      c.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
      parts.push(c);
      if (depth <= 0) return;
      const n = 2 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const nd = dir.clone().add(new THREE.Vector3(rng(-0.7, 0.7), rng(0.2, 0.7), rng(-0.7, 0.7))).normalize();
        grow(end, nd, len * rng(0.6, 0.8), r * 0.7, depth - 1);
      }
    }
    grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), rng(0.7, 1.1), rng(0.10, 0.16), 3);
    return mergeGeos(parts);
  }
  /* 脳サンゴ */
  function brainCoral() {
    const g = new THREE.SphereGeometry(rng(0.7, 1.3), 18, 14);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const d = 1 + valueNoise2(x * 3 + 9, z * 3 + y * 3) * 0.16;
      p.setXYZ(i, x * d, Math.max(y, 0) * 0.62 * d, z * d);
    }
    g.computeVertexNormals(); return g;
  }
  /* テーブルサンゴ */
  function tableCoral() {
    return mergeGeos([
      tg(new THREE.CylinderGeometry(0.12, 0.2, rng(0.7, 1.2), 6), 0, 0.5, 0, 0, 0, 0, 1, 1, 1),
      tg(new THREE.CylinderGeometry(rng(1.2, 1.9), rng(1.0, 1.5), 0.16, 14), 0, 1.05, 0, 0, 0, rng(-0.08, 0.08), 1, 1, 1),
    ]);
  }
  /* ウミウチワ */
  function fanCoral() {
    const g = new THREE.PlaneGeometry(rng(1.4, 2.2), rng(1.2, 1.8), 8, 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      p.setZ(i, Math.sin(x * 1.5) * 0.12 + valueNoise2(x * 4, y * 4) * 0.08);
      p.setX(i, x * (0.55 + 0.45 * Math.min(1, (y + 0.9))));
    }
    g.translate(0, 0.8, 0); g.computeVertexNormals(); return g;
  }

  const palettes = [0xc97b8e, 0xa86bb5, 0xd9a05a, 0x8fb98a, 0xc46a55, 0x7e9fc4, 0xd8b4c8];
  const coralKinds = [branchCoral, brainCoral, tableCoral, fanCoral];

  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2, r = rng(7, 110);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = SEA_FLOOR + terrainH(x, z) - 0.05;
    const cluster = new THREE.Group();
    const cnt = 2 + Math.floor(Math.random() * 4);
    for (let k = 0; k < cnt; k++) {
      const geo = coralKinds[Math.floor(Math.random() * coralKinds.length)]();
      const mat = new THREE.MeshPhongMaterial({
        color: palettes[Math.floor(Math.random() * palettes.length)],
        specular: 0x335555, shininess: 24, side: THREE.DoubleSide,
      });
      addCaustics(mat, 0.25);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(rng(-1.6, 1.6), 0, rng(-1.6, 1.6));
      mesh.rotation.y = Math.random() * Math.PI * 2;
      const s = rng(0.7, 1.5); mesh.scale.set(s, s, s);
      cluster.add(mesh);
    }
    cluster.position.set(x, y, z);
    scene.add(cluster);
    reefAnchors.push(new THREE.Vector3(x, y, z));
  }

  /* 岩 */
  const rockMat = new THREE.MeshPhongMaterial({
    color: 0x525e5c, specular: 0x0c0c0c, shininess: 4, bumpMap: sandBump, bumpScale: 0.05,
  });
  addCaustics(rockMat, 0.3);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, r = rng(10, 140);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const g = new THREE.IcosahedronGeometry(rng(0.6, 2.6), 1);
    const p = g.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const d = 1 + valueNoise2(p.getX(j) * 2 + i, p.getZ(j) * 2) * 0.4;
      p.setXYZ(j, p.getX(j) * d, p.getY(j) * 0.7 * d, p.getZ(j) * d);
    }
    g.computeVertexNormals();
    const rock = new THREE.Mesh(g, rockMat);
    rock.position.set(x, SEA_FLOOR + terrainH(x, z) + 0.1, z);
    rock.rotation.y = Math.random() * 7;
    scene.add(rock);
  }

  /* 海藻(揺れる) */
  const weedMat = new THREE.MeshPhongMaterial({
    color: 0x14422a, specular: 0x12301f, shininess: 30, side: THREE.DoubleSide, transparent: true, opacity: 0.95,
  });
  weedMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = ("uniform float uTime;\n" + sh.vertexShader).replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       float wY = clamp(position.y/3.2, 0.0, 1.0);
       float ph = modelMatrix[3].x*1.3 + modelMatrix[3].z*0.7;
       transformed.x += sin(uTime*1.1+ph)*pow(wY,1.6)*0.45;
       transformed.z += cos(uTime*0.8+ph*1.7)*pow(wY,1.6)*0.3;`);
  };
  const weedGeo = new THREE.PlaneGeometry(0.30, 3.2, 1, 12);
  weedGeo.translate(0, 1.6, 0);
  {
    const wp = weedGeo.attributes.position;
    for (let i = 0; i < wp.count; i++) {
      const hy = wp.getY(i) / 3.2;
      wp.setX(i, wp.getX(i) * (1.0 - hy * 0.78));
      wp.setZ(i, Math.sin(hy * 3.2) * 0.08);
    }
    weedGeo.computeVertexNormals();
  }
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2, r = rng(8, 90);
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    for (let k = 0; k < 7; k++) {
      const w = new THREE.Mesh(weedGeo, weedMat);
      const x = cx + rng(-1.4, 1.4), z = cz + rng(-1.4, 1.4);
      w.position.set(x, SEA_FLOOR + terrainH(x, z), z);
      w.rotation.y = Math.random() * 7;
      const s = rng(0.6, 1.3); w.scale.set(s, s * rng(0.7, 1.3), s);
      scene.add(w);
    }
  }

  /* イソギンチャク(クマノミの家) */
  const anemMat = new THREE.MeshPhongMaterial({ color: 0xd49ad6, emissive: 0x331a33, specular: 0x664466, shininess: 40 });
  anemMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = ("uniform float uTime;\n" + sh.vertexShader).replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       float aY = clamp(position.y/0.6,0.0,1.0);
       transformed.x += sin(uTime*1.6+position.x*8.0+position.z*6.0)*aY*0.08;
       transformed.z += cos(uTime*1.3+position.z*8.0)*aY*0.08;`);
  };
  const tents = [];
  for (let i = 0; i < 46; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.42;
    const dir = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
    const cone = new THREE.ConeGeometry(0.045, 0.62, 5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    cone.applyMatrix4(new THREE.Matrix4().compose(
      dir.clone().multiplyScalar(0.34).setY(dir.y * 0.3 + 0.28), q, new THREE.Vector3(1, 1, 1)));
    tents.push(cone);
  }
  const anem = new THREE.Mesh(mergeGeos(tents), anemMat);
  const ax = 6, az = -4, ay = SEA_FLOOR + terrainH(ax, az);
  anem.position.set(ax, ay, az); anem.scale.set(1.4, 1.4, 1.4);
  scene.add(anem);
  anemonePos.set(ax, ay + 0.7, az);

  return { reefAnchors, anemonePos };
}
