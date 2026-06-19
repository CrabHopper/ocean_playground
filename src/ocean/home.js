import * as THREE from "three";
import { colliders } from "./colliders";
import { LAND_Y } from "./ground";

// 自宅：湾岸タワーマンション20階の2LDK。
//  ・地上ロビー ⇄ 20階 をエレベータで移動(かごが実際に昇降)
//  ・室内は LDK + 寝室2 + 玄関ホール。壁・家具に衝突判定。
//  ・大きなベランダから夜景。窓ファサードは夜に点灯。
const HX = 0, HZ = 190;           // タワー中心(自宅側の陸の上)
const HWX = 13, HWZ = 11;         // タワー footprint 半径 → x[-13,13] z[179,201]
const TOWER_H = 72;
const FLOOR_Y = 60;               // 20階の床
const CEIL = 2.7;
const EYE = 1.6;

// 室内の基準(タワー内側 z は内陸ほど大、bay 側=小)
const X0 = -12, X1 = 12, Z0 = 179, Z1 = 201;   // 内壁の内法
const ZP = 191;                                // LDK と 寝室の仕切り
const FY = FLOOR_Y;

function makeFacade() {
  const day = document.createElement("canvas"); day.width = 64; day.height = 64;
  const dx = day.getContext("2d");
  dx.fillStyle = "#6a6f78"; dx.fillRect(0, 0, 64, 64);
  dx.fillStyle = "#50565f"; for (let y = 6; y < 64; y += 12) dx.fillRect(0, y, 64, 7);
  dx.fillStyle = "#3c434c"; for (let x = 5; x < 60; x += 11) for (let y = 1; y < 64; y += 12) dx.fillRect(x, y, 7, 5);
  const ngt = document.createElement("canvas"); ngt.width = 64; ngt.height = 64;
  const nx = ngt.getContext("2d"); nx.fillStyle = "#000"; nx.fillRect(0, 0, 64, 64);
  for (let x = 5; x < 60; x += 11) for (let y = 1; y < 64; y += 12) if (Math.random() < 0.6) {
    nx.fillStyle = "#ffc070"; nx.globalAlpha = 0.4 + Math.random() * 0.6; nx.fillRect(x, y, 7, 5); nx.globalAlpha = 1;
  }
  return { map: new THREE.CanvasTexture(day), emap: new THREE.CanvasTexture(ngt) };
}

export function buildHome(scene) {
  const grp = new THREE.Group(); scene.add(grp);
  const nightMats = [], lamps = [];

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xeae2d4, roughness: 0.9, side: THREE.DoubleSide });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xb89065, roughness: 0.7, side: THREE.DoubleSide });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0xf2efe9, roughness: 0.95, side: THREE.DoubleSide });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xbfe6f0, transparent: true, opacity: 0.16, roughness: 0.1, metalness: 0.1, side: THREE.DoubleSide });
  const sashMat = new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.5, metalness: 0.3 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x9a6f44, roughness: 0.6 });
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x8c93a0, roughness: 0.7 });

  // 可視ボックス(+任意で衝突)
  const vbox = (mat, cx, cy, cz, w, h, d, solid = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(cx, cy, cz); grp.add(m);
    if (solid) colliders.addBox(cx, cy, cz, w / 2, h / 2, d / 2);
    return m;
  };
  // 壁(高さ CEIL, 床 baseY)
  const wall = (cx, cz, w, d, baseY = FY) => vbox(wallMat, cx, baseY + CEIL / 2, cz, w, CEIL, d);

  /* ---------- タワー外観 ---------- */
  const tex = makeFacade();
  for (const tt of [tex.map, tex.emap]) { tt.wrapS = tt.wrapT = THREE.RepeatWrapping; tt.repeat.set(7, 22); }
  const facadeMat = new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.emap, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.8 });
  nightMats.push(facadeMat);
  // 1階(ロビー)はガラスの出入口を見せたいので、外装は地上階の上から始める
  const facBot = LAND_Y + 3.6, facH = TOWER_H - facBot;
  const tower = new THREE.Mesh(new THREE.BoxGeometry(HWX * 2, facH, HWZ * 2), facadeMat);
  tower.position.set(HX, facBot + facH / 2, HZ); grp.add(tower);   // 視覚のみ(室内は内壁で囲う)
  // 各階のベランダ(bay 面)
  for (let f = 3; f < 24; f++) {
    const y = LAND_Y + (f - 1) * 3;
    vbox(slabMat, HX, y, Z0 - 1.3, HWX * 2 - 1, 0.25, 2.4, false);
    vbox(slabMat, HX, y + 0.55, Z0 - 2.4, HWX * 2 - 1, 1.0, 0.08, false);
  }

  /* ====================== 20階 室内 ====================== */
  // 床・天井
  vbox(floorMat, (X0 + X1) / 2, FY - 0.1, (Z0 + Z1) / 2, X1 - X0, 0.2, Z1 - Z0, false);
  vbox(ceilMat, (X0 + X1) / 2, FY + CEIL, (Z0 + Z1) / 2, X1 - X0, 0.2, Z1 - Z0, false);
  colliders.addFloor(X0, Z0, X1, Z1, FY);
  // 側壁・奥壁(内陸 Z1)
  wall(X0, (Z0 + Z1) / 2, 0.2, Z1 - Z0);
  wall(X1, (Z0 + Z1) / 2, 0.2, Z1 - Z0);
  wall((X0 + X1) / 2, Z1, X1 - X0, 0.2);

  // bay 側(z=Z0): ガラス窓 + 中央に掃き出し窓(開口 x[-2,2])
  for (const seg of [[-12, -2], [2, 12]]) {
    const w = seg[1] - seg[0], cx = (seg[0] + seg[1]) / 2;
    vbox(glassMat, cx, FY + CEIL / 2, Z0, w - 0.1, CEIL - 0.2, 0.06);
    colliders.addBox(cx, FY + CEIL / 2, Z0, w / 2, CEIL / 2, 0.1);
    vbox(sashMat, cx, FY + 0.05, Z0, w, 0.1, 0.1, false);
    vbox(sashMat, cx, FY + CEIL - 0.2, Z0, w, 0.12, 0.1, false);
  }
  vbox(sashMat, 0, FY + CEIL - 0.2, Z0, 4.2, 0.12, 0.1, false); // 開口上の枠

  // 仕切り(LDK ↔ 寝室)。z=ZP。寝室Aの戸 x[-8,-6]、寝室Bの戸 x[6,8]、中央 x[-3,3]=ホール入口
  const partSegs = [[-12, -8], [-6, -3], [3, 6], [8, 12]];
  for (const seg of partSegs) wall((seg[0] + seg[1]) / 2, ZP, seg[1] - seg[0], 0.2);
  // ホールの仕切り壁 x=-3, x=3 (z ZP..Z1)
  wall(-3, (ZP + Z1) / 2, 0.2, Z1 - ZP);
  wall(3, (ZP + Z1) / 2, 0.2, Z1 - ZP);

  /* ---------- 玄関ホール + エレベータ(x[-3,3], z[191,201]) ---------- */
  const E = { x0: -1.7, x1: 1.7, z0: 196.5, z1: 200.2 };
  const ecx = (E.x0 + E.x1) / 2, ecz = (E.z0 + E.z1) / 2, ehw = (E.x1 - E.x0) / 2, ehd = (E.z1 - E.z0) / 2;
  // シャフト壁(上下通し) — 扉側(-Z)は開ける
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0x474c54, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide });
  const shaftTopY = FY + CEIL, shaftH = shaftTopY - LAND_Y;
  vbox(shaftMat, E.x1, LAND_Y + shaftH / 2, ecz, 0.2, shaftH, E.z1 - E.z0, true);
  vbox(shaftMat, E.x0, LAND_Y + shaftH / 2, ecz, 0.2, shaftH, E.z1 - E.z0, true);
  vbox(shaftMat, ecx, LAND_Y + shaftH / 2, E.z1, E.x1 - E.x0, shaftH, 0.2, true);

  // かご
  const car = new THREE.Group();
  const carFloor = new THREE.Mesh(new THREE.BoxGeometry(ehw * 2 - 0.1, 0.12, ehd * 2 - 0.1), woodMat); carFloor.position.y = 0.06; car.add(carFloor);
  const carCeil = new THREE.Mesh(new THREE.BoxGeometry(ehw * 2 - 0.1, 0.12, ehd * 2 - 0.1), shaftMat); carCeil.position.y = 2.4; car.add(carCeil);
  const carBack = new THREE.Mesh(new THREE.BoxGeometry(ehw * 2 - 0.1, 2.4, 0.08), shaftMat); carBack.position.set(0, 1.2, ehd - 0.05); car.add(carBack);
  for (const s of [-1, 1]) {
    const cw = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, ehd * 2 - 0.1), shaftMat); cw.position.set(s * (ehw - 0.05), 1.2, 0); car.add(cw);
  }
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x20242a, roughness: 0.4, metalness: 0.5 });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.05), panelMat); panel.position.set(ehw - 0.2, 1.2, -ehd + 0.7); car.add(panel);
  const btnMat = new THREE.MeshStandardMaterial({ color: 0x6fe0ff, emissive: 0x1a5566, emissiveIntensity: 0.6 });
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14), btnMat);
  btn.rotation.z = Math.PI / 2; btn.position.set(ehw - 0.18, 1.25, -ehd + 0.7); car.add(btn);
  const carLight = new THREE.PointLight(0xfff0d8, 0.5, 7); carLight.position.set(0, 2.2, 0); car.add(carLight);
  car.position.set(ecx, FY, ecz); grp.add(car);
  lamps.push({ light: carLight, day: 0.05, night: 0.9 });
  const carFloorCol = colliders.addFloor(E.x0, E.z0, E.x1, E.z1, FY);

  /* ---------- 家具(LDK) ---------- */
  const fabric = new THREE.MeshStandardMaterial({ color: 0xdad3c6, roughness: 0.85 });
  const fabricD = new THREE.MeshStandardMaterial({ color: 0x6b7c8c, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x26292e, roughness: 0.4 });
  const rugMat = new THREE.MeshStandardMaterial({ color: 0xb9b2a6, roughness: 0.95 });
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x3f7d4a, roughness: 0.8 });
  // ラグ
  vbox(rugMat, 4, FY + 0.02, 184.5, 8, 0.04, 5, false);
  // ソファ(bay を背に LDK 中央)
  vbox(fabricD, 4, FY + 0.35, 187.4, 6, 0.7, 1.5);
  vbox(fabricD, 4, FY + 0.8, 188.2, 6, 1.0, 0.4);
  for (const sx of [1.2, 6.8]) vbox(fabricD, sx, FY + 0.55, 187.4, 0.4, 1.0, 1.5);
  // ローテーブル
  vbox(woodMat, 4, FY + 0.22, 184.8, 2.4, 0.4, 1.1);
  // テレビボード + TV(x=12 壁際)
  vbox(woodMat, 10.5, FY + 0.3, 184, 0.6, 0.6, 4.5);
  vbox(dark, 11.2, FY + 1.5, 184, 0.12, 1.5, 3.0, false);
  // ダイニング(左手)
  vbox(woodMat, -7, FY + 0.74, 185.5, 1.6, 0.08, 2.6);
  for (const dz of [-1, 1]) vbox(woodMat, -7, FY + 0.37, 185.5 + dz, 1.5, 0.74, 0.1, false);
  for (const c of [[-8.4, 184.6], [-8.4, 186.4], [-5.6, 184.6], [-5.6, 186.4]]) vbox(fabric, c[0], FY + 0.45, c[1], 0.5, 0.9, 0.5);
  // キッチン(奥・x=12 寄り、LDK内陸側)
  vbox(woodMat, 9.5, FY + 0.48, 189.6, 4.5, 0.95, 0.7);
  vbox(new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.4 }), 4.5, FY + 0.48, 188.8, 2.6, 0.95, 1.1); // アイランド
  // 観葉植物
  for (const pz of [[11, 181.5], [-11, 189]]) {
    vbox(dark, pz[0], FY + 0.25, pz[1], 0.5, 0.5, 0.5);
    vbox(greenMat, pz[0], FY + 1.0, pz[1], 1.0, 1.2, 1.0, false);
  }

  /* ---------- 寝室 ×2 ---------- */
  const bedMat = new THREE.MeshStandardMaterial({ color: 0xcfd6dd, roughness: 0.85 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.7 });
  const mkBed = (cx) => {
    vbox(bedMat, cx, FY + 0.3, 196.5, 4.0, 0.5, 4.0);
    vbox(headMat, cx, FY + 0.75, 198.8, 4.2, 1.0, 0.2);
    vbox(wallMat, cx, FY + 0.55, 195.2, 1.6, 0.25, 0.5, false); // 枕
  };
  mkBed(-7.5);  // 寝室A
  mkBed(7.5);   // 寝室B
  for (const wx of [-11.4, 11.4]) vbox(woodMat, wx, FY + 1.0, 198.5, 0.6, 2.0, 2.4); // クローゼット

  /* ---------- 大きなベランダ ---------- */
  const B = { x0: -10, x1: 10, z0: 173, z1: 179 };
  vbox(slabMat, 0, FY - 0.05, (B.z0 + B.z1) / 2, B.x1 - B.x0, 0.25, B.z1 - B.z0, false);
  colliders.addFloor(B.x0, B.z0, B.x1, B.z1, FY);
  // 手すり(3辺) — 衝突あり(落下防止)
  vbox(glassMat, 0, FY + 0.55, B.z0, B.x1 - B.x0, 1.1, 0.06); colliders.addBox(0, FY + 0.55, B.z0, (B.x1 - B.x0) / 2, 0.55, 0.12);
  for (const sx of [B.x0, B.x1]) { vbox(slabMat, sx, FY + 0.55, (B.z0 + B.z1) / 2, 0.1, 1.1, B.z1 - B.z0); }
  vbox(sashMat, 0, FY + 1.12, B.z0, B.x1 - B.x0 + 0.2, 0.08, 0.12, false);
  // ベランダの椅子とテーブル
  vbox(fabric, -6, FY + 0.35, 176, 0.7, 0.7, 0.7);
  vbox(woodMat, -4.5, FY + 0.3, 176, 0.7, 0.6, 0.7);

  /* ====================== 地上ロビー ====================== */
  const LY = LAND_Y, LH = 3.4;
  const lobMat = new THREE.MeshStandardMaterial({ color: 0x6f6a60, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });
  // 床・天井
  vbox(new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.5 }), HX, LY, HZ, HWX * 2 - 1, 0.2, HWZ * 2 - 1, false);
  colliders.addFloor(X0, Z0, X1, Z1, LY);
  vbox(lobMat, HX, LY + LH, HZ, HWX * 2 - 1, 0.2, HWZ * 2 - 1, false);
  // 側壁・奥壁
  vbox(lobMat, X0, LY + LH / 2, HZ, 0.3, LH, HWZ * 2 - 1);
  vbox(lobMat, X1, LY + LH / 2, HZ, 0.3, LH, HWZ * 2 - 1);
  vbox(lobMat, HX, LY + LH / 2, Z1, HWX * 2 - 1, LH, 0.3);
  // bay 側(z=Z0): 中央に出入口(x[-2.5,2.5])、両脇はガラス
  for (const seg of [[-12, -2.5], [2.5, 12]]) {
    const w = seg[1] - seg[0], cx = (seg[0] + seg[1]) / 2;
    vbox(glassMat, cx, LY + LH / 2, Z0, w - 0.1, LH - 0.2, 0.08);
    colliders.addBox(cx, LY + LH / 2, Z0, w / 2, LH / 2, 0.12);
  }
  const lobLight = new THREE.PointLight(0xfff0d8, 0.4, 30); lobLight.position.set(HX, LY + LH - 0.3, HZ); grp.add(lobLight);
  lamps.push({ light: lobLight, day: 0.1, night: 0.9 });

  /* ---------- 室内灯 ---------- */
  const l1 = new THREE.PointLight(0xffe9c8, 0.35, 26); l1.position.set(4, FY + CEIL - 0.4, 185); grp.add(l1);
  const l2 = new THREE.PointLight(0xffe9c8, 0.25, 20); l2.position.set(-7, FY + CEIL - 0.4, 195); grp.add(l2);
  const l3 = new THREE.PointLight(0xffe9c8, 0.2, 20); l3.position.set(7, FY + CEIL - 0.4, 195); grp.add(l3);
  lamps.push({ light: l1, day: 0.2, night: 0.95 }, { light: l2, day: 0.08, night: 0.8 }, { light: l3, day: 0.08, night: 0.8 });

  const elevator = {
    car, topY: FY, botY: LY, x: ecx, z: ecz, btnMat, floorCol: carFloorCol,
    inZone: (p) => Math.abs(p.x - ecx) < ehw - 0.2 && Math.abs(p.z - ecz) < ehd - 0.2,
  };
  const spawn = { pos: new THREE.Vector3(4, FY + EYE, 184), yaw: 0, pitch: -0.04 };

  function update(dt, t, nT) {
    for (const m of nightMats) m.emissiveIntensity = nT * 1.15;
    for (const l of lamps) l.light.intensity = THREE.MathUtils.lerp(l.day, l.night, nT);
    btnMat.emissiveIntensity = 0.4 + 0.4 * (0.5 + 0.5 * Math.sin(t * 3));
    elevator.floorCol.y = car.position.y;
  }

  return { elevator, spawn, update };
}
