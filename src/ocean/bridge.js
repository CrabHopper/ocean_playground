import * as THREE from "three";
import { SEA_FLOOR } from "./constants";
import { terrainH } from "./helpers";
import { colliders } from "./colliders";
import { LAND_Y, PL } from "./ground";

// レインボーブリッジ(歩いて渡れる)。+Z(自宅側の陸の右)と -Z(ビル群側の陸の左)を
// x=BX で一直線に結ぶ。主塔・主ケーブル・ハンガー・海中の橋脚基礎・両岸スロープ付き。
export const BRIDGE_X = 150;
const BX = BRIDGE_X;
const HW = 7;            // 桁の半幅(x)
const DECK_Y = 20;
const SPAN = PL;         // 桁端 |z| = 176
const RAMP = 30;         // 取付スロープ長
const TOWER_Z = [-70, 70];
const Y_TOP = 60;
const zPlanes = [BX - HW + 0.6, BX + HW - 0.6];

// 歩行面(桁 + 両岸スロープ)
function deckSurfaceY(x, z) {
  if (Math.abs(x - BX) > HW) return null;
  const az = Math.abs(z);
  if (az <= SPAN) return DECK_Y;
  if (az <= SPAN + RAMP) return THREE.MathUtils.lerp(DECK_Y, LAND_Y, (az - SPAN) / RAMP);
  return null;
}

export function buildBridge(scene) {
  const grp = new THREE.Group();
  scene.add(grp);
  colliders.addProvider(deckSurfaceY);

  const steel = new THREE.MeshStandardMaterial({ color: 0x8a3b34, roughness: 0.6, metalness: 0.2 });   // 朱色の鉄塔
  const road = new THREE.MeshStandardMaterial({ color: 0x44494f, roughness: 0.9 });
  const conc = new THREE.MeshStandardMaterial({ color: 0x6b6f74, roughness: 0.95 });
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.5, metalness: 0.4 });

  const box = (w, h, d, m, x, y, z) => {
    const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    me.position.set(x, y, z); grp.add(me); return me;
  };

  /* 桁本体(中央径間) */
  box(HW * 2, 1.6, SPAN * 2, road, BX, DECK_Y - 0.8, 0);
  // 桁下のトラス梁
  box(HW * 2 + 1, 1.2, SPAN * 2, steel, BX, DECK_Y - 1.8, 0);

  /* 取付スロープ(両岸) */
  for (const sgn of [1, -1]) {
    const z0 = sgn * SPAN, z1 = sgn * (SPAN + RAMP);
    const mz = (z0 + z1) / 2;
    const len = Math.hypot(RAMP, DECK_Y - LAND_Y);
    const ramp = box(HW * 2, 1.2, len, road, BX, (DECK_Y + LAND_Y) / 2 - 0.6, mz);
    ramp.rotation.x = sgn * Math.atan2(DECK_Y - LAND_Y, RAMP);
  }

  /* 高欄(両側・桁とスロープ) — 衝突する壁 */
  for (const zx of zPlanes) {
    box(0.3, 1.2, SPAN * 2, steel, zx, DECK_Y + 0.6, 0);
    colliders.addSolid(zx - 0.3, DECK_Y, -SPAN, zx + 0.3, DECK_Y + 1.4, SPAN);
    for (const sgn of [1, -1]) {
      const z0 = sgn * SPAN, z1 = sgn * (SPAN + RAMP);
      const mz = (z0 + z1) / 2, len = Math.hypot(RAMP, DECK_Y - LAND_Y);
      const r = box(0.3, 1.2, len, steel, zx, (DECK_Y + LAND_Y) / 2 + 0.6, mz);
      r.rotation.x = sgn * Math.atan2(DECK_Y - LAND_Y, RAMP);
      colliders.addSolid(zx - 0.3, LAND_Y, sgn * (SPAN + RAMP) - 0.1, zx + 0.3, DECK_Y + 1.4, sgn * SPAN + 0.1);
    }
  }

  /* 主塔(各2脚 + 横梁 + 基礎ケーソン) */
  for (const tz of TOWER_Z) {
    const baseY = SEA_FLOOR + terrainH(BX, tz);
    for (const zx of zPlanes) {
      const h = Y_TOP - baseY;
      box(3.4, h, 3.4, steel, zx, baseY + h / 2, tz);
    }
    for (const by of [DECK_Y + 6, Y_TOP - 7]) box(3.2, 2.4, HW * 2 + 3, steel, BX, by, tz);
    // 海中の基礎(ケーソン)
    box(HW * 2 + 7, 5, HW * 2 + 7, conc, BX, baseY + 2, tz);
    // 塔頂の航空障害灯
    box(1.2, 1.2, 1.2, new THREE.MeshBasicMaterial({ color: 0xff2a1a }), BX, Y_TOP + 1.2, tz);
  }

  /* 海中の橋脚(桁を支える基礎) */
  for (let z = -SPAN + 20; z <= SPAN - 20; z += 26) {
    if (TOWER_Z.some((tz) => Math.abs(z - tz) < 14)) continue;
    const baseY = SEA_FLOOR + terrainH(BX, z);
    const h = DECK_Y - 1.8 - baseY;
    box(5, h, 5, conc, BX, baseY + h / 2, z);
    box(8, 2.5, 8, conc, BX, baseY + 1.2, z);   // フーチング
  }
  // 両岸のアンカレッジ
  for (const sgn of [1, -1]) box(HW * 2 + 8, 14, 16, conc, BX, LAND_Y + 4, sgn * (SPAN + RAMP * 0.5));

  /* 主ケーブル + ハンガー + 夜のライト */
  const lightPos = [], lightCol = [], hsl = new THREE.Color();
  const cableY = (z) => {
    const az = Math.abs(z);
    if (az <= 70) return 30 + (Y_TOP - 30) * (az * az) / (70 * 70);   // 中央径間の放物線
    return THREE.MathUtils.lerp(Y_TOP, 24, Math.min(1, (az - 70) / (SPAN - 70)));  // 側径間
  };
  for (const zx of zPlanes) {
    const pts = [];
    for (let z = -SPAN; z <= SPAN; z += 4) pts.push(new THREE.Vector3(zx, cableY(z), z));
    const curve = new THREE.CatmullRomCurve3(pts);
    grp.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 140, 0.4, 6), cableMat));
    for (let i = 0; i <= 90; i++) {
      const z = -SPAN + (2 * SPAN) * i / 90;
      lightPos.push(zx, cableY(z) + 0.3, z);
      hsl.setHSL((i / 90) * 0.85, 0.85, 0.6);
      lightCol.push(hsl.r, hsl.g, hsl.b);
    }
  }
  // ハンガー(中央径間)
  for (let z = -64; z <= 64; z += 8) {
    for (const zx of zPlanes) {
      const top = cableY(z), h = top - DECK_Y;
      box(0.12, h, 0.12, cableMat, zx, DECK_Y + h / 2, z);
    }
  }
  // 桁縁の白色灯
  for (let i = 0; i <= 100; i++) {
    const z = -SPAN + (2 * SPAN) * i / 100;
    for (const zx of zPlanes) { lightPos.push(zx, DECK_Y + 1.5, z); lightCol.push(0.95, 0.96, 1.0); }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute("position", new THREE.Float32BufferAttribute(lightPos, 3));
  lg.setAttribute("color", new THREE.Float32BufferAttribute(lightCol, 3));
  const lightMat = new THREE.PointsMaterial({
    size: 1.8, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  grp.add(new THREE.Points(lg, lightMat));

  // リスポーン位置(桁の中央付近)
  const spawn = { pos: new THREE.Vector3(BX, DECK_Y + 1.6, 0), yaw: 0, pitch: 0 };

  function setNight(nT) { lightMat.opacity = nT; }
  return { setNight, spawn };
}
