import * as THREE from "three";
import { mergeGeos, tg, getSandBump, addCaustics } from "./helpers";
import { colliders } from "./colliders";
import { LAND_Y, WL, SHORE_X, baseGround } from "./ground";
import { BRIDGE_X } from "./bridge";

// 両岸の陸：+Z=自宅のある住宅街、-Z=ビル群(都心スカイライン)。
// 地面メッシュ・多数のビル(衝突あり)・街灯・観覧車。夜にライトアップ。

// ビルのファサード(以前の city.js と同じ。面ごとに1枚マップ・repeat なし)
function makeFacade() {
  const fc = document.createElement("canvas"); fc.width = 64; fc.height = 128;
  const fx = fc.getContext("2d");
  fx.fillStyle = "#343e48"; fx.fillRect(0, 0, 64, 128);
  const ec = document.createElement("canvas"); ec.width = 64; ec.height = 128;
  const ex = ec.getContext("2d");
  ex.fillStyle = "#000"; ex.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 124; y += 8) for (let x = 4; x < 60; x += 8) {
    fx.fillStyle = Math.random() < 0.5 ? "#28323c" : "#41505c";
    fx.fillRect(x, y, 5, 5);
    if (Math.random() < 0.55) {
      ex.fillStyle = Math.random() < 0.72 ? "#ffb45e" : "#cfe2ff";
      ex.globalAlpha = 0.35 + Math.random() * 0.65;
      ex.fillRect(x, y, 5, 5); ex.globalAlpha = 1;
    }
  }
  return { map: new THREE.CanvasTexture(fc), emissiveMap: new THREE.CanvasTexture(ec) };
}

export function buildDistricts(scene) {
  const sandBump = getSandBump();
  const nightMats = [];
  const TEX = makeFacade();
  // 全ビル共通の1マテリアル(面ごとにテクスチャ1枚 = 以前の見た目)
  const facadeMat = new THREE.MeshStandardMaterial({
    map: TEX.map, emissiveMap: TEX.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0,
    roughness: 0.85, metalness: 0.05,
  });
  nightMats.push(facadeMat);
  const buildingMat = () => facadeMat;

  /* ---------- 地面メッシュ(両岸) ---------- */
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xb9a987, roughness: 0.96, bumpMap: sandBump, bumpScale: 0.04 });
  addCaustics(groundMat, 0.3);
  const urbanMat = new THREE.MeshStandardMaterial({ color: 0x6b6e72, roughness: 0.92 });
  for (const sgn of [1, -1]) {
    const g = new THREE.PlaneGeometry(SHORE_X * 2 + 40, 220, 120, 70);
    g.rotateX(-Math.PI / 2);
    const cz = sgn * (WL + 70);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i) + cz;
      p.setX(i, x); p.setZ(i, z); p.setY(i, baseGround(x, z));
    }
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, groundMat));
    // 平地の舗装(内陸側、海抜上)
    const pave = new THREE.PlaneGeometry(SHORE_X * 2 + 40, 150);
    pave.rotateX(-Math.PI / 2);
    const pv = new THREE.Mesh(pave, urbanMat);
    pv.position.set(0, LAND_Y + 0.02, sgn * (WL + 130));
    scene.add(pv);
  }

  /* ---------- ビル群 ---------- */
  const okBuild = (x, z) => {
    if (Math.abs(x - BRIDGE_X) < 22) return false;                 // 橋の通り道
    if (z > 0 && Math.abs(x) < 30 && z < 240) return false;        // 自宅前のプロムナード
    return true;
  };
  const addTower = (x, z, w, h, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMat(Math.max(w, d), h));
    m.position.set(x, h / 2 - 1, z);
    m.rotation.y = (Math.random() - 0.5) * 0.1;
    scene.add(m);
    colliders.addBox(x, (h - 1) / 2, z, w / 2 + 0.2, (h + 1) / 2, d / 2 + 0.2);
    // 屋上の点滅灯(高層)
    if (h > 50) topBeacons.push(x, h + 1, z);
  };
  const topBeacons = [];

  // 自宅側(住宅街・中低層〜タワマン)
  for (let row = 0; row < 5; row++) {
    const z = 188 + row * 26 + Math.random() * 6;
    for (let x = -SHORE_X + 30; x < SHORE_X - 30; x += 24 + Math.random() * 16) {
      const xx = x + (Math.random() - 0.5) * 8;
      if (!okBuild(xx, z)) continue;
      const w = 9 + Math.random() * 12, d = 9 + Math.random() * 12;
      const h = 16 + Math.pow(Math.random(), 1.5) * (row < 2 ? 55 : 90);
      addTower(xx, z, w, h, d);
    }
  }
  // ビル群側(都心・高層)
  for (let row = 0; row < 6; row++) {
    const z = -188 - row * 26 - Math.random() * 6;
    for (let x = -SHORE_X + 30; x < SHORE_X - 30; x += 22 + Math.random() * 14) {
      const xx = x + (Math.random() - 0.5) * 8;
      if (Math.abs(xx - BRIDGE_X) < 22) continue;
      const w = 9 + Math.random() * 15, d = 9 + Math.random() * 15;
      const h = 24 + Math.pow(Math.random(), 1.4) * 96;
      addTower(xx, z, w, h, d);
    }
  }

  /* ---------- 街灯(両岸のプロムナード) ---------- */
  const slPos = [], slCol = [];
  for (const sgn of [1, -1]) {
    for (let x = -SHORE_X + 20; x < SHORE_X - 20; x += 12) {
      const z = sgn * (WL + 4);
      slPos.push(x, LAND_Y + 5, z);
      const warm = Math.random() < 0.8;
      slCol.push(warm ? 1.0 : 0.7, warm ? 0.66 : 0.85, warm ? 0.32 : 1.0);
    }
  }
  const slG = new THREE.BufferGeometry();
  slG.setAttribute("position", new THREE.Float32BufferAttribute(slPos, 3));
  slG.setAttribute("color", new THREE.Float32BufferAttribute(slCol, 3));
  const streetMat = new THREE.PointsMaterial({ size: 2.4, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  scene.add(new THREE.Points(slG, streetMat));

  const bcG = new THREE.BufferGeometry();
  bcG.setAttribute("position", new THREE.Float32BufferAttribute(topBeacons, 3));
  const beaconMat = new THREE.PointsMaterial({ size: 2.6, color: 0xff2418, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  scene.add(new THREE.Points(bcG, beaconMat));

  /* ---------- 大観覧車(ビル群側) ---------- */
  const bMat = new THREE.MeshStandardMaterial({ color: 0x47525e, roughness: 0.6, metalness: 0.3 });
  const wheel = new THREE.Group();
  wheel.position.set(-210, 33, -200);
  wheel.lookAt(0, 33, 0);
  const wheelSpin = new THREE.Group();
  wheelSpin.add(new THREE.Mesh(new THREE.TorusGeometry(27, 0.9, 8, 44), bMat));
  const spokes = [];
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    spokes.push(tg(new THREE.CylinderGeometry(0.35, 0.35, 27, 4), Math.cos(a) * 13.5, Math.sin(a) * 13.5, 0, 0, 0, a + Math.PI / 2, 1, 1, 1));
  }
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2 + 0.26;
    spokes.push(tg(new THREE.BoxGeometry(2.4, 2.8, 2.4), Math.cos(a) * 27, Math.sin(a) * 27, 0, 0, 0, 0, 1, 1, 1));
  }
  wheelSpin.add(new THREE.Mesh(mergeGeos(spokes), bMat));
  const wlPos = [], wlCol = [], wc = new THREE.Color();
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * Math.PI * 2;
    wlPos.push(Math.cos(a) * 27, Math.sin(a) * 27, 0.5);
    wc.setHSL(i / 48, 0.9, 0.6); wlCol.push(wc.r, wc.g, wc.b);
  }
  const wlG = new THREE.BufferGeometry();
  wlG.setAttribute("position", new THREE.Float32BufferAttribute(wlPos, 3));
  wlG.setAttribute("color", new THREE.Float32BufferAttribute(wlCol, 3));
  const wheelLightsMat = new THREE.PointsMaterial({ size: 2.8, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  wheelSpin.add(new THREE.Points(wlG, wheelLightsMat));
  wheel.add(wheelSpin);
  [-1, 1].forEach((s) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.4, 40, 6), bMat);
    leg.position.set(s * 9, -18, 0); leg.rotation.z = s * 0.26; wheel.add(leg);
  });
  scene.add(wheel);

  function update(dt, t, nT) {
    for (const m of nightMats) m.emissiveIntensity = nT * 1.15;
    streetMat.opacity = nT;
    wheelLightsMat.opacity = nT;
    beaconMat.opacity = nT * (Math.sin(t * 2.4) > 0 ? 1.0 : 0.12);
    wheelSpin.rotation.z += dt * 0.03;
  }
  return { update };
}
