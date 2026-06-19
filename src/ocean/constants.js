import * as THREE from "three";

// 海底の深さ・太陽方向・街(湾岸)の方向。シーン全体で共有する座標系の基準。
export const SEA_FLOOR = -22;
export const SUN_DIR = new THREE.Vector3(0.32, 0.86, 0.22).normalize();
export const CITY_DIR = new THREE.Vector3(-0.24942, 0, -0.96839);
