import * as THREE from "three";
import { SEA_FLOOR } from "./constants";
import { terrainH } from "./helpers";
import { colliders } from "./colliders";

// 海(中央の湾)を挟んで +Z 側=自宅のある陸、-Z 側=ビル群の陸。
// 陸は x 方向に広い帯。海岸線(汀線)から内陸へ向けてなだらかに+LAND_Yまで上がる。
export const LAND_Y = 3;       // 陸の平地の高さ
export const WL = 150;         // 汀線 |z|
export const PL = 176;         // 平地が始まる |z|
export const SHORE_X = 320;    // 陸の x 方向の広がり(±)

// |z| から陸の高さ。汀線より内側は海中の前浜(海底へ向かう斜面)。
function shoreTop(az) {
  if (az >= PL) return LAND_Y;
  if (az >= WL) return THREE.MathUtils.lerp(0.4, LAND_Y, THREE.MathUtils.smoothstep(az, WL, PL));
  return 0.4 - (WL - az) * 0.55; // 海中の前浜
}

// 衝突・地形の土台(海底 と 陸 のうち高い方)
export function baseGround(x, z) {
  const sea = SEA_FLOOR + terrainH(x, z);
  const az = Math.abs(z);
  let land = -1e9;
  if (az >= WL - 34 && Math.abs(x) <= SHORE_X + 20) land = shoreTop(az);
  return Math.max(sea, land);
}

// 歩行時の地面(段差ゲートつき)
export function groundAt(x, z, curY) {
  return colliders.groundAt(x, z, curY, baseGround);
}

export const shoreTopFn = shoreTop;
